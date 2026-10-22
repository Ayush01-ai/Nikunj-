import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  fetch: vi.fn(),
  create: vi.fn(),
  commit: vi.fn(),
  notify: vi.fn(),
  release: vi.fn(),
}));

vi.mock('@/cms/lib/client', () => {
  const tx = { create: (doc: unknown) => (mocks.create(doc), tx), patch: () => tx, commit: mocks.commit };
  return { writeClient: { fetch: mocks.fetch, transaction: () => tx } };
});
vi.mock('@/backend/models/Order', () => ({ Order: { findOne: mocks.findOne } }));
vi.mock('@/backend/lib/orderNotify', () => ({ notifyOrder: mocks.notify }));
vi.mock('@/backend/lib/analytics', () => ({ recordOrderPlaced: vi.fn() }));
vi.mock('@/backend/lib/stockHold', () => ({ releaseStockHold: mocks.release }));

import { pushConfirmedOrderToSanity, resyncOrderToSanity } from '@/backend/lib/sanityOrders';

const order = (over: Record<string, unknown> = {}) => ({
  orderId: 'NS-AB12CD34',
  items: [{ productId: 'p1', name: 'Mukut', quantity: 1, price: 100 }],
  shippingAddress: { fullName: 'A', phone: '9999999999', line1: 'x', city: 'Mathura', state: 'UP', pincode: '281001' },
  subtotal: 100,
  deliveryCharge: 0,
  discount: 0,
  total: 100,
  paymentMethod: 'upi',
  paymentStatus: 'pending',
  status: 'pending',
  stockHeld: true,
  createdAt: new Date('2026-10-22T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  vi.stubEnv('SANITY_API_TOKEN', 'tok');
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.fetch.mockResolvedValue([]);
  mocks.commit.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe('resyncOrderToSanity', () => {
  it('only looks at orders that never reached Sanity', async () => {
    mocks.findOne.mockResolvedValue(null);
    expect(await resyncOrderToSanity('NS-AB12CD34')).toBe(false);
    expect(mocks.findOne).toHaveBeenCalledWith({ orderId: 'NS-AB12CD34', stockHeld: true, status: { $ne: 'cancelled' } });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('copies an unsynced manual-UPI order as "Awaiting payment" and releases the website hold', async () => {
    mocks.findOne.mockResolvedValue(order({ upiReference: '412345678901' }));
    expect(await resyncOrderToSanity('NS-AB12CD34')).toBe(true);
    const doc = mocks.create.mock.calls[0][0];
    expect(doc).toMatchObject({ _id: 'orders.NS-AB12CD34', status: 'pending', paymentStatus: 'pending', upiReference: '412345678901' });
    expect(mocks.release).toHaveBeenCalledWith('NS-AB12CD34');
  });

  it('copies an unsynced COD order as confirmed', async () => {
    mocks.findOne.mockResolvedValue(order({ paymentMethod: 'cod', status: 'confirmed' }));
    expect(await resyncOrderToSanity('NS-AB12CD34')).toBe(true);
    expect(mocks.create.mock.calls[0][0].status).toBe('confirmed');
  });

  it('ignores abandoned payment-gateway attempts', async () => {
    mocks.findOne.mockResolvedValue(order({ paymentGateway: 'cashfree' }));
    expect(await resyncOrderToSanity('NS-AB12CD34')).toBe(false);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('treats an already-copied order (409) as synced', async () => {
    mocks.findOne.mockResolvedValue(order());
    mocks.commit.mockRejectedValue(Object.assign(new Error('exists'), { statusCode: 409 }));
    expect(await resyncOrderToSanity('NS-AB12CD34')).toBe(true);
    expect(mocks.release).toHaveBeenCalledWith('NS-AB12CD34');
  });

  it('does nothing without a token', async () => {
    vi.stubEnv('SANITY_API_TOKEN', '');
    expect(await resyncOrderToSanity('NS-AB12CD34')).toBe(false);
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});

describe('missing SANITY_API_TOKEN', () => {
  it('still sends the COD customer their confirmation', async () => {
    vi.stubEnv('SANITY_API_TOKEN', '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await pushConfirmedOrderToSanity(order({ paymentMethod: 'cod', status: 'confirmed' }) as never, 'COD')).toBe(false);
    expect(mocks.notify).toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
