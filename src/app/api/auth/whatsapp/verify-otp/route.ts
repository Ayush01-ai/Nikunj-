import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Otp } from '@/backend/models/Otp';
import { User, ensureUserIndexes } from '@/backend/models/User';
import { isValidPhone, sanitizePhone, safeEqual } from '@/backend/lib/auth';
import { sessionResponse, syncAdminRole } from '@/backend/lib/session';
import { isClerkConfigured } from '@/backend/lib/clerkConfig';

const MAX_ATTEMPTS = 5;
// Short-lived: the client must redeem this ticket immediately via Clerk's `ticket`
// sign-in strategy to turn it into a real Clerk session.
const SIGN_IN_TOKEN_TTL_SECONDS = 120;

/**
 * Verifies a WhatsApp-delivered OTP and establishes a session.
 *
 * - Mongo user lookup/creation and admin-role sync reuse the exact same logic as the
 *   existing SMS OTP flow (`/api/auth/verify-otp`) — the only difference is the OTP
 *   delivery channel and, optionally, bridging into a genuine Clerk session below.
 * - When Clerk is configured, this creates/links a Clerk user for the verified phone
 *   number (Clerk's Backend API marks admin-created identifiers as verified by
 *   default, which is accurate here because Meta has already verified the phone via
 *   WhatsApp) and returns a one-time Clerk `signInToken`. It does NOT fabricate a
 *   Clerk session itself — the client must redeem the token via
 *   `signIn.create({ strategy: 'ticket', ticket })` to get a real Clerk session.
 * - When Clerk is not configured, falls back to the existing legacy `ns_token` cookie
 *   session exactly like the SMS flow, so WhatsApp OTP login is fully functional with
 *   or without Clerk.
 */
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

    const record = await Otp.findOne({ phone, channel: 'whatsapp' }).sort({ createdAt: -1 });
    if (!record) {
      return NextResponse.json({ success: false, error: 'No OTP found. Please request a new one.' }, { status: 400 });
    }
    if (new Date() > record.expiresAt) {
      await Otp.deleteMany({ phone, channel: 'whatsapp' });
      return NextResponse.json({ success: false, error: 'OTP expired. Please request a new one.' }, { status: 400 });
    }

    record.attempts += 1;
    await record.save();
    if (record.attempts > MAX_ATTEMPTS) {
      await Otp.deleteMany({ phone, channel: 'whatsapp' });
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

    await Otp.deleteMany({ phone, channel: 'whatsapp' });

    await ensureUserIndexes();
    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ phone, role: 'user', authProviders: ['phone', 'whatsapp'] });
    } else if (!user.authProviders?.includes('whatsapp')) {
      user.authProviders = Array.from(new Set([...(user.authProviders ?? []), 'whatsapp' as const]));
      await user.save();
    }
    await syncAdminRole(user);

    if (isClerkConfigured()) {
      try {
        const { clerkClient } = await import('@clerk/nextjs/server');
        const client = await clerkClient();
        const e164 = `+91${phone}`;

        let clerkUserId = user.clerkUserId;
        if (!clerkUserId) {
          const { data: existing } = await client.users.getUserList({ phoneNumber: [e164] });
          if (existing.length > 0) {
            clerkUserId = existing[0].id;
          } else {
            const created = await client.users.createUser({ phoneNumber: [e164] });
            clerkUserId = created.id;
          }
          user.clerkUserId = clerkUserId;
          await user.save();
        }

        const signInToken = await client.signInTokens.createSignInToken({
          userId: clerkUserId,
          expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
        });

        // Also set the legacy cookie as a safety net (e.g. if the client fails to
        // redeem the Clerk ticket), without claiming a Clerk session exists yet.
        const res = NextResponse.json({ success: true, clerkTicket: signInToken.token, user: { phone: user.phone } });
        const { setSessionCookie } = await import('@/backend/lib/session');
        setSessionCookie(res, user);
        return res;
      } catch (err) {
        console.error('[whatsapp verify-otp] Clerk bridge failed, using legacy session only', err);
        // Fall through to legacy-only session below — never block login on Clerk errors.
      }
    }

    return sessionResponse(user);
  } catch (error) {
    console.error('[whatsapp verify-otp]', error);
    return NextResponse.json({ success: false, error: 'Verification failed. Try again.' }, { status: 500 });
  }
}
