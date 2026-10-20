import { NextResponse } from 'next/server';

/** SMS (MSG91) login OTP is retired: phone login now uses WhatsApp OTP at /api/auth/whatsapp/verify-otp. */
export function POST() {
  return NextResponse.json(
    { success: false, error: 'Phone login now uses WhatsApp. Please continue with WhatsApp.' },
    { status: 410 },
  );
}
