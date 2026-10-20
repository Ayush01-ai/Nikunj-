import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createGuestPaymentProof } from '@/backend/lib/guestPaymentProof';

// All collaborators are mocked so this exercises only this route's own decision logic
// (ownership/guest authorization, rate limiting, idempotent gateway-order claiming) — no
// real network, database, or Cashfree calls are made. Mirrors tests/payment-create.test.ts.
const createCashfreeOrder = vi.fn();
const fetchCashfreeOrder = vi.fn();
const isCashfreeConfigured = vi.fn(() => true);
const requireAuthHybrid = vi.fn();
const connectDB = vi.fn(async () => {});
const findOne = vi.fn();
const findOneAndUpdate = vi.fn();

vi.mock('@/backend/lib/cashfree', () => ({ createCashfreeOrder, fetchCashfreeOrder }));
vi.mock('@/backend/lib/cashfreeConfig', () => ({ isCashfreeConfigured, cashfreeEnvironment: () => 'SANDBOX' }));
vi.mock('@/backend/lib/clerk', () => ({ requireAuthHybrid }));
vi.mock('@/backend/lib/mongodb', () => ({ connectDB }));
vi.mock('@/backend/models/Order', () => ({
  Order: { findOne, findOneAndUpdate },
}));

function makeRequest(body: unknown, ip = '203.0.113.1') {
  return new NextRequest('https://example.test/api/payment/cashfree/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  });
}

const REGISTERED_ORDER = {
  _id: 'mongo-id-1',
  orderId: 'order-reg-1',
  userId: 'user-1',
  total: 499,
  paymentStatus: 'pending',
  paymentMethod: 'online',
  shippingAddress: { phone: '9876543210', fullName: 'Test User' },
  razorpayOrderId: undefined,
  cashfreeOrderId: undefined,
  cashfreePaymentSessionId: undefined,
};

const GUEST_ORDER = {
  _id: 'mongo-id-2',
  orderId: 'order-guest-1',
  userId: undefined,
  guestPhone: '9876543210',
  shippingAddress: { phone: '9876543210', fullName: 'Guest User' },
  total: 299,
  paymentStatus: 'pending',
  paymentMethod: 'online',
  razorpayOrderId: undefined,
  cashfreeOrderId: undefined,
  cashfreePaymentSessionId: undefined,
};

describe('POST /api/payment/cashfree/create', () => {
  beforeEach(() => {
    vi.resetModules();
    createCashfreeOrder.mockReset().mockImplementation(async (o: { orderId: string }) => ({ order_id: o.orderId, payment_session_id: 'cf_session_1' }));
    fetchCashfreeOrder.mockReset();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    isCashfreeConfigured.mockReset().mockReturnValue(true);
    requireAuthHybrid.mockReset();
    connectDB.mockClear();
    findOne.mockReset();
    findOneAndUpdate.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it('allows the owning registered customer to create a Cashfree payment order', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    findOneAndUpdate.mockResolvedValue({ ...REGISTERED_ORDER, cashfreeOrderId: 'order-reg-1', cashfreePaymentSessionId: 'cf_session_1' });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.cashfreeOrderId).toBe('order-reg-1');
    expect(createCashfreeOrder).toHaveBeenCalledTimes(1);
  });

  it("denies a different authenticated customer from paying for someone else's order", async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-2' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(createCashfreeOrder).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows guest payment creation when a valid guestProof matches the order', async () => {
    requireAuthHybrid.mockRejectedValue(new Error('no session'));
    findOne.mockResolvedValue({ ...GUEST_ORDER });
    findOneAndUpdate.mockResolvedValue({ ...GUEST_ORDER, cashfreeOrderId: 'order-guest-1', cashfreePaymentSessionId: 'cf_session_1' });

    const guestProof = createGuestPaymentProof('order-guest-1', '9876543210');
    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-guest-1', guestProof }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('denies guest payment creation when the guestProof is missing, mismatched, or for a different order', async () => {
    requireAuthHybrid.mockRejectedValue(new Error('no session'));
    findOne.mockResolvedValue({ ...GUEST_ORDER });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');

    const resMissing = await POST(makeRequest({ orderId: 'order-guest-1' }));
    expect(resMissing.status).toBe(403);
    expect(createCashfreeOrder).not.toHaveBeenCalled();

    const wrongPhoneProof = createGuestPaymentProof('order-guest-1', '9111111111');
    const resMismatch = await POST(makeRequest({ orderId: 'order-guest-1', guestProof: wrongPhoneProof }));
    expect(resMismatch.status).toBe(403);
    expect(createCashfreeOrder).not.toHaveBeenCalled();

    const wrongOrderProof = createGuestPaymentProof('order-guest-OTHER', '9876543210');
    const resWrongOrder = await POST(makeRequest({ orderId: 'order-guest-1', guestProof: wrongOrderProof }));
    expect(resWrongOrder.status).toBe(403);
    expect(createCashfreeOrder).not.toHaveBeenCalled();

    const resTampered = await POST(
      makeRequest({ orderId: 'order-guest-1', guestProof: `${createGuestPaymentProof('order-guest-1', '9876543210')}x` }),
    );
    expect(resTampered.status).toBe(403);
    expect(createCashfreeOrder).not.toHaveBeenCalled();
  });

  it('does not leak order details when guest authorization fails', async () => {
    requireAuthHybrid.mockRejectedValue(new Error('no session'));
    findOne.mockResolvedValue({ ...GUEST_ORDER });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-guest-1' }));
    const json = await res.json();

    expect(json).toEqual({ success: false, error: 'Access denied.' });
  });

  it('is idempotent: a retry against an order that already has a cashfree session reuses it', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER, cashfreeOrderId: 'cf_existing', cashfreePaymentSessionId: 'cf_session_existing' });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.cashfreeOrderId).toBe('cf_existing');
    expect(createCashfreeOrder).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses to start a Cashfree payment when a Razorpay order is already in flight', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER, razorpayOrderId: 'rzp_in_flight' });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1' }));

    expect(res.status).toBe(409);
    expect(createCashfreeOrder).not.toHaveBeenCalled();
  });

  it('rejects requests once the order-scoped rate limit is exceeded, with Retry-After', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER, cashfreeOrderId: 'cf_existing', cashfreePaymentSessionId: 'cf_session_existing' });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');

    let last;
    for (let i = 0; i < 11; i++) {
      last = await POST(makeRequest({ orderId: 'order-reg-1' }));
    }

    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
  });

  it('answers an unknown order with the same generic 403 as an unauthorized one', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue(null);

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-missing' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: 'Access denied.' });
    expect(createCashfreeOrder).not.toHaveBeenCalled();
  });

  it('sends only the server-side order total to Cashfree, ignoring any client-supplied amount', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    findOneAndUpdate.mockResolvedValue({ ...REGISTERED_ORDER, cashfreeOrderId: 'order-reg-1', cashfreePaymentSessionId: 'cf_session_1' });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1', amount: 1, total: 1 }));

    expect(res.status).toBe(200);
    expect(createCashfreeOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-reg-1', amount: 499 }));
  });

  it('refuses orders below the Cashfree minimum of 1 INR', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER, total: 0 });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1' }));

    expect(res.status).toBe(400);
    expect(createCashfreeOrder).not.toHaveBeenCalled();
  });

  it('builds return/notify URLs from NEXT_PUBLIC_SITE_URL, not the request Host', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example.com';
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    findOneAndUpdate.mockResolvedValue({ ...REGISTERED_ORDER, cashfreeOrderId: 'order-reg-1', cashfreePaymentSessionId: 'cf_session_1' });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    await POST(makeRequest({ orderId: 'order-reg-1' }));

    const args = createCashfreeOrder.mock.calls[0][0];
    expect(args.returnUrl).toBe('https://shop.example.com/confirmation?orderId=order-reg-1');
    expect(args.notifyUrl).toBe('https://shop.example.com/api/payment/cashfree/webhook');
  });

  it('omits notify_url when the site URL is not https (local development)', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    findOneAndUpdate.mockResolvedValue({ ...REGISTERED_ORDER, cashfreeOrderId: 'order-reg-1', cashfreePaymentSessionId: 'cf_session_1' });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    await POST(makeRequest({ orderId: 'order-reg-1' }));

    expect(createCashfreeOrder.mock.calls[0][0].notifyUrl).toBeUndefined();
  });

  it('rejects a Cashfree response whose order_id does not match our order', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    createCashfreeOrder.mockResolvedValue({ order_id: 'someone-else', payment_session_id: 'cf_session_x' });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1' }));

    expect(res.status).toBe(502);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('recovers a matching ACTIVE Cashfree order when create fails because it already exists', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    createCashfreeOrder.mockRejectedValue(new Error('order_id already exists'));
    fetchCashfreeOrder.mockResolvedValue({
      order_id: 'order-reg-1', order_status: 'ACTIVE', order_currency: 'INR', order_amount: 499, payment_session_id: 'cf_session_recovered',
    });
    findOneAndUpdate.mockResolvedValue({ ...REGISTERED_ORDER, cashfreeOrderId: 'order-reg-1', cashfreePaymentSessionId: 'cf_session_recovered' });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.paymentSessionId).toBe('cf_session_recovered');
  });

  it('does not recover an existing Cashfree order whose amount differs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    createCashfreeOrder.mockRejectedValue(new Error('order_id already exists'));
    fetchCashfreeOrder.mockResolvedValue({
      order_id: 'order-reg-1', order_status: 'ACTIVE', order_currency: 'INR', order_amount: 1, payment_session_id: 'cf_session_bad',
    });

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1' }));

    expect(res.status).toBe(500);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('never logs the gateway error object (which can carry API credentials)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    const gatewayError = Object.assign(new Error('Request failed'), { config: { headers: { 'x-client-secret': 'TEST_SECRET_SHOULD_NOT_LOG' } } });
    createCashfreeOrder.mockRejectedValue(gatewayError);
    fetchCashfreeOrder.mockRejectedValue(new Error('not found'));

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    await POST(makeRequest({ orderId: 'order-reg-1' }));

    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('TEST_SECRET_SHOULD_NOT_LOG');
  });

  it('returns 503 when Cashfree is not configured, before touching the database', async () => {
    isCashfreeConfigured.mockReturnValue(false);

    const { POST } = await import('@/app/api/payment/cashfree/create/route');
    const res = await POST(makeRequest({ orderId: 'order-reg-1' }));

    expect(res.status).toBe(503);
    expect(findOne).not.toHaveBeenCalled();
  });
});
