import { NextRequest, NextResponse } from 'next/server';
import { createCashfreeOrder } from '@/backend/lib/cashfree';
import { isCashfreeConfigured } from '@/backend/lib/cashfreeConfig';
import { requireAuth } from '@/backend/lib/auth';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';

function buildPaymentResponse(cashfreeOrderId: string, paymentSessionId: string) {
  return NextResponse.json({
    success: true,
    data: {
      cashfreeOrderId,
      paymentSessionId,
      currency: 'INR',
      environment: process.env.CASHFREE_ENVIRONMENT === 'PRODUCTION' ? 'production' : 'sandbox',
    },
  });
}

/**
 * Mirrors /api/payment/create (Razorpay) exactly in its auth/ownership/idempotency rules —
 * only the gateway call differs. Reuses the same Order document and the same
 * "claim-the-gateway-order-id-atomically" pattern so a retried checkout can't orphan a
 * Cashfree order, and so this route can never start a Cashfree payment on an order that
 * already has a Razorpay order in flight (or vice versa) — one gateway per order.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isCashfreeConfigured()) {
      return NextResponse.json({ success: false, error: 'Cashfree is not configured.' }, { status: 503 });
    }

    // Auth optional — allow guest checkout with phone verification
    let userId: string | undefined;
    try {
      const payload = requireAuth(req);
      userId = payload.userId;
    } catch {
      // Guest checkout allowed
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
      return NextResponse.json({ success: false, error: 'Order has already been paid.' }, { status: 400 });
    }
    if (order.paymentMethod === 'cod') {
      return NextResponse.json({ success: false, error: 'Order is Cash on Delivery.' }, { status: 400 });
    }
    if (order.userId && order.userId.toString() !== userId) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    if (order.razorpayOrderId) {
      return NextResponse.json(
        { success: false, error: 'This order is already associated with another payment gateway.' },
        { status: 409 },
      );
    }

    if (order.cashfreeOrderId && order.cashfreePaymentSessionId) {
      return buildPaymentResponse(order.cashfreeOrderId, order.cashfreePaymentSessionId);
    }

    const origin = req.nextUrl.origin;
    const cfOrder = await createCashfreeOrder({
      orderId,
      amount: order.total,
      customerPhone: order.shippingAddress.phone,
      customerName: order.shippingAddress.fullName,
      customerId: userId || `guest_${order.guestPhone || orderId}`,
      returnUrl: `${origin}/confirmation?orderId=${encodeURIComponent(orderId)}`,
      notifyUrl: `${origin}/api/payment/cashfree/webhook`,
    });

    if (!cfOrder.order_id || !cfOrder.payment_session_id) {
      return NextResponse.json({ success: false, error: 'Could not start Cashfree payment.' }, { status: 502 });
    }

    // Atomically claim the cashfree fields so two concurrent requests can't both "win".
    const claimed = await Order.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: { $ne: 'paid' },
        $or: [{ cashfreeOrderId: { $exists: false } }, { cashfreeOrderId: null }, { cashfreeOrderId: '' }],
      },
      {
        paymentGateway: 'cashfree',
        cashfreeOrderId: cfOrder.order_id,
        cashfreePaymentSessionId: cfOrder.payment_session_id,
      },
      { new: true },
    );

    if (!claimed) {
      const current = await Order.findOne({ _id: order._id });
      if (!current) {
        return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
      }
      if (current.paymentStatus === 'paid') {
        return NextResponse.json({ success: false, error: 'Order has already been paid.' }, { status: 400 });
      }
      if (current.cashfreeOrderId && current.cashfreePaymentSessionId) {
        return buildPaymentResponse(current.cashfreeOrderId, current.cashfreePaymentSessionId);
      }
      return NextResponse.json(
        { success: false, error: 'Could not start payment. Please try again.' },
        { status: 409 },
      );
    }

    return buildPaymentResponse(cfOrder.order_id, cfOrder.payment_session_id);
  } catch (error) {
    console.error('[payment/cashfree/create]', error);
    return NextResponse.json({ success: false, error: 'Failed to create payment order.' }, { status: 500 });
  }
}
