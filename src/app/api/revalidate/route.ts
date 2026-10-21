import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createHash, timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

// Hash both sides so the comparison is constant-time regardless of input length.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function providedSecret(req: NextRequest): string {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('secret') || '';
}

/** Sanity webhook: clears the Next.js cache so published content shows up without a manual redeploy. */
export async function POST(req: NextRequest) {
  const expected = process.env.SANITY_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'Revalidation is not configured' }, { status: 503 });
  }
  const given = providedSecret(req);
  if (!given || !safeEqual(given, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidatePath('/', 'layout');

  // The default Cloudflare static-assets cache is read-only, so also trigger a rebuild when a
  // deploy hook is configured. This keeps the deployment on the free tier (no R2/KV needed).
  let rebuild: 'triggered' | 'failed' | 'skipped' = 'skipped';
  const hook = process.env.CLOUDFLARE_DEPLOY_HOOK_URL;
  if (hook) {
    try {
      const res = await fetch(hook, { method: 'POST' });
      rebuild = res.ok ? 'triggered' : 'failed';
    } catch {
      rebuild = 'failed';
    }
  }

  return NextResponse.json({ revalidated: true, rebuild, at: Date.now() });
}
