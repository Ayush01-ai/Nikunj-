import { clerkClient } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { User, type IUser } from '@/backend/models/User';
import { syncAdminRole } from '@/backend/lib/session';
import { AuthError, requireAuth, type AuthPayload, type LoginMethod } from '@/backend/lib/auth';
import { isClerkConfigured } from '@/backend/lib/clerkConfig';

export { isClerkConfigured };

/**
 * Finds (or safely creates/links) the MongoDB user for a verified Clerk identity.
 *
 * Linking rule: a Clerk account is only linked to an existing legacy MongoDB user when
 * Clerk reports the primary email or phone as *verified*, and only by exact match. We
 * never link or elevate role based on client-supplied data or unverified identifiers.
 * Role is always read back from the existing Mongo document (or defaulted to 'user' for
 * brand-new accounts) — Clerk public/unsafe metadata is never trusted for authorization.
 */
async function getOrLinkMongoUser(clerkUserId: string): Promise<IUser> {
  await connectDB();

  const existing = await User.findOne({ clerkUserId });
  if (existing) return existing;

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);

  const verifiedEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId && e.verification?.status === 'verified',
  )?.emailAddress?.toLowerCase();
  const verifiedPhone = clerkUser.phoneNumbers.find(
    (p) => p.id === clerkUser.primaryPhoneNumberId && p.verification?.status === 'verified',
  )?.phoneNumber?.replace(/\D/g, '').slice(-10);

  // Safe account linking: only match an existing record by a verified identifier.
  let mongoUser = verifiedEmail ? await User.findOne({ email: verifiedEmail }) : null;
  if (!mongoUser && verifiedPhone) {
    mongoUser = await User.findOne({ phone: verifiedPhone });
  }

  if (mongoUser) {
    mongoUser.clerkUserId = clerkUserId;
    if (!mongoUser.authProviders?.includes('clerk')) {
      mongoUser.authProviders = [...(mongoUser.authProviders ?? []), 'clerk'];
    }
    await mongoUser.save();
    return mongoUser;
  }

  // No existing account: create a brand-new, non-privileged user. Role is never taken
  // from Clerk metadata — it defaults to 'user' and is only ever promoted by
  // `syncAdminRole`, which checks the Sanity-backed admin phone allow-list.
  mongoUser = await User.create({
    clerkUserId,
    email: verifiedEmail || undefined,
    phone: verifiedPhone || undefined,
    name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || undefined,
    avatar: clerkUser.imageUrl || undefined,
    emailVerified: Boolean(verifiedEmail),
    authProviders: ['clerk'],
    role: 'user',
  });
  return mongoUser;
}

/**
 * Hybrid session resolver: tries a real Clerk session first (only if Clerk is
 * configured and `middleware.ts` populated request context), and transparently falls
 * back to the existing legacy `ns_token` JWT cookie otherwise. This is the explicit,
 * narrowly-scoped transition layer described in the migration plan — it never mints a
 * fake Clerk session and never trusts client-supplied identity.
 *
 * Intentionally separate from `requireAuth`/`requireAdmin` (which remain untouched) so
 * existing protected routes keep their exact current behavior unless a route opts in.
 */
const WHATSAPP_SESSION_WINDOW_MS = 10 * 60 * 1000;

/**
 * Clerk does not expose which strategy created a session, so the method is derived from data the
 * server controls: a session created within minutes of a successful WhatsApp OTP (which the server
 * records on the user and bridges via a sign-in ticket) is a WhatsApp session; otherwise a Clerk
 * session belongs to a Google or email/password sign-in, both of which verify the account email.
 */
export async function clerkSessionMethod(
  user: Pick<IUser, 'whatsappLoginAt' | 'emailVerified'>,
  sessionId: string | null | undefined,
): Promise<LoginMethod | undefined> {
  if (user.whatsappLoginAt && sessionId) {
    try {
      const client = await clerkClient();
      const session = await client.sessions.getSession(sessionId);
      if (Math.abs(session.createdAt - user.whatsappLoginAt.getTime()) <= WHATSAPP_SESSION_WINDOW_MS) return 'whatsapp';
    } catch {
      return undefined;
    }
  }
  return user.emailVerified ? 'email' : undefined;
}

export async function requireAuthHybrid(req: NextRequest): Promise<AuthPayload> {
  if (isClerkConfigured()) {
    try {
      // Verify the Clerk session straight from the request (no clerkMiddleware needed, which
      // keeps API routes independent of middleware on the Cloudflare edge).
      const client = await clerkClient();
      const requestState = await client.authenticateRequest(req, { acceptsToken: 'session_token' });
      const authObj = requestState.isAuthenticated ? requestState.toAuth() : null;
      const clerkUserId = authObj?.userId;
      const sessionId = authObj?.sessionId;
      if (clerkUserId) {
        const mongoUser = await getOrLinkMongoUser(clerkUserId);
        await syncAdminRole(mongoUser);
        const method = await clerkSessionMethod(mongoUser, sessionId);
        return {
          userId: mongoUser._id.toString(),
          phone: mongoUser.phone ?? '',
          role: mongoUser.role,
          ...(method ? { method } : {}),
        };
      }
    } catch (err) {
      // Clerk misconfiguration/outage must not silently grant access; fall through to
      // the legacy check below instead of throwing, so JWT-only sessions still work.
      console.error('[clerk] session resolution failed, falling back to legacy JWT', err);
    }
  }
  return requireAuth(req);
}

export async function requireAdminHybrid(req: NextRequest): Promise<AuthPayload> {
  const payload = await requireAuthHybrid(req);
  if (payload.role !== 'admin') throw new AuthError('Admin access required', 403);
  return payload;
}
