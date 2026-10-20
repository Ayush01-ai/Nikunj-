import { redirect } from 'next/navigation';
import { SignIn } from '@clerk/nextjs';
import { isClerkConfigured } from '@/backend/lib/clerkConfig';
import { clerkAppearance } from '@/frontend/components/auth/clerkAppearance';

/**
 * New, additive Clerk-hosted sign-in route. Entirely separate from the existing
 * `/login` page (which keeps working unchanged via the legacy JWT flow). Only
 * reachable/functional when Clerk is configured; otherwise redirects back to the
 * existing login page so no broken route is ever exposed.
 */
export default function ClerkSignInPage() {
  if (!isClerkConfigured()) redirect('/login');

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
