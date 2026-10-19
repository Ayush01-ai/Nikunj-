import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { requireAdminHybrid } from '@/backend/lib/clerk';

/** Sanity project roles allowed to run owner-only Studio actions (e.g. sending an approved refund). */
const STUDIO_ROLES = new Set(['administrator', 'editor', 'developer']);
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { ok: boolean; until: number }>();

const projectId = () => process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'x33a83r6';

type SanityMe = { id?: string; role?: string; roles?: { name?: string }[] };

/**
 * Confirms a Studio login token belongs to a member of this Sanity project with write access,
 * by asking Sanity itself (`/users/me`). Results are cached briefly (keyed by a hash, never the token).
 */
export async function verifySanityStudioToken(token: string): Promise<boolean> {
  if (!token || token.length > 4096) return false;
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.ok;

  let ok = false;
  try {
    const res = await fetch(`https://${projectId()}.api.sanity.io/v2021-06-07/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const me = (await res.json()) as SanityMe | null;
      ok = Boolean(me?.id) && (me?.roles ?? []).some((r) => r?.name && STUDIO_ROLES.has(r.name));
    }
  } catch {
    // Network error: deny, and don't cache so the next attempt re-checks.
    return false;
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, { ok, until: Date.now() + CACHE_MS });
  return ok;
}

/** Studio editor (Sanity bearer token) or a website admin session. */
export async function isStudioOrSiteAdmin(req: NextRequest): Promise<boolean> {
  const header = req.headers.get('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (bearer && (await verifySanityStudioToken(bearer))) return true;
  try {
    await requireAdminHybrid(req);
    return true;
  } catch {
    return false;
  }
}

/** The hosted Studio (*.sanity.studio) calls the site cross-origin; the embedded /studio is same-origin. */
export function studioCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  if (!/^https:\/\/[a-z0-9-]+\.sanity\.studio$/.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function __resetStudioAuthCacheForTests() {
  cache.clear();
}
