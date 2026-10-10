import { NextRequest, NextResponse } from 'next/server';
import { createRazorpayOrder } from '@/backend/lib/razorpay';
import { requireAuth } from '@/backend/lib/auth';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';

function buildPaymentResponse(razorpayOrderId: string, total: number) {
  return NextResponse.json({
    success: true,
    data: {
      razorpayOrderId,
      amount: Math.round(total * 100),
      currency: 'INR',
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
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

    // Reuse the existing unpaid Razorpay order so a retried checkout can't orphan a payment
    // made against an earlier Razorpay order ID.
    if (order.razorpayOrderId) {
      return buildPaymentResponse(order.razorpayOrderId, order.total);
    }

    const razorpayOrder = await createRazorpayOrder({
      amount: order.total,
      receipt: orderId.slice(0, 40),
      notes: { orderId, ...(userId && { userId }) },
    });

    // Atomically claim the razorpayOrderId slot so two concurrent requests can't both
    // "win" and overwrite each other via a plain order.save().
    const claimed = await Order.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: { $ne: 'paid' },
        $or: [{ razorpayOrderId: { $exists: false } }, { razorpayOrderId: null }, { razorpayOrderId: '' }],
      },
      { razorpayOrderId: razorpayOrder.id },
      { new: true },
    );

    if (!claimed) {
      // Someone else claimed it first (or the order was paid in the meantime). The Razorpay
      // order we just created is simply never used — unpaid Razorpay orders are harmless.
      const current = await Order.findOne({ _id: order._id });
      if (!current) {
        return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
      }
      if (current.paymentStatus === 'paid') {
        return NextResponse.json({ success: false, error: 'Order has already been paid.' }, { status: 400 });
      }
      if (current.razorpayOrderId) {
        return buildPaymentResponse(current.razorpayOrderId, current.total);
      }
      // Never hand out a Razorpay order ID that isn't stored on this order.
      return NextResponse.json(
        { success: false, error: 'Could not start payment. Please try again.' },
        { status: 409 },
      );
    }

    // The conditional update succeeded, so this ID is the one now stored on the order.
    return buildPaymentResponse(razorpayOrder.id, claimed.total);
  } catch (error) {
    console.error('[payment/create]', error);
    return NextResponse.json({ success: false, error: 'Failed to create payment order.' }, { status: 500 });
  }
}
