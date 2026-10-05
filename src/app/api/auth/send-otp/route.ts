import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Otp } from '@/backend/models/Otp';
import { generateOTP, isValidPhone, sanitizePhone } from '@/backend/lib/auth';

const OTP_EXPIRY_MINUTES = 10;
const MAX_RESEND_INTERVAL_SECONDS = 60;

export async function POST(req: NextRequest) {
  try {
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

    // Rate limiting: check if OTP was sent recently
    const recentOtp = await Otp.findOne({ phone }).sort({ createdAt: -1 }).lean();
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

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Delete any existing OTPs for this phone
    await Otp.deleteMany({ phone });

    // Save new OTP
    await Otp.create({ phone, otp, expiresAt });

    // ── Send OTP via MSG91 ──────────────────────────────────────────────
    // If MSG91 is configured, send via API; otherwise log for development
    if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) {
      const msg91Res = await fetch('https://control.msg91.com/api/v5/otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: process.env.MSG91_AUTH_KEY,
        },
        body: JSON.stringify({
          template_id: process.env.MSG91_TEMPLATE_ID,
          mobile: `91${phone}`,
          otp,
        }),
      });
      if (!msg91Res.ok) {
        console.error('MSG91 error:', await msg91Res.text());
        await Otp.deleteMany({ phone });
        return NextResponse.json(
          { success: false, error: 'Could not send OTP right now. Please try again.' },
          { status: 502 },
        );
      }
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] OTP for ${phone}: ${otp}`);
    } else {
      console.error('[send-otp] MSG91 is not configured in production');
      return NextResponse.json({ success: false, error: 'OTP service unavailable.' }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent to +91-${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}`,
      // In development, return OTP for testing (REMOVE in production)
      ...(process.env.NODE_ENV === 'development' && { _devOtp: otp }),
    });
  } catch (error) {
    console.error('[send-otp]', error);
    return NextResponse.json({ success: false, error: 'Failed to send OTP. Try again.' }, { status: 500 });
  }
}
