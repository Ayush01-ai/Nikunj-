import { NextRequest, NextResponse } from 'next/server';
import { connectDB, isDbConnectionError } from '@/backend/lib/mongodb';
import { Otp } from '@/backend/models/Otp';
import { User, ensureUserIndexes } from '@/backend/models/User';
import { isValidPhone, sanitizePhone } from '@/backend/lib/auth';
import { otpMatches } from '@/backend/lib/otpHash';
import { sessionResponse, syncAdminRole } from '@/backend/lib/session';
import { isClerkConfigured } from '@/backend/lib/clerkConfig';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';

const MAX_ATTEMPTS = 5;

// Per-IP guard: the per-phone MAX_ATTEMPTS above already stops brute-forcing one OTP,
// but without this a caller could spread guesses across many phone numbers from a
// single IP. Mirrors the limiter already used by the guest-verify confirm-otp route.
const isIpLimited = createRateLimiter(30, 60 * 60 * 1000, 'api/auth/whatsapp/verify-otp:isIpLimited'); // 30 requests / hour / IP
const loginOtpScope = { purpose: { $ne: 'guest_payment' }, channel: 'whatsapp' };
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
    const ip = clientIp(req);
    if (ip !== 'unknown' && (await isIpLimited(ip))) {
      console.error('[whatsapp verify-otp] IP rate limited', ip);
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

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

    // Atomically claim the attempt so concurrent requests cannot overwrite each
    // other's counter update.
    const record = await Otp.findOneAndUpdate(
      { phone, ...loginOtpScope, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_ATTEMPTS } },
      { $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: -1 } },
    );
    if (!record) {
      const latest = await Otp.findOne({ phone, ...loginOtpScope }).sort({ createdAt: -1 });
      if (latest && new Date() > latest.expiresAt) {
        await Otp.deleteMany({ phone, ...loginOtpScope });
        return NextResponse.json({ success: false, error: 'OTP expired. Please request a new one.' }, { status: 400 });
      }
      if (latest && latest.attempts >= MAX_ATTEMPTS) {
        await Otp.deleteMany({ phone, ...loginOtpScope });
        return NextResponse.json(
          { success: false, error: 'Too many failed attempts. Please request a new OTP.' },
          { status: 429 },
        );
      }
      return NextResponse.json({ success: false, error: 'No OTP found. Please request a new one.' }, { status: 400 });
    }

    if (!otpMatches(record.otp, otpInput)) {
      const remaining = MAX_ATTEMPTS - record.attempts;
      return NextResponse.json(
        { success: false, error: `Invalid OTP. ${remaining > 0 ? `${remaining} attempts remaining.` : ''}` },
        { status: 400 },
      );
    }

    await Otp.deleteMany({ phone, ...loginOtpScope });

    await ensureUserIndexes();
    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ phone, role: 'user', authProviders: ['phone', 'whatsapp'] });
    } else if (!user.authProviders?.includes('whatsapp')) {
      user.authProviders = Array.from(new Set([...(user.authProviders ?? []), 'whatsapp' as const]));
      await user.save();
    }
    user.whatsappLoginAt = new Date();
    await user.save();
    await syncAdminRole(user);

    if (isClerkConfigured()) {
      try {
        const { getClerkServerClient } = await import('@/backend/lib/clerkServer');
        const client = getClerkServerClient();
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
        setSessionCookie(res, user, 'whatsapp');
        return res;
      } catch (err) {
        console.error('[whatsapp verify-otp] Clerk bridge failed, using legacy session only', err);
        // Fall through to legacy-only session below — never block login on Clerk errors.
      }
    }

    return sessionResponse(user, 'Login successful', 'whatsapp');
  } catch (error) {
    console.error('[whatsapp verify-otp]', error);
    if (isDbConnectionError(error) || (error instanceof Error && /MONGODB_URI/.test(error.message))) {
      return NextResponse.json({ success: false, error: 'Service temporarily unavailable. Please try again shortly.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: 'Verification failed. Try again.' }, { status: 500 });
  }
}
