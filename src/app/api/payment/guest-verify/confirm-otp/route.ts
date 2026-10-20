import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Otp } from '@/backend/models/Otp';
import { Order } from '@/backend/models/Order';
import { isValidPhone, sanitizePhone } from '@/backend/lib/auth';
import { otpMatches } from '@/backend/lib/otpHash';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';
import { ORDER_ID_PATTERN, ORDER_NOT_FOUND } from '@/backend/lib/orderAccess';
import { createGuestPaymentProof } from '@/backend/lib/guestPaymentProof';

const MAX_ATTEMPTS = 5;

const isOrderLimited = createRateLimiter(10, 10 * 60 * 1000, 'api/payment/guest-verify/confirm-otp:isOrderLimited');
const isIpLimited = createRateLimiter(30, 60 * 60 * 1000, 'api/payment/guest-verify/confirm-otp:isIpLimited');

/**
 * Step 2 of guest-order payment authorization: verify the code sent by /send-otp and, on
 * success, mint a short-lived `guestPaymentProof` token scoped to this exact order +
 * phone. The client then passes this token as `guestProof` to /api/payment/create or
 * /api/payment/cashfree/create instead of a bare phone number.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = String(body?.orderId ?? '').trim().toUpperCase();
    const rawPhone = body?.phone;
    const otpInput = String(body?.otp || '').trim();

    if (!ORDER_ID_PATTERN.test(orderId)) {
      return NextResponse.json({ success: false, error: 'Enter a valid order ID, e.g. NS-AB12CD34.' }, { status: 400 });
    }
    if (!rawPhone || !isValidPhone(String(rawPhone))) {
      return NextResponse.json({ success: false, error: 'Invalid phone number.' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(otpInput)) {
      return NextResponse.json({ success: false, error: 'OTP must be 6 digits.' }, { status: 400 });
    }
    const phone = sanitizePhone(String(rawPhone));

    if (await isOrderLimited(`order:${orderId}`)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts for this order. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(isOrderLimited.retryAfterSeconds(`order:${orderId}`)) } },
      );
    }
    const ip = clientIp(req);
    if (await isIpLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(isIpLimited.retryAfterSeconds(ip)) } },
      );
    }

    await connectDB();
    const order = await Order.findOne({ orderId }).lean();
    if (!order || order.userId) {
      return NextResponse.json({ success: false, error: ORDER_NOT_FOUND }, { status: 404 });
    }
    const phoneMatches = [order.shippingAddress?.phone, order.guestPhone].some(
      (p) => p && sanitizePhone(p) === phone,
    );
    if (!phoneMatches) {
      return NextResponse.json({ success: false, error: ORDER_NOT_FOUND }, { status: 404 });
    }

    // Atomically reserve each verification attempt. This must happen in the database,
    // otherwise simultaneous requests can overwrite the in-memory attempt count.
    const otpScope = { phone, orderId, purpose: 'guest_payment' as const };
    const record = await Otp.findOneAndUpdate(
      { ...otpScope, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_ATTEMPTS } },
      { $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: -1 } },
    );
    if (!record) {
      const latest = await Otp.findOne(otpScope).sort({ createdAt: -1 });
      if (latest && new Date() > latest.expiresAt) {
        await Otp.deleteMany(otpScope);
        return NextResponse.json(
          { success: false, error: 'Code expired. Please request a new one.' },
          { status: 400 },
        );
      }
      if (latest && latest.attempts >= MAX_ATTEMPTS) {
        await Otp.deleteMany(otpScope);
        return NextResponse.json(
          { success: false, error: 'Too many failed attempts. Please request a new code.' },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { success: false, error: 'No verification code found. Please request a new one.' },
        { status: 400 },
      );
    }

    if (!otpMatches(record.otp, otpInput)) {
      const remaining = MAX_ATTEMPTS - record.attempts;
      return NextResponse.json(
        { success: false, error: `Invalid code. ${remaining > 0 ? `${remaining} attempts remaining.` : ''}` },
        { status: 400 },
      );
    }

    // Verified — single-use, so delete immediately before issuing the proof.
    await Otp.deleteMany({ phone, orderId, purpose: 'guest_payment' });

    const guestProof = createGuestPaymentProof(orderId, phone);
    return NextResponse.json({ success: true, guestProof });
  } catch (error) {
    console.error('[guest-verify confirm-otp]', error);
    return NextResponse.json({ success: false, error: 'Verification failed. Try again.' }, { status: 500 });
  }
}
