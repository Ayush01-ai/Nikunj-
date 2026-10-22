import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// This file only exercises the rate-limit gate added to POST /api/orders, which runs
// before body parsing or any database/Sanity work. Everything else the route imports is
// stubbed out minimally so the module can be loaded; none of it is expected to be reached
// by these tests since the limiter trips first.
vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn(async () => {}) }));
vi.mock('@/backend/models/Order', () => ({ Order: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/backend/lib/clerk', () => ({ requireAuthHybrid: vi.fn().mockRejectedValue(new Error('no session')) }));
vi.mock('@/cms/lib/client', () => ({ client: { fetch: vi.fn() } }));
vi.mock('@/backend/lib/sanityOrders', () => ({
  getSanityOrderStatuses: vi.fn(),
  pushConfirmedOrderToSanity: vi.fn(),
  pushAwaitingPaymentOrderToSanity: vi.fn(),
}));
vi.mock('@/cms/lib/pricing', () => ({ getVariantPricing: vi.fn() }));

function makeRequest(ip: string) {
  return new NextRequest('https://example.test/api/orders', {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  });
}

describe('POST /api/orders — rate limiting', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns 429 with Retry-After once an IP exceeds the order-creation limit', async () => {
    const { POST } = await import('@/app/api/orders/route');

    // The limiter allows 20 requests per 10-minute window per IP (see route.ts).
    let last;
    for (let i = 0; i < 21; i++) {
      last = await POST(makeRequest('203.0.113.9'));
    }

    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
    const json = await last!.json();
    expect(json.success).toBe(false);
  });

  it('does not rate-limit a different IP that has not made any requests yet', async () => {
    const { POST } = await import('@/app/api/orders/route');

    for (let i = 0; i < 20; i++) {
      await POST(makeRequest('203.0.113.10'));
    }
    // A fresh IP's first request should not be blocked by the other IP's usage.
    const res = await POST(makeRequest('203.0.113.11'));
    expect(res.status).not.toBe(429);
  });
});
