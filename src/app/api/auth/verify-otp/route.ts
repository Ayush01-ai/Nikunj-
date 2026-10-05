import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Otp } from '@/backend/models/Otp';
import { User } from '@/backend/models/User';
import { signToken, isValidPhone, sanitizePhone, safeEqual } from '@/backend/lib/auth';
import { getAdminSettings } from '@/backend/lib/sanityOrders';

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

    // Upsert user
    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ phone, role: 'user' });
    }

    // Admin numbers are managed in Sanity → Admin Access. An empty list leaves existing roles untouched.
    const { adminPhones } = await getAdminSettings();
    if (adminPhones && adminPhones.length > 0) {
      const role = adminPhones.includes(phone) ? 'admin' : 'user';
      if (user.role !== role) {
        user.role = role;
        await user.save();
      }
    }

    const token = signToken({ userId: user._id.toString(), phone: user.phone, role: user.role });

    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        _id: user._id.toString(),
        phone: user.phone,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    });

    // Set HttpOnly cookie
    response.cookies.set('ns_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[verify-otp]', error);
    return NextResponse.json({ success: false, error: 'Verification failed. Try again.' }, { status: 500 });
  }
}
