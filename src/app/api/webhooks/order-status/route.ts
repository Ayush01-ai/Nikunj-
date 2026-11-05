import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { notifyOrder } from '@/backend/lib/orderNotify';
import { alertOwnerOrderIssue } from '@/backend/lib/ownerAlert';
import { ORDER_ID_PATTERN } from '@/backend/lib/orderAccess';
import { ensureDeliveryCode, OUT_FOR_DELIVERY } from '@/backend/lib/delivery';
import { notifyCustomerOrderConfirmed } from '@/backend/lib/sanityOrders';
import { cancelShiprocketForOrder } from '@/backend/lib/shiprocketFulfilment';
import { buildMongoStatusUpdate, type SanityStatusInput } from '@/backend/lib/orderStatusSync';
import { connectDB } from '@/backend/lib/mongodb';
import { Order, type IOrder } from '@/backend/models/Order';

/**
 * Sanity GROQ webhook: notifies the customer (on the channel chosen at order time) whenever the owner changes an order's status in Studio.
 * Configure in sanity.io/manage → API → Webhooks:
 *   URL: {SITE_URL}/api/webhooks/order-status   Trigger: Update   Filter: _type == "order" && delta::changedAny(status)
 *  Projection: {orderNumber, status, customerName, phone, total, paymentStatus, paymentMethod, tracking, items}
 *  (the same webhook also mirrors status, COD-delivered → paid, and courier/tracking into MongoDB, and cancels an un-shipped Shiprocket order)
 *   HTTP header: x-webhook-secret = SANITY_WEBHOOK_SECRET
 */
const NOTIFY_STATUSES = new Set(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'return_approved', 'returned', 'refunded']);

/** Mirrors the owner's Studio decision (status, payment, courier/tracking) onto the website copy so customer pages agree even if Sanity is briefly unreachable. */
async function syncMongo(order: { orderNumber: string; status?: unknown; paymentStatus?: unknown; tracking?: SanityStatusInput['tracking'] }): Promise<IOrder | null> {
  const orderId = order.orderNumber;
  await connectDB();
  const current = await Order.findOne({ orderId }).lean<IOrder>();
  if (!current) return null;
  const set = buildMongoStatusUpdate(order, current);
  if (!Object.keys(set).length) return current;
  return Order.findOneAndUpdate({ orderId }, { $set: set }, { new: true }).lean<IOrder>();
}

function validSecret(given: string | null) {
  const expected = process.env.SANITY_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!validSecret(req.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const order = await req.json().catch(() => null);
  if (!order?.orderNumber || !ORDER_ID_PATTERN.test(String(order.orderNumber))) {
    return NextResponse.json({ success: true, skipped: true });
  }
  const mongoOrder = await syncMongo({ ...order, orderNumber: String(order.orderNumber) }).catch(async (err: unknown) => {
    console.error('[order-status] mongo sync', order.orderNumber, err instanceof Error ? err.message : err);
    await alertOwnerOrderIssue({
      orderNumber: String(order.orderNumber),
      stage: 'mongo_sync_failed',
      reason: `Sanity to Mongo status sync failed (status ${String(order.status)}). Run the sync script or re-save the order.`,
      customerName: order.customerName,
      phone: order.phone,
      total: order.total,
    });
    return null;
  });
  if (order.paymentStatus === 'refund_due') {
    await alertOwnerOrderIssue({
      orderNumber: String(order.orderNumber),
      stage: 'refund_due',
      reason: `Refund due: order is ${String(order.status)} and was paid. Refund the customer.`,
      customerName: order.customerName,
      phone: order.phone,
      total: order.total,
    });
  }
  // paymentStatus-only changes also reach this route, so only cancel a parcel that is still booked.
  if (order.status === 'cancelled' && mongoOrder?.shiprocketOrderId) await cancelShiprocketForOrder(String(order.orderNumber)).catch(() => undefined);
  if (!NOTIFY_STATUSES.has(order.status)) return NextResponse.json({ success: true, skipped: true });
  if (order.status === 'confirmed') {
    // Manual-UPI orders reach "confirmed" only when the owner verifies payment; send the full confirmation once
    // (COD orders already used the same idempotency key at checkout, so they are not messaged twice).
    // This also books the parcel on Shiprocket (idempotent).
    if (mongoOrder) await notifyCustomerOrderConfirmed(mongoOrder);
    return NextResponse.json({ success: true });
  }
  // Parcels booked on Shiprocket are handed to the courier, so the doorstep-OTP code is only for own-rider orders.
  if (OUT_FOR_DELIVERY.has(order.status) && !mongoOrder?.shiprocketOrderId) {
    // Generate the doorstep code before the "shipped" message; a WhatsApp/Sanity hiccup must not block notifications.
    await ensureDeliveryCode(String(order.orderNumber)).catch((err: unknown) =>
      console.error('[order-status] delivery code', order.orderNumber, err instanceof Error ? err.message : err));
  }
  // Destination is the verified contact snapshotted on the order, not the phone in the Sanity payload.
  const result = await notifyOrder(String(order.orderNumber), { ...order, orderNumber: String(order.orderNumber), phone: undefined });
  if (!result.sent && result.reason === 'duplicate') return NextResponse.json({ success: true, duplicate: true });
  return NextResponse.json({ success: result.sent, ...(result.sent ? { channel: result.channel } : { skipped: result.reason }) });
}
