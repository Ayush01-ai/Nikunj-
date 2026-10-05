import { NextRequest, NextResponse } from 'next/server';
import { createRazorpayOrder } from '@/backend/lib/razorpay';
import { requireAuth } from '@/backend/lib/auth';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';

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

    const razorpayOrder = await createRazorpayOrder({
      amount: order.total,
      receipt: orderId.slice(0, 40),
      notes: { orderId, ...(userId && { userId }) },
    });

    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    return NextResponse.json({
      success: true,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error('[payment/create]', error);
    return NextResponse.json({ success: false, error: 'Failed to create payment order.' }, { status: 500 });
  }
}
