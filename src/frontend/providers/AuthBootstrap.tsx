'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/frontend/store/authStore';

/**
 * One-time, app-wide session hydration check.
 *
 * The Zustand auth store only persists `{ user, isAuthenticated }` to localStorage (see
 * authStore.ts) and is otherwise populated only when a page explicitly calls
 * `/api/auth/me` (previously just the login page, after a password/OTP/Google sign-in).
 * A Clerk-only sign-in (e.g. via the hosted `/sign-in` page) never touches that store,
 * so without this component a legitimately signed-in Clerk user would be bounced from
 * gated pages like `/account` that check `isAuthenticated` on mount.
 *
 * This performs the same `/api/auth/me` check the login page already does, once per
 * full app load, for every route — `requireAuthHybrid` (used by that route) resolves
 * either a Clerk session or the legacy `ns_token` cookie, so this is a strict superset
 * of the previous behavior and never regresses the legacy-JWT-only path.
 */
export function AuthBootstrap() {
  const ranRef = useRef(false);
  const setUser = useAuthStore((s) => s.setUser);
  const setAuthChecked = useAuthStore((s) => s.setAuthChecked);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // Already have a persisted session from a previous visit — trust it for now and
    // let the pages that actually need fresh data (e.g. /account's order fetch) handle
    // a 401 by logging out. Still mark the check as done so gated pages don't wait.
    if (isAuthenticated) {
      setAuthChecked(true);
      return;
    }

    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.success && json.user) setUser(json.user);
      })
      .catch(() => undefined)
      .finally(() => setAuthChecked(true));
    // Intentionally run once per mount (app-wide, mounted at the root) — not re-run on
    // dependency changes, which would otherwise refire on every setUser call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
