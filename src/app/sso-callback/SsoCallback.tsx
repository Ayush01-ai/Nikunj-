'use client';

import { HandleSSOCallback } from '@clerk/nextjs';
import { useClerkEnabled } from '@/frontend/providers/ClerkEnabledContext';

// Landing page for Clerk's OAuth redirect (Google). Completes the session, then sends the
// user on; if extra info is needed Clerk's own sign-in/sign-up pages take over.
export function SsoCallback() {
  // Without a mounted ClerkProvider (e.g. build workers without Clerk keys) Clerk hooks throw.
  const enabled = useClerkEnabled();
  if (!enabled) return null;
  return (
    <HandleSSOCallback
      navigateToApp={({ decorateUrl }) => {
        window.location.assign(decorateUrl('/'));
      }}
      navigateToSignIn={() => window.location.assign('/sign-in')}
      navigateToSignUp={() => window.location.assign('/sign-up')}
    />
  );
}
