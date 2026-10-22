import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { orderTotals, deliveryPolicy } from '@/cms/lib/pricing';

// The amount charged (Order.total → Cashfree order_amount) must be subtotal + delivery − discount,
// with delivery taken from Studio Site Settings, and must equal what the checkout showed.
const mocks = vi.hoisted(() => {
  const settings = { current: { freeDeliveryThreshold: 599, deliveryCharge: 99 } as Record<string, unknown> | null };
  const cdnFetch = vi.fn(async (query: string) => {
    if (String(query).includes('_type == "product"')) {
      return [{ _id: 'prod-1', name: 'Attar', price: 499, stock: 10, sizes: [], colors: [] }];
    }
    return { freeDeliveryThreshold: 0, deliveryCharge: 0 }; // stale CDN copy — must never be used for pricing
  });
  const freshFetch = vi.fn(async (query: string) => {
    if (String(query).includes('siteSettings')) return settings.current;
    return null; // coupon lookup
  });
  return {
    settings,
    cdnFetch,
    freshFetch,
    withConfig: vi.fn(() => ({ fetch: freshFetch })),
    create: vi.fn(async (doc: Record<string, unknown>) => ({ ...doc, _id: { toString: () => 'mongo-id' } })),
  };
});

vi.mock('@/backend/lib/mongodb', async () => ({
  ...(await vi.importActual<typeof import('@/backend/lib/mongodb')>('@/backend/lib/mongodb')),
  connectDB: vi.fn(async () => undefined),
}));
vi.mock('@/backend/models/Order', () => ({ Order: { create: mocks.create, countDocuments: vi.fn(async () => 0) } }));
vi.mock('@/backend/lib/clerk', () => ({ requireAuthHybrid: vi.fn().mockRejectedValue(new Error('no session')) }));
vi.mock('@/cms/lib/client', () => ({ client: { fetch: mocks.cdnFetch, withConfig: mocks.withConfig }, writeClient: {} }));
vi.mock('@/backend/lib/orderNotify', () => ({ snapshotForOrder: vi.fn(async () => undefined) }));
vi.mock('@/backend/lib/stockHold', () => ({
  heldQuantities: vi.fn(async () => new Map()),
  holdKey: (id: string) => id,
  withStockLock: (_ids: string[], fn: () => unknown) => fn(),
}));
vi.mock('@/backend/lib/sanityOrders', () => ({
  getAdminSettings: vi.fn(),
  getSanityOrderStatuses: vi.fn(),
  getSanityOrders: vi.fn(),
  pushConfirmedOrderToSanity: vi.fn(async () => undefined),
}));

let ipSeq = 0;
function placeOrder(extra: Record<string, unknown> = {}, quantity = 1) {
  ipSeq += 1;
  return new NextRequest('https://example.test/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: 'prod-1', quantity }],
      shippingAddress: { fullName: 'Test Buyer', phone: '9876543210', line1: '1 Test Street', city: 'Mathura', state: 'Uttar Pradesh', pincode: '281001' },
      paymentMethod: 'upi',
      ...extra,
    }),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipSeq}` },
  });
}

describe('orderTotals', () => {
  it('adds the delivery charge below the free-delivery threshold', () => {
    expect(orderTotals(300, 0, { freeDeliveryThreshold: 399, deliveryCharge: 99 })).toMatchObject({ deliveryCharge: 99, total: 399 });
  });

  it('makes delivery free at or above the threshold (decided on the pre-coupon subtotal)', () => {
    expect(orderTotals(999, 100, { freeDeliveryThreshold: 399, deliveryCharge: 99 })).toMatchObject({ deliveryCharge: 0, discount: 100, total: 899 });
    expect(orderTotals(499, 0, { freeDeliveryThreshold: 499, deliveryCharge: 40 })).toMatchObject({ deliveryCharge: 0, total: 499 });
  });

  it('subtracts the discount but never below zero items value', () => {
    expect(orderTotals(300, 1000, { freeDeliveryThreshold: 399, deliveryCharge: 40 })).toMatchObject({ discount: 300, total: 40 });
  });

  it('falls back to safe defaults for missing or invalid settings', () => {
    expect(deliveryPolicy(null)).toEqual({ freeDeliveryThreshold: 399, deliveryCharge: 99 });
    expect(deliveryPolicy({ freeDeliveryThreshold: -5, deliveryCharge: Number.NaN })).toEqual({ freeDeliveryThreshold: 399, deliveryCharge: 99 });
    expect(deliveryPolicy({ freeDeliveryThreshold: 0, deliveryCharge: 0 })).toEqual({ freeDeliveryThreshold: 0, deliveryCharge: 0 });
  });
});

describe('POST /api/orders — delivery charge and total', () => {
  beforeEach(() => {
    mocks.create.mockClear();
    mocks.settings.current = { freeDeliveryThreshold: 599, deliveryCharge: 99 };
  });

  it('stores subtotal + delivery as the order total (the amount sent to Cashfree)', async () => {
    const { POST } = await import('@/app/api/orders/route');
    const res = await POST(placeOrder({ expectedTotal: 598 }));
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(598);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ subtotal: 499, deliveryCharge: 99, discount: 0, total: 598 }));
  });

  it('reads delivery settings uncached, never from the CDN copy', async () => {
    const { POST } = await import('@/app/api/orders/route');
    await POST(placeOrder());
    expect(mocks.withConfig).toHaveBeenCalledWith({ useCdn: false });
    expect(mocks.freshFetch).toHaveBeenCalledWith(expect.stringContaining('siteSettings'));
    expect(mocks.cdnFetch).not.toHaveBeenCalledWith(expect.stringContaining('siteSettings'));
  });

  it('applies free delivery from Site Settings', async () => {
    mocks.settings.current = { freeDeliveryThreshold: 499, deliveryCharge: 40 };
    const { POST } = await import('@/app/api/orders/route');
    const res = await POST(placeOrder({ expectedTotal: 499 }));
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ deliveryCharge: 0, total: 499 }));
  });

  it('refuses (409, no order created) when the shown total differs from the server total', async () => {
    const { POST } = await import('@/app/api/orders/route');
    const res = await POST(placeOrder({ expectedTotal: 499 }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe('TOTAL_CHANGED');
    expect(json.pricing).toMatchObject({ subtotal: 499, deliveryCharge: 99, discount: 0, total: 598 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric expected total', async () => {
    const { POST } = await import('@/app/api/orders/route');
    const res = await POST(placeOrder({ expectedTotal: 'abc' }));
    expect(res.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
