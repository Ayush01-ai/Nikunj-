import { NextRequest, NextResponse } from 'next/server';
import { connectDB, isDbConnectionError } from '@/backend/lib/mongodb';
import { Otp } from '@/backend/models/Otp';
import { generateOTP, isValidPhone, sanitizePhone } from '@/backend/lib/auth';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';
import { isWhatsAppConfigured, sendWhatsAppOtp, lastOtpFailure } from '@/backend/lib/whatsapp';

const OTP_EXPIRY_MINUTES = 10;
const MAX_RESEND_INTERVAL_SECONDS = 60;

// Per-IP guard in addition to the per-phone cooldown below: WhatsApp template sends are
// billed per-message, so this limits abuse/enumeration beyond the existing SMS flow.
const isIpLimited = createRateLimiter(20, 60 * 60 * 1000, 'api/auth/whatsapp/send-otp:isIpLimited'); // 20 requests / hour / IP (shared carrier NAT)
const loginOtpScope = { purpose: { $ne: 'guest_payment' }, channel: 'whatsapp' };

/**
 * Sends a WhatsApp OTP login code via the Meta Cloud API. This is a distinct channel
 * from the existing SMS OTP (`/api/auth/send-otp`, MSG91) — OTP records are tagged
 * `channel: 'whatsapp'` so the two never collide for the same phone number.
 */
export async function POST(req: NextRequest) {
  try {
    // Skip the IP bucket when the IP is unknown so all visitors never share one global limit;
    // the per-phone cooldown below still applies.
    const ip = clientIp(req);
    if (ip !== 'unknown' && (await isIpLimited(ip))) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await req.json();
    const rawPhone = body?.phone;
    if (!rawPhone || !isValidPhone(String(rawPhone))) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid 10-digit Indian mobile number.' },
        { status: 400 },
      );
    }
    const phone = sanitizePhone(String(rawPhone));

    await connectDB();

    const recentOtp = await Otp.findOne({ phone, ...loginOtpScope }).sort({ createdAt: -1 }).lean();
    if (recentOtp) {
      const elapsed = (Date.now() - new Date(recentOtp.createdAt).getTime()) / 1000;
      if (elapsed < MAX_RESEND_INTERVAL_SECONDS) {
        return NextResponse.json(
          {
            success: false,
            error: `Please wait ${Math.ceil(MAX_RESEND_INTERVAL_SECONDS - elapsed)} seconds before requesting a new OTP.`,
          },
          { status: 429 },
        );
      }
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await Otp.deleteMany({ phone, ...loginOtpScope });
    await Otp.create({ phone, otp, expiresAt, channel: 'whatsapp', purpose: 'login' });

    // Live sending always wins when credentials exist, even in development; the dev code is only a no-credentials fallback.
    let sentLive = false;
    if (isWhatsAppConfigured()) {
      const sent = await sendWhatsAppOtp(phone, otp);
      if (!sent) {
        await Otp.deleteMany({ phone, ...loginOtpScope });
        return NextResponse.json(
          { success: false, error: 'Could not send WhatsApp OTP right now. Please try again.', reason: lastOtpFailure },
          { status: 502 },
        );
      }
      sentLive = true;
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] WhatsApp OTP for ${phone}: ${otp}`);
    } else {
      console.error('[whatsapp send-otp] WhatsApp OTP is not configured in production');
      return NextResponse.json({ success: false, error: 'WhatsApp OTP service unavailable.' }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent via WhatsApp to +91-${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}`,
      ...(process.env.NODE_ENV === 'development' && !sentLive && { _devOtp: otp }),
    });
  } catch (error) {
    console.error('[whatsapp send-otp]', error);
    if (isDbConnectionError(error) || (error instanceof Error && /MONGODB_URI/.test(error.message))) {
      return NextResponse.json({ success: false, error: 'Service temporarily unavailable. Please try again shortly.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: 'Failed to send OTP. Try again.' }, { status: 500 });
  }
}
