import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createGuestPaymentProof } from '@/backend/lib/guestPaymentProof';

// Exercises the verify route together with the REAL settlement logic (cashfreeSettlement.ts)
// and the real ownership/guest-proof checks. Only the Cashfree API, MongoDB and Sanity are
// mocked — no network calls, payments, stock changes or notifications happen.
const fetchCashfreeOrder = vi.fn();
const fetchCashfreeOrderPayments = vi.fn();
const isCashfreeConfigured = vi.fn(() => true);
const requireAuthHybrid = vi.fn();
const connectDB = vi.fn(async () => {});
const findOne = vi.fn();
const findOneAndUpdate = vi.fn();
const pushConfirmedOrderToSanity = vi.fn(async () => {});

vi.mock('@/backend/lib/cashfree', () => ({ fetchCashfreeOrder, fetchCashfreeOrderPayments }));
vi.mock('@/backend/lib/cashfreeConfig', () => ({ isCashfreeConfigured }));
vi.mock('@/backend/lib/clerk', () => ({ requireAuthHybrid }));
vi.mock('@/backend/lib/mongodb', () => ({ connectDB }));
vi.mock('@/backend/lib/sanityOrders', () => ({ pushConfirmedOrderToSanity }));
vi.mock('@/backend/models/Order', () => ({ Order: { findOne, findOneAndUpdate } }));

function makeRequest(body: unknown) {
  return new NextRequest('https://example.test/api/payment/cashfree/verify', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const REGISTERED_ORDER = {
  _id: 'mongo-1',
  orderId: 'NS-REG00001',
  userId: 'user-1',
  total: 499,
  paymentStatus: 'pending',
  paymentMethod: 'online',
  paymentGateway: 'cashfree',
  cashfreeOrderId: 'NS-REG00001',
  shippingAddress: { phone: '9876543210', fullName: 'Test User' },
};

const GUEST_ORDER = {
  _id: 'mongo-2',
  orderId: 'NS-GST00001',
  guestPhone: '9876543210',
  total: 299,
  paymentStatus: 'pending',
  paymentMethod: 'online',
  paymentGateway: 'cashfree',
  cashfreeOrderId: 'NS-GST00001',
  shippingAddress: { phone: '9876543210', fullName: 'Guest User' },
};

const paidCfOrder = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({
  order_id: id, order_amount: amount, order_currency: 'INR', order_status: 'PAID', ...extra,
});
const successPayment = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({
  cf_payment_id: '555001', order_id: id, payment_status: 'SUCCESS', payment_amount: amount,
  payment_currency: 'INR', payment_time: '2026-01-01T10:00:00+05:30', ...extra,
});

async function verify(body: unknown) {
  const { POST } = await import('@/app/api/payment/cashfree/verify/route');
  const res = await POST(makeRequest(body));
  return { res, json: await res.json() };
}

describe('POST /api/payment/cashfree/verify', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchCashfreeOrder.mockReset();
    fetchCashfreeOrderPayments.mockReset().mockResolvedValue([]);
    isCashfreeConfigured.mockReset().mockReturnValue(true);
    requireAuthHybrid.mockReset().mockRejectedValue(new Error('no session'));
    findOne.mockReset();
    findOneAndUpdate.mockReset();
    pushConfirmedOrderToSanity.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('marks a genuinely paid order as paid exactly once and syncs Sanity once', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    fetchCashfreeOrder.mockResolvedValue(paidCfOrder('NS-REG00001', 499));
    fetchCashfreeOrderPayments.mockResolvedValue([successPayment('NS-REG00001', 499)]);
    findOneAndUpdate.mockResolvedValue({ ...REGISTERED_ORDER, paymentStatus: 'paid' });

    const { res, json } = await verify({ orderId: 'NS-REG00001' });

    expect(res.status).toBe(200);
    expect(json.status).toBe('paid');
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'mongo-1', paymentStatus: { $ne: 'paid' } },
      expect.objectContaining({ paymentStatus: 'paid', status: 'confirmed', cashfreePaymentId: '555001' }),
      { new: true },
    );
    expect(pushConfirmedOrderToSanity).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: when a concurrent webhook already confirmed the order, Sanity is not called again', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    fetchCashfreeOrder.mockResolvedValue(paidCfOrder('NS-REG00001', 499));
    fetchCashfreeOrderPayments.mockResolvedValue([successPayment('NS-REG00001', 499)]);
    findOneAndUpdate.mockResolvedValue(null);

    const { res, json } = await verify({ orderId: 'NS-REG00001' });

    expect(res.status).toBe(200);
    expect(json.status).toBe('paid');
    expect(pushConfirmedOrderToSanity).not.toHaveBeenCalled();
  });

  it('returns already-paid without calling Cashfree for an order that is already paid', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER, paymentStatus: 'paid' });

    const { res, json } = await verify({ orderId: 'NS-REG00001' });

    expect(res.status).toBe(200);
    expect(json.status).toBe('paid');
    expect(fetchCashfreeOrder).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('reports pending (202) while the Cashfree order is still ACTIVE and never marks it paid', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    fetchCashfreeOrder.mockResolvedValue(paidCfOrder('NS-REG00001', 499, { order_status: 'ACTIVE' }));
    fetchCashfreeOrderPayments.mockResolvedValue([successPayment('NS-REG00001', 499, { payment_status: 'PENDING' })]);

    const { res, json } = await verify({ orderId: 'NS-REG00001' });

    expect(res.status).toBe(202);
    expect(json.status).toBe('pending');
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(pushConfirmedOrderToSanity).not.toHaveBeenCalled();
  });

  it('reports failure (402) and marks only a pending order failed when the latest attempt failed', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    fetchCashfreeOrder.mockResolvedValue(paidCfOrder('NS-REG00001', 499, { order_status: 'ACTIVE' }));
    fetchCashfreeOrderPayments.mockResolvedValue([
      successPayment('NS-REG00001', 499, { payment_status: 'FAILED', payment_time: '2026-01-01T10:05:00+05:30' }),
    ]);

    const { res, json } = await verify({ orderId: 'NS-REG00001' });

    expect(res.status).toBe(402);
    expect(json.status).toBe('failed');
    expect(findOneAndUpdate).toHaveBeenCalledWith({ _id: 'mongo-1', paymentStatus: 'pending' }, { paymentStatus: 'failed' });
    expect(pushConfirmedOrderToSanity).not.toHaveBeenCalled();
  });

  it.each([
    ['amount mismatch', paidCfOrder('NS-REG00001', 1)],
    ['currency mismatch', paidCfOrder('NS-REG00001', 499, { order_currency: 'USD' })],
    ['order id mismatch', paidCfOrder('NS-OTHER0001', 499)],
  ])('refuses to mark paid on Cashfree order %s', async (_label, cfOrder) => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    fetchCashfreeOrder.mockResolvedValue(cfOrder);
    fetchCashfreeOrderPayments.mockResolvedValue([successPayment('NS-REG00001', 499)]);

    const { res, json } = await verify({ orderId: 'NS-REG00001' });

    expect(res.status).toBe(400);
    expect(json.error).toBe('Payment verification failed.');
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(pushConfirmedOrderToSanity).not.toHaveBeenCalled();
  });

  it.each([
    ['payment amount differs', successPayment('NS-REG00001', 10)],
    ['payment currency differs', successPayment('NS-REG00001', 499, { payment_currency: 'USD' })],
    ['payment belongs to another order', successPayment('NS-OTHER0001', 499)],
    ['payment not SUCCESS', successPayment('NS-REG00001', 499, { payment_status: 'PENDING' })],
  ])('refuses to mark paid when the order is PAID but %s', async (_label, payment) => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });
    fetchCashfreeOrder.mockResolvedValue(paidCfOrder('NS-REG00001', 499));
    fetchCashfreeOrderPayments.mockResolvedValue([payment]);

    const { res } = await verify({ orderId: 'NS-REG00001' });

    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("denies a different customer from inspecting or confirming someone else's order", async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-2' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER });

    const { res, json } = await verify({ orderId: 'NS-REG00001' });

    expect(res.status).toBe(403);
    expect(json).toEqual({ success: false, error: 'Access denied.' });
    expect(fetchCashfreeOrder).not.toHaveBeenCalled();
  });

  it('answers an unknown order with the same generic 403', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue(null);

    const { res, json } = await verify({ orderId: 'NS-NOPE0001' });

    expect(res.status).toBe(403);
    expect(json).toEqual({ success: false, error: 'Access denied.' });
  });

  it('denies a guest without a proof, or with a proof for another phone or order', async () => {
    findOne.mockResolvedValue({ ...GUEST_ORDER });

    expect((await verify({ orderId: 'NS-GST00001' })).res.status).toBe(403);
    expect((await verify({ orderId: 'NS-GST00001', guestProof: createGuestPaymentProof('NS-GST00001', '9111111111') })).res.status).toBe(403);
    expect((await verify({ orderId: 'NS-GST00001', guestProof: createGuestPaymentProof('NS-OTHER0001', '9876543210') })).res.status).toBe(403);
    expect(fetchCashfreeOrder).not.toHaveBeenCalled();
  });

  it('lets a guest with a valid proof confirm their own paid order', async () => {
    findOne.mockResolvedValue({ ...GUEST_ORDER });
    fetchCashfreeOrder.mockResolvedValue(paidCfOrder('NS-GST00001', 299));
    fetchCashfreeOrderPayments.mockResolvedValue([successPayment('NS-GST00001', 299)]);
    findOneAndUpdate.mockResolvedValue({ ...GUEST_ORDER, paymentStatus: 'paid' });

    const { res, json } = await verify({ orderId: 'NS-GST00001', guestProof: createGuestPaymentProof('NS-GST00001', '9876543210') });

    expect(res.status).toBe(200);
    expect(json.status).toBe('paid');
    expect(pushConfirmedOrderToSanity).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON and missing order ids with 400', async () => {
    expect((await verify('{not json')).res.status).toBe(400);
    expect((await verify({})).res.status).toBe(400);
  });

  it('returns 400 when no Cashfree order was ever created for the order', async () => {
    requireAuthHybrid.mockResolvedValue({ userId: 'user-1' });
    findOne.mockResolvedValue({ ...REGISTERED_ORDER, cashfreeOrderId: undefined });

    const { res } = await verify({ orderId: 'NS-REG00001' });

    expect(res.status).toBe(400);
    expect(fetchCashfreeOrder).not.toHaveBeenCalled();
  });
});
