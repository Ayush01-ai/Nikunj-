'use client';

import { HandleSSOCallback } from '@clerk/nextjs';

// Landing page for Clerk's OAuth redirect (Google). Completes the session, then sends the
// user on; if extra info is needed Clerk's own sign-in/sign-up pages take over.
export default function SsoCallbackPage() {
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
