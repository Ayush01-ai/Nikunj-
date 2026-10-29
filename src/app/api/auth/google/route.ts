import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { siteUrl } from '@/backend/lib/session';

function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') && !value.includes('\\')
    ? value
    : '/account';
}

export async function GET(req: NextRequest) {
  const base = siteUrl(req.nextUrl.origin);
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${base}/login?error=google_unavailable`);
  }

  const state = crypto.randomBytes(16).toString('hex');
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${base}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 10 * 60,
    path: '/api/auth/google',
  };
  res.cookies.set('ns_oauth_state', state, cookieOpts);
  res.cookies.set('ns_oauth_next', next, cookieOpts);
  return res;
}