import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { isClerkConfigured } from '@/backend/lib/clerkConfig';

/**
 * Clerk is only activated when its keys are present (see `isClerkConfigured`). Without
 * keys this must stay a no-op passthrough so the existing legacy-JWT login flow keeps
 * working unmodified and `next build` never fails due to missing Clerk configuration.
 *
 * NOTE: Next.js 16 deprecates the `middleware.ts` file convention in favor of `proxy.ts`
 * (still functional, emits a build-time deprecation warning). Clerk's documented
 * integration targets `middleware.ts`; renaming to `proxy.ts` is a safe, independent
 * follow-up once Clerk publishes official `proxy.ts` guidance for this Next.js version.
 */
const clerkHandler = clerkMiddleware((_auth, req) => {
  void req;
  return NextResponse.next();
});

export default function middleware(req: NextRequest, event: Parameters<typeof clerkHandler>[1]) {
  if (!isClerkConfigured()) return NextResponse.next();
  return clerkHandler(req, event);
}

export const config = {
  matcher: [
    // Skip static files and Next.js internals; run on everything else, including API routes.
    '/((?!_next/static|_next/image|favicon|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|css|js|map)$).*)',
  ],
};
