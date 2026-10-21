import { ClerkProvider } from '@clerk/nextjs';
import { isClerkConfigured } from '@/backend/lib/clerkConfig';
import { ClerkEnabledProvider } from './ClerkEnabledContext';

/**
 * Wraps children in `<ClerkProvider>` only when Clerk is actually configured, so
 * deployments without Clerk keys render exactly as before (no ClerkProvider at all,
 * no runtime dependency on the publishable key). Keep this file server-renderable —
 * `ClerkProvider` itself handles the client/server split internally.
 */
export function ClerkAppProvider({ children }: { children: React.ReactNode }) {
  if (!isClerkConfigured()) return <>{children}</>;
  return (
    <ClerkProvider>
      <ClerkEnabledProvider value={true}>{children}</ClerkEnabledProvider>
    </ClerkProvider>
  );
}
