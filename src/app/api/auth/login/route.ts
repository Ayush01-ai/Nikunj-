import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { User } from '@/backend/models/User';
import { comparePassword } from '@/backend/lib/auth';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';
import { isValidEmail, normalizeEmail, sessionResponse, syncAdminRole } from '@/backend/lib/session';

const isLimited = createRateLimiter(10, 15 * 60 * 1000, 'api/auth/login:isLimited');
const INVALID = 'Incorrect email or password.';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const password = String(body?.password ?? '');

    if (await isLimited(`${clientIp(req)}:${email}`)) {
      return NextResponse.json({ success: false, error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });
    }
    if (!isValidEmail(email) || !password) {
      return NextResponse.json({ success: false, error: INVALID }, { status: 400 });
    }

    await connectDB();
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash) {
      return NextResponse.json({ success: false, error: INVALID }, { status: 401 });
    }
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) return NextResponse.json({ success: false, error: INVALID }, { status: 401 });

    await syncAdminRole(user);
    return sessionResponse(user, 'Login successful', 'email');
  } catch (error) {
    console.error('[login]', error);
    return NextResponse.json({ success: false, error: 'Login failed. Try again.' }, { status: 500 });
  }
}