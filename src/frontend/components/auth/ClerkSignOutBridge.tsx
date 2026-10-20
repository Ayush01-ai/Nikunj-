'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';

/**
 * Only ever rendered when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set (see
 * `CLERK_ENABLED` in the caller) — i.e. only when `ClerkAppProvider` has mounted a real
 * `<ClerkProvider>` ancestor, so `useClerk()` is always safe to call here. Never render
 * this unconditionally; `useClerk()` throws outside a `<ClerkProvider>`.
 *
 * Fires Clerk's own documented `signOut()` once `trigger` increments, so a Clerk-issued
 * session is actually revoked on logout instead of silently surviving the legacy
 * `ns_token` cookie being cleared (which would otherwise let `AuthBootstrap` sign the
 * user straight back in on next load via the still-active Clerk session).
 */
export function ClerkSignOutBridge({ trigger }: { trigger: number }) {
  const { signOut } = useClerk();
  const lastRef = useRef(0);

  useEffect(() => {
    if (trigger === 0 || trigger === lastRef.current) return;
    lastRef.current = trigger;
    signOut().catch((err) => console.error('[clerk] sign-out failed', err));
  }, [trigger, signOut]);

  return null;
}
