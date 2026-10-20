import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  ensureDeliveryCode: vi.fn(),
  notifyOrder: vi.fn(),
}));

vi.mock('@/backend/lib/delivery', () => ({
  ensureDeliveryCode: mocks.ensureDeliveryCode,
  OUT_FOR_DELIVERY: new Set(['shipped', 'out_for_delivery']),
}));
vi.mock('@/backend/lib/orderNotify', () => ({ notifyOrder: mocks.notifyOrder }));

import { POST } from '@/app/api/webhooks/order-status/route';

const SECRET = 'sanity-webhook-secret';
const call = (body: unknown, secret = SECRET) =>
  POST(new NextRequest('http://localhost/api/webhooks/order-status', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
  }));

beforeEach(() => {
  process.env.SANITY_WEBHOOK_SECRET = SECRET;
  mocks.ensureDeliveryCode.mockReset().mockResolvedValue({ token: 't' });
  mocks.notifyOrder.mockReset().mockResolvedValue({ sent: true, channel: 'email' });
});

describe('Sanity order-status webhook', () => {
  it('rejects a wrong secret without generating anything', async () => {
    expect((await call({ orderNumber: 'NS-AB12CD34', status: 'shipped' }, 'nope')).status).toBe(401);
    expect(mocks.ensureDeliveryCode).not.toHaveBeenCalled();
  });

  it('generates the delivery code when an order is marked shipped in Studio', async () => {
    const res = await call({ orderNumber: 'NS-AB12CD34', status: 'shipped' });
    expect(res.status).toBe(200);
    expect(mocks.ensureDeliveryCode).toHaveBeenCalledWith('NS-AB12CD34');
    expect(mocks.notifyOrder).toHaveBeenCalled();
  });

  it('still sends the status notification if code generation fails', async () => {
    mocks.ensureDeliveryCode.mockRejectedValue(new Error('db down'));
    const res = await call({ orderNumber: 'NS-AB12CD34', status: 'shipped' });
    expect(res.status).toBe(200);
    expect(mocks.notifyOrder).toHaveBeenCalled();
  });

  it('does not create a code for other statuses', async () => {
    await call({ orderNumber: 'NS-AB12CD34', status: 'processing' });
    expect(mocks.ensureDeliveryCode).not.toHaveBeenCalled();
  });
});
