import { NextRequest, NextResponse } from 'next/server';
import { verifyCashfreeWebhookSignature } from '@/backend/lib/cashfree';
import { isCashfreeConfigured } from '@/backend/lib/cashfreeConfig';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { pushConfirmedOrderToSanity } from '@/backend/lib/sanityOrders';

interface CashfreeWebhookPayload {
  type?: string;
  data?: {
    order?: { order_id?: string; order_amount?: number; order_currency?: string };
    payment?: {
      cf_payment_id?: string | number;
      payment_status?: string;
      payment_amount?: number;
      payment_currency?: string;
    };
  };
}

/**
 * Cashfree server-to-server webhook. Mirrors /api/payment/webhook (Razorpay) in its
 * idempotency/amount-matching rules — only the signature scheme and payload shape differ.
 * The signature is HMAC-SHA256 over `timestamp + raw body`, keyed by CASHFREE_SECRET_KEY
 * (Cashfree does not issue a separate webhook secret).
 *
 * Configure https://<your-domain>/api/payment/cashfree/webhook in the Cashfree Dashboard →
 * Developers → Webhooks (separately for Test and Production), subscribed to
 * "PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_FAILED_WEBHOOK" and "PAYMENT_USER_DROPPED_WEBHOOK".
 */
export async function POST(req: NextRequest) {
  try {
    if (!isCashfreeConfigured()) {
      console.error('[payment/cashfree/webhook] Cashfree is not configured');
      return NextResponse.json({ success: false, error: 'Webhook not configured.' }, { status: 500 });
    }

    // The signature is computed over timestamp + exact raw body, so it must be read as text.
    const rawBody = await req.text();
    const signature = req.headers.get('x-webhook-signature');
    const timestamp = req.headers.get('x-webhook-timestamp');

    if (!signature || !timestamp) {
      return NextResponse.json({ success: false, error: 'Missing signature headers.' }, { status: 401 });
    }

    // Enforce 5-minute replay tolerance for webhooks outside unit tests
    if (process.env.NODE_ENV !== 'test') {
      let ts = Number(timestamp);
      if (!Number.isFinite(ts)) {
        return NextResponse.json({ success: false, error: 'Invalid timestamp.' }, { status: 401 });
      }
      if (ts < 1e11) ts *= 1000;
      if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
        return NextResponse.json({ success: false, error: 'Webhook timestamp expired.' }, { status: 401 });
      }
    }

    let verified;
    try {
      verified = verifyCashfreeWebhookSignature(signature, rawBody, timestamp);
    } catch (err) {
      console.warn('[payment/cashfree/webhook] Invalid webhook signature:', err instanceof Error ? err.message : 'unknown');
      return NextResponse.json({ success: false, error: 'Invalid signature.' }, { status: 401 });
    }

    const event = verified.object as CashfreeWebhookPayload;
    const eventType = event.type;

    await connectDB();

    // A dropped/failed payment only flips a still-pending order to failed — it never
    // touches an order that's already paid, and never syncs to Sanity.
    if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'PAYMENT_USER_DROPPED_WEBHOOK') {
      const failedOrderId = event.data?.order?.order_id;
      if (!failedOrderId) {
        return NextResponse.json({ success: false, error: 'Malformed webhook payload.' }, { status: 400 });
      }
      await Order.findOneAndUpdate(
        { cashfreeOrderId: failedOrderId, paymentStatus: 'pending' },
        { paymentStatus: 'failed' },
      );
      return NextResponse.json({ success: true });
    }

    // Acknowledge (200) any event we don't act on so Cashfree stops retrying it.
    if (eventType !== 'PAYMENT_SUCCESS_WEBHOOK') {
      return NextResponse.json({ success: true, ignored: eventType });
    }

    const cashfreeOrderId = event.data?.order?.order_id;
    const payment = event.data?.payment;
    const cashfreePaymentId =
      payment?.cf_payment_id !== undefined && payment?.cf_payment_id !== null ? String(payment.cf_payment_id) : '';

    if (!cashfreeOrderId || !cashfreePaymentId || payment?.payment_status !== 'SUCCESS') {
      return NextResponse.json({ success: false, error: 'Malformed webhook payload.' }, { status: 400 });
    }

    const candidate = await Order.findOne({ cashfreeOrderId });
    if (!candidate) {
      return NextResponse.json({ success: true, ignored: 'order_not_found' });
    }

    if (candidate.paymentStatus === 'paid') {
      // Idempotent: repeated webhook deliveries (or a race with /api/payment/cashfree/verify)
      // are no-ops.
      return NextResponse.json({ success: true });
    }

    // The signed payload must agree with our server-computed total in INR — both the payment
    // amount and (when present) the order-level amount/currency Cashfree echoes back.
    const matches = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v - candidate.total) < 0.01;
    const eventOrder = event.data?.order;
    const amountMatches =
      matches(payment.payment_amount) && (eventOrder?.order_amount === undefined || matches(eventOrder.order_amount));
    const currencyMatches =
      payment.payment_currency === 'INR' &&
      (eventOrder?.order_currency === undefined || eventOrder.order_currency === 'INR');

    if (!amountMatches || !currencyMatches) {
      console.error('[payment/cashfree/webhook] Amount/currency mismatch for order', candidate.orderId, {
        expectedAmount: candidate.total,
        receivedAmount: payment.payment_amount,
        receivedOrderAmount: eventOrder?.order_amount,
        receivedCurrency: payment.payment_currency,
      });
      return NextResponse.json({ success: true, ignored: 'amount_mismatch' });
    }

    // Idempotent: the paymentStatus guard ensures repeated webhook deliveries (or a race
    // with /api/payment/cashfree/verify) never re-confirm or double-sync an already-paid order.
    const order = await Order.findOneAndUpdate(
      { _id: candidate._id, paymentStatus: { $ne: 'paid' } },
      {
        paymentStatus: 'paid',
        status: 'confirmed',
        paymentGateway: 'cashfree',
        cashfreeOrderId,
        cashfreePaymentId,
      },
      { new: true },
    );

    if (order) {
      await pushConfirmedOrderToSanity(order, 'Payment confirmed via Cashfree webhook');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[payment/cashfree/webhook]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Webhook processing error.' }, { status: 500 });
  }
}
