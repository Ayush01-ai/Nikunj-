import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyOrderAccess: vi.fn(),
  requireAuthHybrid: vi.fn(),
}));

vi.mock('@/backend/lib/orderAccess', async (importActual) => ({
  ...(await importActual<typeof import('@/backend/lib/orderAccess')>()),
  verifyOrderAccess: mocks.verifyOrderAccess,
}));
vi.mock('@/backend/lib/clerk', () => ({ requireAuthHybrid: mocks.requireAuthHybrid }));
vi.mock('@/backend/lib/rateLimit', () => ({ clientIp: () => '1.1.1.1', createRateLimiter: () => () => false }));
vi.mock('@/backend/lib/sanityOrders', () => ({ getAdminSettings: vi.fn(), getSanityOrder: vi.fn(), sanityOrderId: (id: string) => `orders.${id}` }));
vi.mock('@/backend/lib/whatsapp', () => ({ sendOrderWhatsApp: vi.fn() }));
vi.mock('@/backend/models/Order', () => ({ Order: {} }));
vi.mock('@/cms/lib/client', () => ({ writeClient: {} }));

import { POST } from '@/app/api/orders/request/route';
import { createGuestPaymentProof } from '@/backend/lib/guestPaymentProof';

const ORDER_ID = 'NS-AB12CD34';
const PHONE = '9876543210';
const savedToken = process.env.SANITY_API_TOKEN;

function request(extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set('orderId', ORDER_ID);
  form.set('phone', PHONE);
  form.set('type', 'cancel');
  form.set('reasonCategory', 'Other');
  form.set('details', 'Changed my mind about this order');
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return new NextRequest('http://localhost/api/orders/request', { method: 'POST', body: form });
}

describe('POST /api/orders/request ownership proof', () => {
  beforeEach(() => {
    // With the Sanity token unset the route stops with 503 right after authorisation, so a 503
    // means "authorised" without exercising any Sanity writes.
    delete process.env.SANITY_API_TOKEN;
    mocks.requireAuthHybrid.mockReset().mockRejectedValue(new Error('unauthenticated'));
    mocks.verifyOrderAccess.mockReset();
  });
  afterAll(() => {
    if (savedToken !== undefined) process.env.SANITY_API_TOKEN = savedToken;
  });

  const guestOrder = { orderId: ORDER_ID, userId: null, shippingAddress: { phone: PHONE } };
  const accountOrder = { orderId: ORDER_ID, userId: { toString: () => 'owner-1' }, shippingAddress: { phone: PHONE } };

  it('rejects a guest who only knows the order ID + phone', async () => {
    mocks.verifyOrderAccess.mockResolvedValue({ ok: true, orderId: ORDER_ID, order: guestOrder });
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ needsVerification: true });
  });

  it('rejects a forged guest proof', async () => {
    mocks.verifyOrderAccess.mockResolvedValue({ ok: true, orderId: ORDER_ID, order: guestOrder });
    const res = await POST(request({ guestProof: 'not-a-real-proof' }));
    expect(res.status).toBe(403);
  });

  it('rejects a proof issued for a different order', async () => {
    mocks.verifyOrderAccess.mockResolvedValue({ ok: true, orderId: ORDER_ID, order: guestOrder });
    const res = await POST(request({ guestProof: createGuestPaymentProof('NS-ZZ99YY88', PHONE) }));
    expect(res.status).toBe(403);
  });

  it('accepts a guest with a valid OTP proof', async () => {
    mocks.verifyOrderAccess.mockResolvedValue({ ok: true, orderId: ORDER_ID, order: guestOrder });
    const res = await POST(request({ guestProof: createGuestPaymentProof(ORDER_ID, PHONE) }));
    expect(res.status).toBe(503);
  });

  it('rejects an account order when the caller is not logged in as the owner', async () => {
    mocks.verifyOrderAccess.mockResolvedValue({ ok: true, orderId: ORDER_ID, order: accountOrder });
    mocks.requireAuthHybrid.mockResolvedValue({ userId: 'someone-else' });
    const res = await POST(request({ guestProof: createGuestPaymentProof(ORDER_ID, PHONE) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ needsVerification: false });
  });

  it('accepts the logged-in owner of an account order', async () => {
    mocks.verifyOrderAccess.mockResolvedValue({ ok: true, orderId: ORDER_ID, order: accountOrder });
    mocks.requireAuthHybrid.mockResolvedValue({ userId: 'owner-1' });
    const res = await POST(request());
    expect(res.status).toBe(503);
  });

  it('still returns the generic not-found when the order ID + phone do not match', async () => {
    mocks.verifyOrderAccess.mockResolvedValue({ ok: false, status: 404, error: 'Order not found.' });
    const res = await POST(request());
    expect(res.status).toBe(404);
  });
});
