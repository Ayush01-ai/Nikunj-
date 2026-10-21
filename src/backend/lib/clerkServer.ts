import { createClerkClient } from '@clerk/nextjs/server';
import { clerkPublishableKey, clerkSecretKey } from '@/backend/lib/clerkConfig';

/** Clerk backend client built from sanitized env values (see `cleanEnvValue`). */
export function getClerkServerClient() {
  return createClerkClient({ secretKey: clerkSecretKey(), publishableKey: clerkPublishableKey() });
}
