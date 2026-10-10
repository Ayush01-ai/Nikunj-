import { NextRequest, NextResponse } from 'next/server';
import { fetchCashfreeOrderPayments } from '@/backend/lib/cashfree';
import { isCashfreeConfigured } from '@/backend/lib/cashfreeConfig';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { pushConfirmedOrderToSanity } from '@/backend/lib/sanityOrders';

/**
 * Cashfree has no client-trustable signed callback like Razorpay's
 * (razorpay_signature). So unlike /api/payment/verify, this route takes ONLY the orderId
 * from the client and re-derives everything else by calling back into Cashfree's API with
 * our secret key — the client cannot assert a payment id/amount/status itself.
 *
 * This is a convenience path for the browser to get an immediate "paid" confirmation right
 * after checkout; the webhook (/api/payment/cashfree/webhook) remains the authoritative,
 * idempotent source of truth if this call is never made (tab closed, network drop, etc.).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isCashfreeConfigured()) {
      return NextResponse.json({ success: false, error: 'Cashfree is not configured.' }, { status: 503 });
    }

    const body = await req.json();
    const { orderId } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ success: false, error: 'Order ID is required.' }, { status: 400 });
    }

    await connectDB();
    const order = await Order.findOne({ orderId });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
    }

    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ success: true, message: 'Payment already verified.', orderId });
    }

    if (!order.cashfreeOrderId) {
      return NextResponse.json({ success: false, error: 'No Cashfree payment found for this order.' }, { status: 400 });
    }

    const payments = await fetchCashfreeOrderPayments(order.cashfreeOrderId);
    const successfulPayment = payments.find((p) => p.payment_status === 'SUCCESS');

    if (!successfulPayment || !successfulPayment.cf_payment_id) {
      return NextResponse.json({ success: false, error: 'Payment not completed yet.' }, { status: 400 });
    }

    const amountMatches =
      typeof successfulPayment.payment_amount === 'number' &&
      Math.abs(successfulPayment.payment_amount - order.total) < 0.01;
    const currencyMatches = !successfulPayment.payment_currency || successfulPayment.payment_currency === 'INR';

    if (!amountMatches || !currencyMatches) {
      console.error('[payment/cashfree/verify] Amount/currency mismatch for order', order.orderId, {
        expectedAmount: order.total,
        receivedAmount: successfulPayment.payment_amount,
        receivedCurrency: successfulPayment.payment_currency,
      });
      return NextResponse.json({ success: false, error: 'Payment verification failed.' }, { status: 400 });
    }

    // Idempotent: the paymentStatus guard ensures a repeated /verify call (or a race with the
    // webhook) never re-confirms or double-syncs an already-paid order.
    const confirmed = await Order.findOneAndUpdate(
      { _id: order._id, paymentStatus: { $ne: 'paid' } },
      {
        paymentStatus: 'paid',
        status: 'confirmed',
        paymentGateway: 'cashfree',
        cashfreePaymentId: successfulPayment.cf_payment_id,
      },
      { new: true },
    );

    if (!confirmed) {
      // Someone else (the webhook) confirmed it in the meantime.
      return NextResponse.json({ success: true, message: 'Payment already verified.', orderId });
    }

    await pushConfirmedOrderToSanity(confirmed, 'Payment received online (Cashfree)');

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully.',
      orderId: confirmed.orderId,
    });
  } catch (error) {
    console.error('[payment/cashfree/verify]', error);
    return NextResponse.json({ success: false, error: 'Payment verification error.' }, { status: 500 });
  }
}
