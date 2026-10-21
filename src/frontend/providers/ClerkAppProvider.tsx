import { ClerkProvider } from '@clerk/nextjs';
import { clerkPublishableKey } from '@/backend/lib/clerkConfig';
import { ClerkEnabledProvider } from './ClerkEnabledContext';

/**
 * Wraps children in `<ClerkProvider>` only when Clerk is actually configured, so
 * deployments without Clerk keys render exactly as before (no ClerkProvider at all,
 * no runtime dependency on the publishable key). Keep this file server-renderable —
 * `ClerkProvider` itself handles the client/server split internally.
 */
export function ClerkAppProvider({ children }: { children: React.ReactNode }) {
  // The layout is prerendered at build time, where only NEXT_PUBLIC_* values exist; the secret
  // key is a runtime-only secret, so gating on it here would leave Clerk unmounted in production.
  const publishableKey = clerkPublishableKey();
  if (!publishableKey) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkEnabledProvider value={true}>{children}</ClerkEnabledProvider>
    </ClerkProvider>
  );
}
