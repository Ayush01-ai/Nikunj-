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
    if (existing?.passwordHash) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists. Please sign in.' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    let user = existing;
    if (user) {
      // Account created earlier via Google: attach a password to it.
      user.passwordHash = passwordHash;
      if (!user.name && name) user.name = name;
      user.authProviders = Array.from(new Set([...(user.authProviders ?? []), 'email' as const]));
      await user.save();
    } else {
      user = await User.create({ email, name: name || undefined, passwordHash, authProviders: ['email'], role: 'user' });
    }

    return sessionResponse(user, 'Account created', 'email');
  } catch (error) {
    console.error('[register]', error);
    return NextResponse.json({ success: false, error: 'Could not create account. Try again.' }, { status: 500 });
  }
}