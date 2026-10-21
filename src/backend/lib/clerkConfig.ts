/**
 * Lightweight, dependency-free check for whether Clerk is configured. Kept separate
 * from `src/backend/lib/clerk.ts` (which pulls in Mongoose models and `@clerk/nextjs/server`)
 * so it can be safely imported from the root layout / client-safe boundaries without
 * dragging in server-only or database code.
 */

/**
 * Hosting dashboards make it easy to paste `NAME=value` into the *value* box. Clerk then
 * decodes a garbage key (empty frontend host) and silently fails to load, so tolerate it.
 */
export function cleanEnvValue(name: string, raw: string | undefined): string {
  let v = (raw ?? '').trim().replace(/^["']|["']$/g, '');
  if (v.startsWith(`${name}=`)) v = v.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  return v;
}

export const clerkPublishableKey = () =>
  cleanEnvValue('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export const clerkSecretKey = () => cleanEnvValue('CLERK_SECRET_KEY', process.env.CLERK_SECRET_KEY);

export function isClerkConfigured(): boolean {
  return Boolean(clerkPublishableKey() && clerkSecretKey());
}
