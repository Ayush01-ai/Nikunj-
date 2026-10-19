import { fetchCashfreeOrder, fetchCashfreeOrderPayments } from '@/backend/lib/cashfree';
import { Order, type IOrder } from '@/backend/models/Order';
import { pushConfirmedOrderToSanity } from '@/backend/lib/sanityOrders';

export type CashfreeSettlement =
  /** This call confirmed the order (stock + notification ran exactly once, here). */
  | { state: 'paid' }
  /** Already paid — by an earlier verify, the webhook, or a concurrent request. */
  | { state: 'already_paid' }
  /** Cashfree has no final result yet (order ACTIVE, payment not attempted or still processing). */
  | { state: 'pending' }
  /** The latest attempt failed / was dropped, or the Cashfree order expired / was terminated. */
  | { state: 'failed' }
  /** Cashfree's data does not match our order (id, amount or currency) — never marked paid. */
  | { state: 'mismatch' }
  /** No Cashfree order was ever created for this order. */
  | { state: 'no_payment' };

const AMOUNT_TOLERANCE = 0.01;
const amountMatches = (received: unknown, expected: number) =>
  typeof received === 'number' && Number.isFinite(received) && Math.abs(received - expected) < AMOUNT_TOLERANCE;

/**
 * Re-derives an order's payment state from Cashfree's API using our secret key — the browser
 * (modal close, return_url redirect) is never treated as proof of payment.
 *
 * An order is marked paid only when ALL of these hold:
 *   - Cashfree's order_id equals the cashfreeOrderId we stored when creating the session;
 *   - Cashfree's order_amount equals our server-computed order.total and order_currency is INR;
 *   - Cashfree's order_status is PAID;
 *   - a payment with payment_status SUCCESS exists for that order with the same amount in INR.
 *
 * The final write is guarded by `paymentStatus: { $ne: 'paid' }`, so a concurrent webhook,
 * a double-clicked verify or a page refresh can confirm the order (and run the Sanity
 * stock decrement + customer notification) at most once.
 */
export async function settleCashfreeOrder(order: IOrder, note: string): Promise<CashfreeSettlement> {
  if (order.paymentStatus === 'paid') return { state: 'already_paid' };
  if (!order.cashfreeOrderId) return { state: 'no_payment' };

  const cfOrder = await fetchCashfreeOrder(order.cashfreeOrderId);
  if (
    cfOrder?.order_id !== order.cashfreeOrderId ||
    cfOrder.order_currency !== 'INR' ||
    !amountMatches(cfOrder.order_amount, order.total)
  ) {
    console.error('[cashfree/settle] Cashfree order does not match local order', order.orderId, {
      expectedAmount: order.total,
      receivedAmount: cfOrder?.order_amount,
      receivedCurrency: cfOrder?.order_currency,
      orderIdMatches: cfOrder?.order_id === order.cashfreeOrderId,
    });
    return { state: 'mismatch' };
  }

  if (cfOrder.order_status === 'EXPIRED' || cfOrder.order_status === 'TERMINATED') {
    await markFailed(order);
    return { state: 'failed' };
  }

  const payments = (await fetchCashfreeOrderPayments(order.cashfreeOrderId)) ?? [];

  if (cfOrder.order_status !== 'PAID') {
    // ACTIVE (or TERMINATION_REQUESTED): the order can still be paid. Report the latest
    // attempt's outcome so the UI can offer a retry, but never confirm anything here.
    const latest = [...payments].sort((a, b) =>
      String(b.payment_time ?? '').localeCompare(String(a.payment_time ?? '')),
    )[0];
    const status = latest?.payment_status as string | undefined;
    if (status === 'FAILED' || status === 'USER_DROPPED' || status === 'CANCELLED' || status === 'VOID') {
      await markFailed(order);
      return { state: 'failed' };
    }
    return { state: 'pending' };
  }

  const successful = payments.find(
    (p) =>
      (p.payment_status as string | undefined) === 'SUCCESS' &&
      (p.order_id === undefined || p.order_id === order.cashfreeOrderId) &&
      amountMatches(p.payment_amount, order.total) &&
      p.payment_currency === 'INR' &&
      p.cf_payment_id !== undefined &&
      p.cf_payment_id !== null,
  );
  if (!successful) {
    console.error('[cashfree/settle] Order is PAID at Cashfree but no matching SUCCESS payment', order.orderId);
    return { state: 'mismatch' };
  }

  const confirmed = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $ne: 'paid' } },
    {
      paymentStatus: 'paid',
      status: 'confirmed',
      paymentGateway: 'cashfree',
      cashfreePaymentId: String(successful.cf_payment_id),
    },
    { new: true },
  );
  if (!confirmed) return { state: 'already_paid' };

  await pushConfirmedOrderToSanity(confirmed, note);
  return { state: 'paid' };
}

/** Only a still-pending order is flipped to failed; a paid order is never touched. */
async function markFailed(order: IOrder) {
  if (order.paymentStatus !== 'pending') return;
  await Order.findOneAndUpdate({ _id: order._id, paymentStatus: 'pending' }, { paymentStatus: 'failed' });
}
