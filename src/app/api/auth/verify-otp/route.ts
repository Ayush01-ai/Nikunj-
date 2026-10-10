import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Otp } from '@/backend/models/Otp';
import { User, ensureUserIndexes } from '@/backend/models/User';
import { isValidPhone, sanitizePhone, safeEqual } from '@/backend/lib/auth';
import { sessionResponse, syncAdminRole } from '@/backend/lib/session';

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawPhone = body?.phone;
    const otpInput = String(body?.otp || '').trim();

    if (!rawPhone || !isValidPhone(String(rawPhone))) {
      return NextResponse.json({ success: false, error: 'Invalid phone number.' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(otpInput)) {
      return NextResponse.json({ success: false, error: 'OTP must be 6 digits.' }, { status: 400 });
    }

    const phone = sanitizePhone(String(rawPhone));

    await connectDB();

    const record = await Otp.findOne({ phone }).sort({ createdAt: -1 });
    if (!record) {
      return NextResponse.json({ success: false, error: 'No OTP found. Please request a new one.' }, { status: 400 });
    }

    // Check expiry
    if (new Date() > record.expiresAt) {
      await Otp.deleteMany({ phone });
      return NextResponse.json({ success: false, error: 'OTP expired. Please request a new one.' }, { status: 400 });
    }

    // Track attempts
    record.attempts += 1;
    await record.save();

    if (record.attempts > MAX_ATTEMPTS) {
      await Otp.deleteMany({ phone });
      return NextResponse.json(
        { success: false, error: 'Too many failed attempts. Please request a new OTP.' },
        { status: 429 },
      );
    }

    if (!safeEqual(record.otp, otpInput)) {
      const remaining = MAX_ATTEMPTS - record.attempts;
      return NextResponse.json(
        { success: false, error: `Invalid OTP. ${remaining > 0 ? `${remaining} attempts remaining.` : ''}` },
        { status: 400 },
      );
    }

    // OTP verified — clean up
    await Otp.deleteMany({ phone });

    await ensureUserIndexes();
    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ phone, role: 'user', authProviders: ['phone'] });
    } else if (!user.authProviders?.includes('phone')) {
      user.authProviders = Array.from(new Set([...(user.authProviders ?? []), 'phone' as const]));
      await user.save();
    }

    await syncAdminRole(user);
    return sessionResponse(user);
  } catch (error) {
    console.error('[verify-otp]', error);
    return NextResponse.json({ success: false, error: 'Verification failed. Try again.' }, { status: 500 });
  }
}
