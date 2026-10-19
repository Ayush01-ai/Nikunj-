import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdminHybrid: vi.fn(),
  processRefund: vi.fn(),
}));

vi.mock('@/backend/lib/clerk', () => ({ requireAdminHybrid: mocks.requireAdminHybrid }));
vi.mock('@/backend/lib/refunds', () => ({ processRefund: mocks.processRefund }));
vi.mock('@/backend/lib/rateLimit', () => ({ clientIp: () => '1.1.1.1', createRateLimiter: () => () => false }));

import { OPTIONS, POST } from '@/app/api/refunds/process/route';
import { __resetStudioAuthCacheForTests } from '@/backend/lib/studioAuth';

const ORDER_ID = 'NS-AB12CD34';

function request(headers: Record<string, string> = {}, body: unknown = { orderId: ORDER_ID }) {
  return new NextRequest('http://localhost/api/refunds/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function sanityMe(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe('POST /api/refunds/process authorisation', () => {
  beforeEach(() => {
    __resetStudioAuthCacheForTests();
    vi.unstubAllGlobals();
    mocks.requireAdminHybrid.mockReset().mockRejectedValue(new Error('unauthenticated'));
    mocks.processRefund.mockReset().mockResolvedValue({ ok: true, state: 'processing', message: 'Refund sent.' });
  });

  it('rejects anonymous callers without touching the refund', async () => {
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(mocks.processRefund).not.toHaveBeenCalled();
  });

  it('rejects a token Sanity does not recognise', async () => {
    vi.stubGlobal('fetch', sanityMe(401, { error: 'Unauthorized' }));
    const res = await POST(request({ Authorization: 'Bearer bad-token' }));
    expect(res.status).toBe(401);
    expect(mocks.processRefund).not.toHaveBeenCalled();
  });

  it('rejects a project member without write access (viewer)', async () => {
    vi.stubGlobal('fetch', sanityMe(200, { id: 'u1', roles: [{ name: 'viewer' }] }));
    const res = await POST(request({ Authorization: 'Bearer viewer-token' }));
    expect(res.status).toBe(401);
    expect(mocks.processRefund).not.toHaveBeenCalled();
  });

  it('denies when Sanity is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const res = await POST(request({ Authorization: 'Bearer any-token' }));
    expect(res.status).toBe(401);
  });

  it('allows a Studio editor token and processes the refund', async () => {
    const fetchMock = sanityMe(200, { id: 'u1', roles: [{ name: 'editor' }] });
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(request({ Authorization: 'Bearer editor-token' }));
    expect(res.status).toBe(200);
    expect(mocks.processRefund).toHaveBeenCalledWith(ORDER_ID);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\.api\.sanity\.io\/.*\/users\/me$/);
  });

  it('allows a website admin session', async () => {
    mocks.requireAdminHybrid.mockResolvedValue({ userId: 'admin' });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(mocks.processRefund).toHaveBeenCalledWith(ORDER_ID);
  });

  it('validates the order ID after authorising', async () => {
    mocks.requireAdminHybrid.mockResolvedValue({ userId: 'admin' });
    const res = await POST(request({}, { orderId: 'nope' }));
    expect(res.status).toBe(400);
    expect(mocks.processRefund).not.toHaveBeenCalled();
  });
});

describe('refunds/process CORS', () => {
  it('allows the hosted Studio origin', () => {
    const res = OPTIONS(new NextRequest('http://localhost/api/refunds/process', { method: 'OPTIONS', headers: { Origin: 'https://nikunjsakhi.sanity.studio' } }));
    expect(res.headers.get('access-control-allow-origin')).toBe('https://nikunjsakhi.sanity.studio');
  });

  it('does not allow other origins', () => {
    const res = OPTIONS(new NextRequest('http://localhost/api/refunds/process', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com' } }));
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
