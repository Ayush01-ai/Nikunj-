'use client';

import { useEffect, useRef } from 'react';
import { useSignIn } from '@clerk/nextjs';

/**
 * Only ever rendered when `CLERK_ENABLED` (a build-time constant derived from
 * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) is true — i.e. exactly when the root layout has
 * mounted `<ClerkProvider>` (see `src/frontend/providers/ClerkAppProvider.tsx`). This
 * keeps `useSignIn()` safe to call: it is never invoked without a `ClerkProvider`
 * ancestor, and `CLERK_ENABLED` can't change between renders (it's inlined at build
 * time), so this satisfies the rules of hooks.
 *
 * Redeems the one-time Clerk `signInToken` (the "ticket" strategy) issued by
 * `/api/auth/whatsapp/verify-otp` after a real Meta-verified WhatsApp OTP, turning it
 * into a genuine Clerk session — never fabricates a session client-side.
 *
 * Uses the installed `@clerk/nextjs@7.x` Future/Signals API: `signIn.ticket({ ticket })`
 * followed by `signIn.finalize()` to activate the resulting session (replaces the older
 * `signIn.create()` + `setActive()` pattern from earlier Clerk SDK versions).
 */
export function ClerkTicketRedeemer({
  ticket,
  onComplete,
  onError,
}: {
  ticket: string;
  onComplete: () => void;
  onError: (message: string) => void;
}) {
  const { signIn } = useSignIn();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      const { error: ticketError } = await signIn.ticket({ ticket });
      if (ticketError || signIn.status !== 'complete') {
        onError('Could not complete WhatsApp sign-in. Please try again.');
        return;
      }
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        onError('Could not complete WhatsApp sign-in. Please try again.');
        return;
      }
      onComplete();
    })();
  }, [signIn, ticket, onComplete, onError]);

  return null;
}
