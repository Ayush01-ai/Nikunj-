import { NextResponse } from 'next/server';
import { isEmailConfigured } from '@/backend/lib/email';

export const dynamic = 'force-dynamic';

/** Tells the login page which sign-in methods are live, so unavailable ones can be explained. */
export function GET() {
  return NextResponse.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    emailReset: isEmailConfigured() || process.env.NODE_ENV !== 'production',
    phoneOtp: Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) || process.env.NODE_ENV !== 'production',
  });
}