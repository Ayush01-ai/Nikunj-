import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(async () => {}),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  notifyOrder: vi.fn(),
  notifyConfirmed: vi.fn(),
  ensureDeliveryCode: vi.fn(),
}));

vi.mock('@/backend/lib/mongodb', () => ({ connectDB: mocks.connectDB }));
vi.mock('@/backend/models/Order', () => ({
  Order: {
    findOne: mocks.findOne,
    findOneAndUpdate: (...args: unknown[]) => ({ lean: () => mocks.findOneAndUpdate(...args) }),
  },
}));
vi.mock('@/backend/lib/orderNotify', () => ({ notifyOrder: mocks.notifyOrder }));
vi.mock('@/backend/lib/sanityOrders', () => ({ notifyCustomerOrderConfirmed: mocks.notifyConfirmed }));
vi.mock('@/backend/lib/delivery', () => ({
  ensureDeliveryCode: mocks.ensureDeliveryCode,
  OUT_FOR_DELIVERY: new Set(['out_for_delivery']),
}));

describe('POST /api/webhooks/order-status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SANITY_WEBHOOK_SECRET', 'unit-test-secret');
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.findOneAndUpdate.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('records payment_failed without dispatching a customer status notification', async () => {
    const { POST } = await import('@/app/api/webhooks/order-status/route');
    const req = new NextRequest('https://example.test/api/webhooks/order-status', {
      method: 'POST',
      body: JSON.stringify({ orderNumber: 'NS-AB12CD34', status: 'payment_failed', paymentStatus: 'failed' }),
      headers: { 'content-type': 'application/json', 'x-webhook-secret': 'unit-test-secret' },
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, skipped: true });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { orderId: 'NS-AB12CD34' },
      { $set: { paymentStatus: 'failed' } },
      { new: true },
    );
    expect(mocks.notifyOrder).not.toHaveBeenCalled();
    expect(mocks.notifyConfirmed).not.toHaveBeenCalled();
  });
});
