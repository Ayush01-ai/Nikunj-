'use client';

import { useEffect, useState } from 'react';
import { HandleSSOCallback } from '@clerk/nextjs';
import { useClerkEnabled } from '@/frontend/providers/ClerkEnabledContext';

const STUCK_AFTER_MS = 10_000;

/**
 * Landing page for Clerk's Google OAuth redirect. Pure client shell, prerendered and served as a
 * static asset: the token exchange runs in the browser via Clerk's SDK (against Clerk's own
 * domain), so this route never invokes the Cloudflare Worker, the database or any server crypto.
 */
export default function SsoCallbackPage() {
  // Without a mounted ClerkProvider (e.g. build workers without Clerk keys) Clerk hooks throw.
  const enabled = useClerkEnabled();
  // HandleSSOCallback renders nothing when the attempt can't be completed (e.g. the user cancelled
  // on Google), so offer a way back instead of leaving a blank page.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  // Landing target survives the OAuth round-trip via the callback URL (same-origin paths only).
  const next = (() => {
    if (typeof window === 'undefined') return '/';
    const n = new URLSearchParams(window.location.search).get('next');
    return n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') && !n.includes('\\') ? n : '/';
  })();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
      {stuck ? (
        <>
          <p className="font-lato text-sm text-deep">We couldn&apos;t finish signing you in with Google.</p>
          <a
            href={`/login?next=${encodeURIComponent(next)}`}
            className="border border-gold bg-white px-5 py-2.5 font-lato text-sm text-deep hover:shadow-gold-sm transition-all"
          >
            Back to sign in
          </a>
        </>
      ) : (
        <p className="font-lato text-sm text-[var(--text-mid)]" role="status">Signing you in…</p>
      )}
      {enabled && (
        <HandleSSOCallback
          navigateToApp={({ decorateUrl }) => {
            window.location.assign(decorateUrl(next));
          }}
          navigateToSignIn={() => window.location.assign('/sign-in')}
          navigateToSignUp={() => window.location.assign('/sign-up')}
        />
      )}
    </div>
  );
}
