import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { User, ensureUserIndexes } from '@/backend/models/User';
import { hashPassword } from '@/backend/lib/auth';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';
import { isValidEmail, normalizeEmail, passwordProblem, sessionResponse } from '@/backend/lib/session';

const isLimited = createRateLimiter(10, 15 * 60 * 1000, 'api/auth/register:isLimited');

export async function POST(req: NextRequest) {
  try {
    if (await isLimited(clientIp(req))) {
      return NextResponse.json({ success: false, error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const password = String(body?.password ?? '');
    const name = String(body?.name ?? '').trim().slice(0, 80);

    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 });
    }
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    await connectDB();
    await ensureUserIndexes();

    const existing = await User.findOne({ email }).select('+passwordHash');
    // Never attach a password to an existing account: the email is not verified here.
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists. Please sign in.' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({ email, name: name || undefined, passwordHash, authProviders: ['email'], role: 'user' });

    return sessionResponse(user, 'Account created', 'email');
  } catch (error) {
    console.error('[register]', error);
    return NextResponse.json({ success: false, error: 'Could not create account. Try again.' }, { status: 500 });
  }
}