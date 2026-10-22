'use client';

import { HandleSSOCallback } from '@clerk/nextjs';
import { useClerkEnabled } from '@/frontend/providers/ClerkEnabledContext';

/**
 * Landing page for Clerk's Google OAuth redirect. Pure client shell, prerendered and served as a
 * static asset: the token exchange runs in the browser via Clerk's SDK (against Clerk's own
 * domain), so this route never invokes the Cloudflare Worker, the database or any server crypto.
 */
export default function SsoCallbackPage() {
  // Without a mounted ClerkProvider (e.g. build workers without Clerk keys) Clerk hooks throw.
  const enabled = useClerkEnabled();
  if (!enabled) return null;
  // Landing target survives the OAuth round-trip via the callback URL (same-origin paths only).
  const next = (() => {
    if (typeof window === 'undefined') return '/';
    const n = new URLSearchParams(window.location.search).get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/';
  })();
  return (
    <HandleSSOCallback
      navigateToApp={({ decorateUrl }) => {
        window.location.assign(decorateUrl(next));
      }}
      navigateToSignIn={() => window.location.assign('/sign-in')}
      navigateToSignUp={() => window.location.assign('/sign-up')}
    />
  );
}
