/**
 * Lightweight, dependency-free check for whether Clerk is configured. Kept separate
 * from `src/backend/lib/clerk.ts` (which pulls in Mongoose models and `@clerk/nextjs/server`)
 * so it can be safely imported from the root layout / client-safe boundaries without
 * dragging in server-only or database code.
 */
export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}
