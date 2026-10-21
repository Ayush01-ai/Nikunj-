import { describe, it, expect, vi, beforeEach } from 'vitest';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { POST } from '@/app/api/revalidate/route';
import { NextRequest } from 'next/server';

const req = (headers: Record<string, string> = {}, qs = '') =>
  new NextRequest(`http://localhost/api/revalidate${qs}`, { method: 'POST', headers });

describe('/api/revalidate', () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    process.env.SANITY_WEBHOOK_SECRET = 'top-secret';
    delete process.env.CLOUDFLARE_DEPLOY_HOOK_URL;
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
    expect((await POST(req({ authorization: 'Bearer top-secret' }))).status).toBe(200);
    expect((await POST(req({}, '?secret=top-secret'))).status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
