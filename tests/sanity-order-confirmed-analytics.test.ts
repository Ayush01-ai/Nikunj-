import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  commit: vi.fn(),
  create: vi.fn(),
  fetch: vi.fn(),
  notify: vi.fn(),
  recordOrderPlaced: vi.fn(),
  release: vi.fn(),
}));

vi.mock('@/cms/lib/client', () => {
  const transaction = {
    create: (document: unknown) => (mocks.create(document), transaction),
    patch: () => transaction,
    commit: mocks.commit,
  };
  return {
    writeClient: {
      fetch: mocks.fetch,
      transaction: () => transaction,
    },
  };
});
vi.mock('@/backend/lib/orderNotify', () => ({ notifyOrder: mocks.notify }));
vi.mock('@/backend/lib/analytics', () => ({ recordOrderPlaced: mocks.recordOrderPlaced }));
vi.mock('@/backend/lib/stockHold', () => ({ releaseStockHold: mocks.release }));

import { pushAwaitingPaymentOrderToSanity, pushConfirmedOrderToSanity } from '@/backend/lib/sanityOrders';

const makeOrder = (paymentMethod: 'upi' | 'cod') => ({
  orderId: 'NS-ANALYTICS1',
  items: [{ productId: 'p1', name: 'Test Product', quantity: 1, price: 100 }],
  shippingAddress: { fullName: 'Test Customer', phone: '9999999999', line1: 'Street', city: 'Mathura', state: 'UP', pincode: '281001' },
  subtotal: 100,
  deliveryCharge: 0,
  discount: 0,
  total: 100,
  paymentMethod,
  paymentStatus: 'pending',
  status: paymentMethod === 'cod' ? 'confirmed' : 'pending',
  createdAt: new Date('2026-10-22T00:00:00Z'),
});

describe('confirmed-order analytics', () => {
  beforeEach(() => {
    vi.stubEnv('SANITY_API_TOKEN', 'test-token');
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.fetch.mockResolvedValue([]);
    mocks.commit.mockResolvedValue({});
  });

  it('does not count a pending manual-UPI order as placed or revenue', async () => {
    expect(await pushAwaitingPaymentOrderToSanity(makeOrder('upi') as never, 'Awaiting payment')).toBe(true);

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'upi',
    }));
    expect(mocks.recordOrderPlaced).not.toHaveBeenCalled();
  });

  it('counts a COD order when it is confirmed', async () => {
    expect(await pushConfirmedOrderToSanity(makeOrder('cod') as never, 'COD order placed')).toBe(true);

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'confirmed',
      paymentMethod: 'cod',
    }));
    expect(mocks.recordOrderPlaced).toHaveBeenCalledTimes(1);
  });
});
