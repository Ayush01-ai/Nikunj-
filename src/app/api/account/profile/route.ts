import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { User } from '@/backend/models/User';
import { AuthError, isValidPhone, sanitizePhone } from '@/backend/lib/auth';
import { requireAuthHybrid } from '@/backend/lib/clerk';
import { isValidEmail, normalizeEmail, publicUser } from '@/backend/lib/session';

export const dynamic = 'force-dynamic';

/** Update the signed-in customer's name, phone, and/or email. */
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await requireAuthHybrid(req);
    const body = await req.json().catch(() => ({}));

    await connectDB();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 401 });

    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim().slice(0, 80);
      if (!name) return NextResponse.json({ success: false, error: 'Name cannot be empty.' }, { status: 400 });
      user.name = name;
    }

    if (body.phone !== undefined) {
      const phone = sanitizePhone(String(body.phone ?? ''));
      if (!isValidPhone(phone)) {
        return NextResponse.json({ success: false, error: 'Please enter a valid 10-digit phone number.' }, { status: 400 });
      }
      user.phone = phone;
    }

    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) {
        return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 });
      }
      user.email = email;
    }

    try {
      await user.save();
    } catch (err: unknown) {
      // Partial unique indexes on phone/email (see User.ts) reject duplicates across accounts.
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 11000) {
        return NextResponse.json(
          { success: false, error: 'That phone number or email is already linked to another account.' },
          { status: 409 },
        );
      }
      throw err;
    }

    return NextResponse.json({ success: true, user: publicUser(user) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[account/profile]', error);
    return NextResponse.json({ success: false, error: 'Could not update profile.' }, { status: 500 });
  }
}
