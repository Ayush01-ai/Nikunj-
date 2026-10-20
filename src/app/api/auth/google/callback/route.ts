import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { User, ensureUserIndexes } from '@/backend/models/User';
import { safeEqual } from '@/backend/lib/auth';
import { setSessionCookie, siteUrl, syncAdminRole } from '@/backend/lib/session';

interface GoogleProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function GET(req: NextRequest) {
  const base = siteUrl(req.nextUrl.origin);
  const fail = (code: string) => {
    const res = NextResponse.redirect(`${base}/login?error=${code}`);
    res.cookies.delete({ name: 'ns_oauth_state', path: '/api/auth/google' });
    res.cookies.delete({ name: 'ns_oauth_next', path: '/api/auth/google' });
    return res;
  };

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state') ?? '';
  const expectedState = req.cookies.get('ns_oauth_state')?.value ?? '';
  const next = req.cookies.get('ns_oauth_next')?.value || '/account';

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return fail('google_unavailable');
  if (!code || !expectedState || !safeEqual(state, expectedState)) return fail('google_failed');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${base}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      console.error('[google callback] token exchange', await tokenRes.text());
      return fail('google_failed');
    }
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) return fail('google_failed');

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!profileRes.ok) return fail('google_failed');
    const profile = (await profileRes.json()) as GoogleProfile;
    if (!profile.sub || !profile.email || profile.email_verified === false) return fail('google_unverified');

    const email = profile.email.toLowerCase();
    await connectDB();
    await ensureUserIndexes();

    // Link by Google id first, then by verified email (merges with an existing email account).
    let user = (await User.findOne({ googleId: profile.sub })) ?? (await User.findOne({ email }));
    if (user) {
      // Drop any password planted on an unverified account (pre-hijacking).
      if (!user.emailVerified && !user.googleId) {
        user.passwordHash = undefined;
        user.authProviders = (user.authProviders ?? []).filter((p) => p !== 'email');
      }
      user.googleId = profile.sub;
      user.emailVerified = true;
      if (!user.name && profile.name) user.name = profile.name;
      if (!user.avatar && profile.picture) user.avatar = profile.picture;
      user.authProviders = Array.from(new Set([...(user.authProviders ?? []), 'google' as const]));
      await user.save();
    } else {
      user = await User.create({
        email,
        name: profile.name,
        avatar: profile.picture,
        googleId: profile.sub,
        emailVerified: true,
        authProviders: ['google'],
        role: 'user',
      });
    }
    await syncAdminRole(user);

    const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/account';
    const res = NextResponse.redirect(`${base}/login?oauth=success&next=${encodeURIComponent(dest)}`);
    setSessionCookie(res, user, 'google');
    res.cookies.delete({ name: 'ns_oauth_state', path: '/api/auth/google' });
    res.cookies.delete({ name: 'ns_oauth_next', path: '/api/auth/google' });
    return res;
  } catch (error) {
    console.error('[google callback]', error);
    return fail('google_failed');
  }
}