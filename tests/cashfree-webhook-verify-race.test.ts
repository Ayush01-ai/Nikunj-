import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifySignature: vi.fn(),
  cashfreeOrder: vi.fn(),
  cashfreePayments: vi.fn(),
  configured: vi.fn(() => true),
  connectDB: vi.fn(async () => {}),
  requireAuth: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  syncPaid: vi.fn(async () => {}),
  syncFailed: vi.fn(async () => {}),
}));

vi.mock('@/backend/lib/cashfree', () => ({
  verifyCashfreeWebhookSignature: mocks.verifySignature,
  fetchCashfreeOrder: mocks.cashfreeOrder,
  fetchCashfreeOrderPayments: mocks.cashfreePayments,
}));
vi.mock('@/backend/lib/cashfreeConfig', () => ({ isCashfreeConfigured: mocks.configured }));
vi.mock('@/backend/lib/mongodb', () => ({ connectDB: mocks.connectDB }));
vi.mock('@/backend/lib/clerk', () => ({ requireAuthHybrid: mocks.requireAuth }));
vi.mock('@/backend/lib/sanityOrders', () => ({
  pushConfirmedOrderToSanity: mocks.syncPaid,
  pushCashfreePaymentFailureToSanity: mocks.syncFailed,
}));
vi.mock('@/backend/models/Order', () => ({
  Order: { findOne: mocks.findOne, findOneAndUpdate: mocks.findOneAndUpdate },
}));

const order = {
  _id: 'mongo-order-1',
  orderId: 'NS-RACE0001',
  userId: 'user-1',
  total: 499,
  paymentStatus: 'pending',
  paymentMethod: 'online',
  paymentGateway: 'cashfree',
  cashfreeOrderId: 'NS-RACE0001',
  shippingAddress: { phone: '9876543210', fullName: 'Test User' },
};

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`https://example.test${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('Cashfree webhook and verify race', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.configured.mockReturnValue(true);
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.findOne.mockImplementation(async () => ({ ...order }));
    mocks.cashfreeOrder.mockResolvedValue({
      order_id: order.cashfreeOrderId,
      order_amount: 499,
      order_currency: 'INR',
      order_status: 'PAID',
    });
    mocks.cashfreePayments.mockResolvedValue([{
      cf_payment_id: 'cf-pay-1',
      order_id: order.cashfreeOrderId,
      payment_status: 'SUCCESS',
      payment_amount: 499,
      payment_currency: 'INR',
      payment_time: '2026-01-01T10:00:00+05:30',
    }]);
    mocks.verifySignature.mockImplementation((_signature: string, rawBody: string) => ({ object: JSON.parse(rawBody) }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('lets only one of simultaneous webhook and verify updates dispatch paid-order synchronization', async () => {
    let paid = false;
    mocks.findOneAndUpdate.mockImplementation(async (_filter, update) => {
      if (paid) return null;
      paid = true;
      return { ...order, ...update };
    });

    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: order.cashfreeOrderId },
        payment: {
          cf_payment_id: 'cf-pay-1',
          payment_status: 'SUCCESS',
          payment_amount: 499,
          payment_currency: 'INR',
        },
      },
    };
    const { POST: verify } = await import('@/app/api/payment/cashfree/verify/route');
    const { POST: webhook } = await import('@/app/api/payment/cashfree/webhook/route');

    const [verifyResponse, webhookResponse] = await Promise.all([
      verify(request('/api/payment/cashfree/verify', { orderId: order.orderId })),
      webhook(request('/api/payment/cashfree/webhook', payload, {
        'x-webhook-signature': 'test-signature',
        'x-webhook-timestamp': '1700000000',
      })),
    ]);

    expect(verifyResponse.status).toBe(200);
    expect(webhookResponse.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.syncPaid).toHaveBeenCalledTimes(1);
  });
});
