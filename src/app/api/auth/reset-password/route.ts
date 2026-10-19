import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { User } from '@/backend/models/User';
import { hashPassword, safeEqual } from '@/backend/lib/auth';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';
import { hashResetToken, isValidEmail, normalizeEmail, passwordProblem, sessionResponse } from '@/backend/lib/session';

const isLimited = createRateLimiter(10, 15 * 60 * 1000, 'api/auth/reset-password:isLimited');
const INVALID = 'This reset link is invalid or has expired. Please request a new one.';

export async function POST(req: NextRequest) {
  try {
    if (await isLimited(clientIp(req))) {
      return NextResponse.json({ success: false, error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const token = String(body?.token ?? '');
    const password = String(body?.password ?? '');

    if (!isValidEmail(email) || !/^[a-f0-9]{64}$/.test(token)) {
      return NextResponse.json({ success: false, error: INVALID }, { status: 400 });
    }
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    await connectDB();
    const user = await User.findOne({ email }).select('+resetTokenHash +resetTokenExpires');
    if (
      !user?.resetTokenHash ||
      !user.resetTokenExpires ||
      user.resetTokenExpires.getTime() < Date.now() ||
      !safeEqual(user.resetTokenHash, hashResetToken(token))
    ) {
      return NextResponse.json({ success: false, error: INVALID }, { status: 400 });
    }

    user.passwordHash = await hashPassword(password);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    // The reset link was delivered to this address, so completing it proves control of the mailbox.
    user.emailVerified = true;
    user.authProviders = Array.from(new Set([...(user.authProviders ?? []), 'email' as const]));
    await user.save();

    return sessionResponse(user, 'Password updated', 'email');
  } catch (error) {
    console.error('[reset-password]', error);
    return NextResponse.json({ success: false, error: 'Could not reset password. Try again.' }, { status: 500 });
  }
}