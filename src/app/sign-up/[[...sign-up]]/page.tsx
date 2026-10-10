import { redirect } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { isClerkConfigured } from '@/backend/lib/clerkConfig';

/**
 * New, additive Clerk-hosted sign-up route. Entirely separate from the existing
 * `/login` page's email/phone registration flow (unchanged). Only reachable/functional
 * when Clerk is configured; otherwise redirects back to the existing login page.
 */
export default function ClerkSignUpPage() {
  if (!isClerkConfigured()) redirect('/login');

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream py-16">
      <SignUp path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/account" />
    </div>
  );
}
