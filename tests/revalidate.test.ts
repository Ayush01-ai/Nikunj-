import { describe, it, expect, vi, beforeEach } from 'vitest';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { GET, POST } from '@/app/api/revalidate/route';
import { NextRequest } from 'next/server';

const req = (headers: Record<string, string> = {}, qs = '') =>
  new NextRequest(`http://localhost/api/revalidate${qs}`, { method: 'POST', headers });

describe('/api/revalidate', () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    process.env.SANITY_WEBHOOK_SECRET = 'top-secret';
    delete process.env.CLOUDFLARE_DEPLOY_HOOK_URL;
  });

  it('answers GET with 405 instead of crashing', async () => {
    const res = GET();
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('fails closed when the secret is not configured', async () => {
    delete process.env.SANITY_WEBHOOK_SECRET;
    expect((await POST(req({ authorization: 'Bearer x' }))).status).toBe(503);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects missing or wrong secrets', async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req({ authorization: 'Bearer nope' }))).status).toBe(401);
    expect((await POST(req({}, '?secret=nope'))).status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates with a valid bearer token or query secret', async () => {
    const hook = 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/abc';
    process.env.CLOUDFLARE_DEPLOY_HOOK_URL = hook;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    expect((await POST(req({ authorization: 'Bearer top-secret' }))).status).toBe(200);
    expect((await POST(req({}, '?secret=top-secret'))).status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    fetchMock.mockRestore();
  });

  it('reports a missing deploy hook as a failure without clearing the cache', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(req({}, '?secret=top-secret'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ revalidated: false, rebuild: 'not_configured' });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('CLOUDFLARE_DEPLOY_HOOK_URL missing'));
    err.mockRestore();
  });

  it('triggers the Cloudflare deploy hook when configured', async () => {
    const hook = 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/abc';
    process.env.CLOUDFLARE_DEPLOY_HOOK_URL = hook;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await POST(req({}, '?secret=top-secret'));
    expect(fetchMock).toHaveBeenCalledWith(hook, { method: 'POST' });
    expect(await res.json()).toMatchObject({ rebuild: 'triggered' });
    fetchMock.mockRestore();
  });

  it('reports a failed Cloudflare deploy hook', async () => {
    const hook = 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/abc';
    process.env.CLOUDFLARE_DEPLOY_HOOK_URL = hook;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(req({}, '?secret=top-secret'));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ revalidated: false, rebuild: 'failed' });
    fetchMock.mockRestore();
    err.mockRestore();
  });
});
