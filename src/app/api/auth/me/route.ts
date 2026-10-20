import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { User } from '@/backend/models/User';
import { AuthError } from '@/backend/lib/auth';
import { requireAuthHybrid } from '@/backend/lib/clerk';
import { publicUser } from '@/backend/lib/session';

export const dynamic = 'force-dynamic';

// First adopter of the Clerk+legacy hybrid resolver (see `src/backend/lib/clerk.ts`).
// Behaves identically to the legacy-only `requireAuth` when Clerk is not configured.
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuthHybrid(req);
    await connectDB();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 401 });
    return NextResponse.json({ success: true, user: publicUser(user) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[me]', error);
    return NextResponse.json({ success: false, error: 'Could not load account.' }, { status: 500 });
  }
}