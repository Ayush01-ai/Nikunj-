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
export function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed. Use POST.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}

export async function POST(req: NextRequest) {
  const expected = process.env.SANITY_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'Revalidation is not configured' }, { status: 503 });
  }
  const given = providedSecret(req);
  if (!given || !safeEqual(given, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Cloudflare's static-assets cache is read-only, so the deploy hook is required to publish changes.
  const hook = process.env.CLOUDFLARE_DEPLOY_HOOK_URL;
  if (!hook) {
    console.error('[revalidate] CLOUDFLARE_DEPLOY_HOOK_URL missing; Sanity changes will not go live until the next deploy');
    return NextResponse.json(
      { error: 'CLOUDFLARE_DEPLOY_HOOK_URL is not configured; Sanity changes cannot be deployed', revalidated: false, rebuild: 'not_configured' },
      { status: 503 },
    );
  }

  revalidatePath('/', 'layout');

  try {
    const res = await fetch(hook, { method: 'POST' });
    if (!res.ok) {
      console.error(`[revalidate] deploy hook returned HTTP ${res.status}; site not rebuilt`);
      return NextResponse.json(
        { error: 'Cloudflare deploy hook failed; Sanity changes are not live yet', revalidated: false, rebuild: 'failed' },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error('[revalidate] deploy hook request failed; site not rebuilt', err);
    return NextResponse.json(
      { error: 'Cloudflare deploy hook failed; Sanity changes are not live yet', revalidated: false, rebuild: 'failed' },
      { status: 502 },
    );
  }

  return NextResponse.json({ revalidated: true, rebuild: 'triggered', at: Date.now() });
}
