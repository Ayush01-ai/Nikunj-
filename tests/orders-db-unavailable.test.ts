import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Exercises POST /api/orders when the database is unreachable (Atlas IP-access-list
// rejection, DNS failure, etc.). The route must return an honest 503 — not the generic
// 500 used for unrelated bugs — since no order was created and the customer can safely
// retry. See src/backend/lib/mongodb.ts#isDbConnectionError.
//
// Regression note: this file was previously flaky only under full-parallel-suite
// execution (passed in isolation, timed out at the default 5000ms when several
// heavy-import test files ran concurrently in separate forked processes and competed
// for CPU during cold-start transform/collect). Root cause was pure test-runner timing,
// not shared rate-limiter/module state — confirmed by running this file together with
// tests/orders-ratelimit.test.ts both in isolation and concurrently. Fixed by raising
// `testTimeout` globally in vitest.config.ts; do not lower it back below ~15s without
// re-verifying stability under full `npm test` (run at least 3x) first.
const dbError = Object.assign(new Error('Could not connect to any servers in your MongoDB Atlas cluster'), {
  name: 'MongooseServerSelectionError',
});

vi.mock('@/backend/lib/mongodb', async () => {
  const actual = await vi.importActual<typeof import('@/backend/lib/mongodb')>('@/backend/lib/mongodb');
  return {
    ...actual,
    connectDB: vi.fn(async () => {
      throw dbError;
    }),
  };
});
vi.mock('@/backend/models/Order', () => ({ Order: { findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn() } }));
vi.mock('@/backend/lib/clerk', () => ({ requireAuthHybrid: vi.fn().mockRejectedValue(new Error('no session')) }));
vi.mock('@/cms/lib/client', () => {
  const client = {
    fetch: vi.fn(async (query: string) => {
      if (String(query).includes('_type == "product"')) {
        return [{ _id: 'prod-1', name: 'Test Product', price: 499, stock: 10, sizes: [], colors: [] }];
      }
      return null; // site settings
    }),
    withConfig: () => client,
  };
  return { client };
});
vi.mock('@/backend/lib/sanityOrders', () => ({
  getSanityOrderStatuses: vi.fn(),
  pushConfirmedOrderToSanity: vi.fn(),
}));
vi.mock('@/cms/lib/pricing', async () => ({
  ...(await vi.importActual<typeof import('@/cms/lib/pricing')>('@/cms/lib/pricing')),
  getVariantPricing: vi.fn(() => ({ price: 499, stock: 10 })),
}));

function makeRequest(ip: string) {
  return new NextRequest('https://example.test/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: 'prod-1', quantity: 1 }],
      shippingAddress: {
        fullName: 'Test User',
        phone: '9876543210',
        line1: '1 Test Street',
        city: 'Test City',
        state: 'Test State',
        pincode: '123456',
      },
      paymentMethod: 'cod',
    }),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  });
}

describe('POST /api/orders — database unavailable', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns 503 with an honest message instead of the generic order-failure 500', async () => {
    const { POST } = await import('@/app/api/orders/route');

    const res = await POST(makeRequest('203.0.113.50'));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/database|reach/i);
    expect(json.error).not.toMatch(/failed to place order/i);
  });
});
