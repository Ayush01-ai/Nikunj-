'use client';

import { useSignIn } from '@clerk/nextjs';

/**
 * Google sign-in handled entirely by Clerk's client SDK (no server route, no Mongoose).
 * Only render when ClerkProvider is mounted (see ClerkEnabledContext).
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
  const { signIn } = useSignIn();

  const start = async () => {
    try {
      const { error } = await signIn.sso({
        strategy: 'oauth_google',
        redirectUrl: next,
        redirectCallbackUrl: `/sso-callback?next=${encodeURIComponent(next)}`,
        // Always show Google's account chooser instead of silently reusing one session.
        oidcPrompt: 'select_account',
      });
      if (error) onError('Google sign-in failed. Please try again.');
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
