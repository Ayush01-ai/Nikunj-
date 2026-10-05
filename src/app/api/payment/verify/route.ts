import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSignature } from '@/backend/lib/razorpay';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { pushConfirmedOrderToSanity } from '@/backend/lib/sanityOrders';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = body;

    if (
      typeof razorpay_order_id !== 'string' ||
      typeof razorpay_payment_id !== 'string' ||
      typeof razorpay_signature !== 'string' ||
      typeof orderId !== 'string'
    ) {
      return NextResponse.json({ success: false, error: 'Missing payment verification data.' }, { status: 400 });
    }

    // Verify signature — critical security check
    const isValid = verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    if (!isValid) {
      console.warn('[payment/verify] Invalid signature for orderId:', orderId);
      return NextResponse.json({ success: false, error: 'Payment verification failed.' }, { status: 400 });
    }

    await connectDB();

    // Signature only proves Razorpay issued this payment; it must also belong to THIS order.
    const order = await Order.findOneAndUpdate(
      { orderId, razorpayOrderId: razorpay_order_id, paymentStatus: { $ne: 'paid' } },
      {
        paymentStatus: 'paid',
        status: 'confirmed',
        razorpayPaymentId: razorpay_payment_id,
      },
      { new: true },
    );

    if (!order) {
      const alreadyPaid = await Order.exists({ orderId, razorpayOrderId: razorpay_order_id, paymentStatus: 'paid' });
      if (alreadyPaid) {
        return NextResponse.json({ success: true, message: 'Payment already verified.', orderId });
      }
      return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
    }

    await pushConfirmedOrderToSanity(order, 'Payment received online');

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully.',
      orderId: order.orderId,
    });
  } catch (error) {
    console.error('[payment/verify]', error);
    return NextResponse.json({ success: false, error: 'Payment verification error.' }, { status: 500 });
  }
}
