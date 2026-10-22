import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  getSanityOrder: vi.fn(),
  setSanityUpiReference: vi.fn(),
  limited: vi.fn(),
}));

vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock('@/backend/models/Order', () => ({
  Order: { findOneAndUpdate: (...a: unknown[]) => ({ select: () => ({ lean: () => mocks.findOneAndUpdate(...a) }) }) },
}));
vi.mock('@/backend/lib/sanityOrders', () => ({
  getSanityOrder: mocks.getSanityOrder,
  setSanityUpiReference: mocks.setSanityUpiReference,
}));
vi.mock('@/backend/lib/rateLimit', () => ({
  clientIp: () => '1.2.3.4',
  createRateLimiter: () => mocks.limited,
}));

import { POST } from '@/app/api/orders/upi-reference/route';

const call = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/orders/upi-reference', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }));

beforeEach(() => {
  mocks.limited.mockReset().mockResolvedValue(false);
  mocks.findOneAndUpdate.mockReset().mockResolvedValue({ orderId: 'NS-AB12CD34' });
  mocks.getSanityOrder.mockReset().mockResolvedValue({ orderNumber: 'NS-AB12CD34', status: 'pending' });
  mocks.setSanityUpiReference.mockReset().mockResolvedValue(true);
});

describe('POST /api/orders/upi-reference', () => {
  it('stores the reference only on a pending UPI order and never marks it paid', async () => {
    const res = await call({ orderId: 'NS-AB12CD34', utr: '4123 4567 8901' });
    expect(res.status).toBe(200);
    const [filter, update] = mocks.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ orderId: 'NS-AB12CD34', paymentMethod: 'upi', paymentStatus: 'pending', status: 'pending' });
    expect(update.$set.upiReference).toBe('412345678901');
    expect(update.$set).not.toHaveProperty('paymentStatus');
    expect(mocks.setSanityUpiReference).toHaveBeenCalledWith('NS-AB12CD34', '412345678901');
  });

  it.each([
    [{ orderId: 'NS-AB12CD34', utr: '1234' }],
    [{ orderId: 'NS-AB12CD34', utr: 'abcdefghijkl' }],
    [{ orderId: { $ne: null }, utr: '412345678901' }],
    [{ orderId: 'NS-AB12CD34', utr: { $gt: '' } }],
  ])('rejects invalid input %j', async (body) => {
    expect((await call(body)).status).toBe(400);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses once the owner has confirmed or cancelled the order', async () => {
    mocks.getSanityOrder.mockResolvedValue({ orderNumber: 'NS-AB12CD34', status: 'cancelled' });
    expect((await call({ orderId: 'NS-AB12CD34', utr: '412345678901' })).status).toBe(409);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses COD / paid / unknown orders', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null);
    expect((await call({ orderId: 'NS-AB12CD34', utr: '412345678901' })).status).toBe(409);
    expect(mocks.setSanityUpiReference).not.toHaveBeenCalled();
  });

  it('is rate limited', async () => {
    mocks.limited.mockResolvedValue(true);
    expect((await call({ orderId: 'NS-AB12CD34', utr: '412345678901' })).status).toBe(429);
  });
});
