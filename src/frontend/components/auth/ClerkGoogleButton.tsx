'use client';

import { useClerk } from '@clerk/nextjs';

/**
 * Google sign-in handled entirely by Clerk's client SDK (no server route, no Mongoose, no Worker).
 * Only render when ClerkProvider is mounted (see ClerkEnabledContext).
 *
 * Uses `signIn.authenticateWithRedirect`, which always starts a fresh sign-in. The newer
 * `signIn.sso()` silently does nothing when an earlier Google attempt was abandoned (its
 * verification expired), which left the button dead until Clerk's client state was cleared.
 */
export function ClerkGoogleButton({
  next,
  className,
  children,
  onError,
}: {
  next: string;
  className?: string;
  children: React.ReactNode;
  onError: (message: string) => void;
}) {
  const clerk = useClerk();

  const start = async () => {
    try {
      const signIn = clerk.client?.signIn;
      if (!signIn) throw new Error('Clerk client not ready');
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: `/sso-callback?next=${encodeURIComponent(next)}`,
        redirectUrlComplete: new URL(next, window.location.origin).toString(),
        // Always show Google's account chooser instead of silently reusing one session.
        oidcPrompt: 'select_account',
      });
    } catch (err) {
      console.error('[clerk] google sso failed', err);
      onError('Google sign-in failed. Please try again.');
    }
  };

  return (
    <button type="button" onClick={start} className={className} data-testid="google-signin">
      {children}
    </button>
  );
}
