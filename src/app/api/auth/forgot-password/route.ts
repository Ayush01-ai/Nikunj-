import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/backend/lib/mongodb';
import { User } from '@/backend/models/User';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';
import { hashResetToken, isValidEmail, normalizeEmail, siteUrl } from '@/backend/lib/session';
import { isEmailConfigured, passwordResetEmail, sendEmail } from '@/backend/lib/email';

const isLimited = createRateLimiter(5, 15 * 60 * 1000, 'api/auth/forgot-password:isLimited');
const RESET_TTL_MS = 30 * 60 * 1000;
const GENERIC = 'If an account exists for this email, a reset link has been sent.';

export async function POST(req: NextRequest) {
  try {
    if (await isLimited(clientIp(req))) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const isDev = process.env.NODE_ENV !== 'production';
    if (!isEmailConfigured() && !isDev) {
      return NextResponse.json(
        { success: false, error: 'Email reset is unavailable right now. Please sign in with your phone OTP instead.' },
        { status: 503 },
      );
    }

    await connectDB();
    const user = await User.findOne({ email });
    // Same response whether or not the account exists, to prevent email enumeration.
    if (!user) return NextResponse.json({ success: true, message: GENERIC });

    const token = crypto.randomBytes(32).toString('hex');
    await User.updateOne(
      { _id: user._id },
      { $set: { resetTokenHash: hashResetToken(token), resetTokenExpires: new Date(Date.now() + RESET_TTL_MS) } },
    );

    const url = `${siteUrl(req.nextUrl.origin)}/login/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    const sent = await sendEmail(email, 'Reset your Nikunj Sakhi password', passwordResetEmail(user.name, url));
    if (!sent) console.log(`[DEV] Password reset link for ${email}: ${url}`);

    return NextResponse.json({
      success: true,
      message: GENERIC,
      ...(isDev && !sent && { _devResetUrl: url }),
    });
  } catch (error) {
    console.error('[forgot-password]', error);
    return NextResponse.json({ success: false, error: 'Could not process request. Try again.' }, { status: 500 });
  }
}