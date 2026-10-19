import { NextResponse } from 'next/server';
import { isEmailConfigured } from '@/backend/lib/email';
import { isWhatsAppConfigured } from '@/backend/lib/whatsapp';
import { isClerkConfigured } from '@/backend/lib/clerkConfig';

export const dynamic = 'force-dynamic';

/** Tells the login page which sign-in methods are live, so unavailable ones can be explained. */
export function GET() {
  return NextResponse.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    clerk: isClerkConfigured(),
    emailReset: isEmailConfigured() || process.env.NODE_ENV !== 'production',
    phoneOtp: isWhatsAppConfigured() || process.env.NODE_ENV !== 'production',
  });
}