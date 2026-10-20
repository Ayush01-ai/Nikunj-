import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Otp } from '@/backend/models/Otp';
import { Order } from '@/backend/models/Order';
import { generateOTP, isValidPhone, sanitizePhone } from '@/backend/lib/auth';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';
import { isWhatsAppConfigured, sendWhatsAppOtp } from '@/backend/lib/whatsapp';
import { ORDER_ID_PATTERN, ORDER_NOT_FOUND } from '@/backend/lib/orderAccess';

const OTP_EXPIRY_MINUTES = 10;
const MAX_RESEND_INTERVAL_SECONDS = 60;

// Order-scoped guard (a guest retrying checkout for the same order) and a looser IP
// guard (prevents one caller from spraying OTP requests across many order IDs/phones).
const isOrderLimited = createRateLimiter(5, 10 * 60 * 1000, 'api/payment/guest-verify/send-otp:isOrderLimited'); // 5 / 10min / order
const isIpLimited = createRateLimiter(20, 60 * 60 * 1000, 'api/payment/guest-verify/send-otp:isIpLimited'); // 20 / hour / IP

/**
 * Step 1 of guest-order payment authorization: send a one-time code to the phone number
 * on file for a guest order, scoped to exactly that order (`purpose: 'guest_payment'`,
 * `orderId`). This replaces "knowing the phone number" as sufficient proof for starting a
 * payment on a guest order — see orderAccess.ts `authorizeOrderForPayment` and
 * `guest-verify/confirm-otp` (step 2, which mints the `guestPaymentProof` token).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = String(body?.orderId ?? '').trim().toUpperCase();
    const rawPhone = body?.phone;

    if (!ORDER_ID_PATTERN.test(orderId)) {
      return NextResponse.json({ success: false, error: 'Enter a valid order ID, e.g. NS-AB12CD34.' }, { status: 400 });
    }
    if (!rawPhone || !isValidPhone(String(rawPhone))) {
      return NextResponse.json({ success: false, error: 'Please enter a valid 10-digit Indian mobile number.' }, { status: 400 });
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
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(isIpLimited.retryAfterSeconds(ip)) } },
      );
    }

    await connectDB();

    // Guest-only, and the phone must actually be on the order — otherwise respond with
    // the same generic "not found" used elsewhere so this endpoint can't be used to
    // enumerate valid order IDs or confirm which phone number is attached to an order.
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

    const recentOtp = await Otp.findOne({ phone, orderId, purpose: 'guest_payment' }).sort({ createdAt: -1 }).lean();
    if (recentOtp) {
      const elapsed = (Date.now() - new Date(recentOtp.createdAt).getTime()) / 1000;
      if (elapsed < MAX_RESEND_INTERVAL_SECONDS) {
        return NextResponse.json(
          {
            success: false,
            error: `Please wait ${Math.ceil(MAX_RESEND_INTERVAL_SECONDS - elapsed)} seconds before requesting a new code.`,
          },
          { status: 429 },
        );
      }
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await Otp.deleteMany({ phone, orderId, purpose: 'guest_payment' });
    await Otp.create({ phone, otp, expiresAt, orderId, purpose: 'guest_payment' });

    // Prefer WhatsApp (same channel as the order itself); fall back to MSG91 SMS, then a
    // silent dev no-op (the code is still created in the database so /confirm-otp can
    // verify it; it is never logged or returned). Fails closed (503) in production if
    // neither channel is configured.
    if (isWhatsAppConfigured() && process.env.WHATSAPP_OTP_TEMPLATE) {
      const sent = await sendWhatsAppOtp(phone, otp);
      if (!sent) {
        await Otp.deleteMany({ phone, orderId, purpose: 'guest_payment' });
        return NextResponse.json(
          { success: false, error: 'Could not send verification code right now. Please try again.' },
          { status: 502 },
        );
      }
    } else if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) {
      const msg91Res = await fetch('https://control.msg91.com/api/v5/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: process.env.MSG91_AUTH_KEY },
        body: JSON.stringify({ template_id: process.env.MSG91_TEMPLATE_ID, mobile: `91${phone}`, otp }),
      });
      if (!msg91Res.ok) {
        console.error('[guest-verify send-otp] MSG91 error:', await msg91Res.text());
        await Otp.deleteMany({ phone, orderId, purpose: 'guest_payment' });
        return NextResponse.json(
          { success: false, error: 'Could not send verification code right now. Please try again.' },
          { status: 502 },
        );
      }
    } else if (process.env.NODE_ENV !== 'production') {
      // Local/dev fallback when no delivery channel is configured: the code is never
      // logged or returned to the client, even in development — use `npm run otp:peek`
      // (scripts/peek-otp.mjs) or a temporary breakpoint to inspect the `Otp` collection
      // if you need to test this flow without WhatsApp/MSG91 configured.
    } else {
      console.error('[guest-verify send-otp] No OTP delivery channel configured in production');
      return NextResponse.json({ success: false, error: 'Verification service unavailable.' }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      message: `Verification code sent to +91-${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}`,
    });
  } catch (error) {
    console.error('[guest-verify send-otp]', error);
    return NextResponse.json({ success: false, error: 'Failed to send verification code. Try again.' }, { status: 500 });
  }
}
