import { NextResponse } from 'next/server';

/**
 * Razorpay checkout has been retired — Cashfree (/api/payment/cashfree/create) is now the
 * sole active payment gateway. This route intentionally never calls any Razorpay SDK
 * method, so it stays safe to deploy even with zero Razorpay credentials configured, and
 * it never creates a new Razorpay order. Any order that already has a `razorpayOrderId`
 * from before this retirement can still be confirmed via the existing
 * /api/payment/verify and /api/payment/webhook routes — only *new* Razorpay payments are
 * blocked here.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'Razorpay checkout has been retired. Please refresh and pay with Cashfree.',
    },
    { status: 410 },
  );
}
