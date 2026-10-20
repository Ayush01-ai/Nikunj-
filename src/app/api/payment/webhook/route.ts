import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { pushConfirmedOrderToSanity } from '@/backend/lib/sanityOrders';

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

/** Our orderId from the notes we attached when creating the Razorpay order (never from payment notes). */
async function getServerSetOrderNote(
  event: { payload?: { order?: { entity?: { id?: string; notes?: Record<string, unknown> } } } },
  razorpayOrderId: string,
): Promise<string | undefined> {
  const orderEntity = event.payload?.order?.entity;
  let notes: Record<string, unknown> | undefined;

  if (orderEntity?.id === razorpayOrderId) {
    notes = orderEntity.notes;
  } else {
    try {
      const { fetchRazorpayOrder } = await import('@/backend/lib/razorpay');
      const fetched = await fetchRazorpayOrder(razorpayOrderId);
      notes = fetched.notes as Record<string, unknown> | undefined;
    } catch (err) {
      console.error('[payment/webhook] Could not fetch Razorpay order for fallback', err);
      return undefined;
    }
  }

  const orderId = notes?.orderId;
  return typeof orderId === 'string' && orderId.length > 0 ? orderId : undefined;
}

/**
 * Razorpay server-to-server webhook. Acts as a safety net alongside the client-driven
 * /api/payment/verify call — if the browser tab closes or the verify call never fires,
 * this still confirms the order once Razorpay reports the payment as captured.
 *
 * Configure the same URL + secret in the Razorpay Dashboard → Webhooks, subscribed to
 * the "payment.captured", "payment.failed", and "order.paid" events.
 */
export async function POST(req: NextRequest) {
  try {
    if (!WEBHOOK_SECRET) {
      console.error('[payment/webhook] RAZORPAY_WEBHOOK_SECRET not configured');
      return NextResponse.json({ success: false, error: 'Webhook not configured.' }, { status: 500 });
    }

    // Signature is computed over the exact raw body, so it must be read as text, not parsed JSON.
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json({ success: false, error: 'Missing signature.' }, { status: 401 });
    }

    const expectedSignature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
    const signatureBuffer = Buffer.from(signature, 'utf-8');
    const isValid =
      expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);

    if (!isValid) {
      console.warn('[payment/webhook] Invalid webhook signature');
      return NextResponse.json({ success: false, error: 'Invalid signature.' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);

    await connectDB();

    // payment.failed only flips a still-pending order to failed — it never touches a paid
    // order, never needs the notes fallback, and never syncs to Sanity.
    if (event.event === 'payment.failed') {
      const failedPayment = event.payload?.payment?.entity;
      const failedOrderId: string | undefined = failedPayment?.order_id;
      if (!failedOrderId) {
        return NextResponse.json({ success: false, error: 'Malformed webhook payload.' }, { status: 400 });
      }
      await Order.findOneAndUpdate(
        { razorpayOrderId: failedOrderId, paymentStatus: 'pending' },
        { paymentStatus: 'failed' },
      );
      return NextResponse.json({ success: true });
    }

    // Acknowledge (200) any event we don't act on so Razorpay stops retrying it.
    if (event.event !== 'payment.captured' && event.event !== 'order.paid') {
      return NextResponse.json({ success: true, ignored: event.event });
    }

    const payment = event.payload?.payment?.entity;
    const razorpayOrderId: string | undefined = payment?.order_id;
    const razorpayPaymentId: string | undefined = payment?.id;

    if (!razorpayOrderId || !razorpayPaymentId) {
      return NextResponse.json({ success: false, error: 'Malformed webhook payload.' }, { status: 400 });
    }

    // Find the candidate order first so we can validate the amount before mutating anything.
    let candidate = await Order.findOne({ razorpayOrderId });
    let fallbackOrderId: string | undefined;

    if (!candidate) {
      // Fallback for a payment made against an older Razorpay order whose ID is no longer stored.
      // Only notes set by our server on the Razorpay ORDER are trusted — payment-entity notes can
      // be supplied by the browser at checkout.
      fallbackOrderId = await getServerSetOrderNote(event, razorpayOrderId);
      if (fallbackOrderId) {
        candidate = await Order.findOne({ orderId: fallbackOrderId, paymentMethod: { $ne: 'cod' } });
      }
    }

    if (!candidate) {
      return NextResponse.json({ success: true, ignored: 'order_not_found' });
    }

    if (candidate.paymentStatus === 'paid') {
      // Idempotent: repeated webhook deliveries (or a race with /api/payment/verify) are no-ops.
      return NextResponse.json({ success: true });
    }

    const expectedAmount = Math.round(candidate.total * 100);
    const amountMatches = typeof payment?.amount === 'number' && Math.round(payment.amount) === expectedAmount;
    const currencyMatches = !payment?.currency || payment.currency === 'INR';

    if (!amountMatches || !currencyMatches) {
      console.error('[payment/webhook] Amount/currency mismatch for order', candidate.orderId, {
        expectedAmount,
        receivedAmount: payment?.amount,
        receivedCurrency: payment?.currency,
      });
      return NextResponse.json({ success: true, ignored: 'amount_mismatch' });
    }

    // Idempotent: the paymentStatus guard ensures repeated webhook deliveries (or a race
    // with /api/payment/verify) never re-confirm or double-sync an already-paid order.
    const order = await Order.findOneAndUpdate(
      { _id: candidate._id, paymentStatus: { $ne: 'paid' } },
      {
        paymentStatus: 'paid',
        status: 'confirmed',
        razorpayOrderId,
        razorpayPaymentId,
      },
      { new: true },
    );

    if (order && fallbackOrderId) {
      console.warn('[payment/webhook] Matched order via Razorpay notes fallback:', fallbackOrderId);
    }

    if (order) {
      await pushConfirmedOrderToSanity(order, 'Payment confirmed via Razorpay webhook');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[payment/webhook]', error);
    return NextResponse.json({ success: false, error: 'Webhook processing error.' }, { status: 500 });
  }
}
