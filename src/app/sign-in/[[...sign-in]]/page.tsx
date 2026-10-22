import { redirect } from 'next/navigation';
import { SignIn } from '@clerk/nextjs';
import { clerkPublishableKey } from '@/backend/lib/clerkConfig';
import { clerkAppearance } from '@/frontend/components/auth/clerkAppearance';

// Prerender the base path so Google SSO follow-up steps load as a static asset (no Worker CPU);
// Clerk's in-component sub-steps still render on demand.
export function generateStaticParams() {
  return [{ 'sign-in': [] as string[] }];
}

/**
 * New, additive Clerk-hosted sign-in route. Entirely separate from the existing
 * `/login` page (which keeps working unchanged via the legacy JWT flow). Only
 * reachable/functional when Clerk is configured; otherwise redirects back to the
 * existing login page so no broken route is ever exposed.
 */
export default function ClerkSignInPage() {
  // Only the publishable key is needed to render Clerk's UI (secret key isn't used here).
  if (!clerkPublishableKey()) redirect('/login');

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream py-16">
      <SignIn
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/account"
        appearance={clerkAppearance}
      />
    </div>
  );
}
