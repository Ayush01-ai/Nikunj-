import { NextRequest, NextResponse } from 'next/server';
import { isCashfreeConfigured } from '@/backend/lib/cashfreeConfig';
import { settleCashfreeOrder } from '@/backend/lib/cashfreeSettlement';
import { requireAuthHybrid } from '@/backend/lib/clerk';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { authorizeOrderForPayment } from '@/backend/lib/orderAccess';

const DENIED = { success: false, error: 'Access denied.' } as const;

/**
 * Browser-initiated confirmation right after the Cashfree checkout modal closes. The client
 * supplies ONLY the orderId (plus a guestProof for guest orders); the payment outcome is
 * re-derived from Cashfree's API with our secret key (see settleCashfreeOrder) — the modal
 * result or a return_url redirect is never treated as proof of payment.
 *
 * Authorization matches /api/payment/cashfree/create: the signed-in owner of a registered
 * order, or a guest holding a valid guestPaymentProof for this order. Unknown orders and
 * unauthorized callers get the same generic 403 so payment state can't be probed.
 *
 * The webhook (/api/payment/cashfree/webhook) remains the authoritative, idempotent path if
 * this call is never made (tab closed, network drop, expired guest proof, etc.).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isCashfreeConfigured()) {
      return NextResponse.json({ success: false, error: 'Cashfree is not configured.' }, { status: 503 });
    }

    let body: { orderId?: unknown; guestProof?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 });
    }
    const { orderId, guestProof } = body;
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ success: false, error: 'Order ID is required.' }, { status: 400 });
    }

    let userId: string | undefined;
    try {
      userId = (await requireAuthHybrid(req)).userId;
    } catch {
      // Guests authorize with guestProof instead.
    }

    await connectDB();
    const order = await Order.findOne({ orderId });
    if (!order || !authorizeOrderForPayment(order, userId, guestProof).ok) {
      return NextResponse.json(DENIED, { status: 403 });
    }

    const result = await settleCashfreeOrder(order, 'Payment received online (Cashfree)');
    switch (result.state) {
      case 'paid':
        return NextResponse.json({ success: true, status: 'paid', message: 'Payment verified successfully.', orderId });
      case 'already_paid':
        return NextResponse.json({ success: true, status: 'paid', message: 'Payment already verified.', orderId });
      case 'pending':
        return NextResponse.json(
          { success: false, status: 'pending', error: 'Payment is still being processed. We will confirm it shortly.' },
          { status: 202 },
        );
      case 'failed':
        return NextResponse.json(
          { success: false, status: 'failed', error: 'Payment was not completed.' },
          { status: 402 },
        );
      case 'no_payment':
        return NextResponse.json(
          { success: false, status: 'failed', error: 'No online payment was started for this order.' },
          { status: 400 },
        );
      case 'mismatch':
      default:
        return NextResponse.json(
          { success: false, status: 'failed', error: 'Payment verification failed.' },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error('[payment/cashfree/verify]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Payment verification error.' }, { status: 500 });
  }
}