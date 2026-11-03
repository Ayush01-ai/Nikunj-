import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createIfNotExists: vi.fn(),
  fetch: vi.fn(),
  patch: vi.fn(),
  transaction: vi.fn(),
  notify: vi.fn(),
  release: vi.fn(),
  recordOrderPlaced: vi.fn(),
}));

vi.mock('@/cms/lib/client', () => ({
  writeClient: {
    createIfNotExists: mocks.createIfNotExists,
    fetch: mocks.fetch,
    patch: mocks.patch,
    transaction: mocks.transaction,
  },
}));
vi.mock('@/backend/lib/orderNotify', () => ({ notifyOrder: mocks.notify }));
vi.mock('@/backend/lib/analytics', () => ({ recordOrderPlaced: mocks.recordOrderPlaced }));
vi.mock('@/backend/lib/stockHold', () => ({ releaseStockHold: mocks.release }));

import { pushCashfreePaymentFailureToSanity, pushConfirmedOrderToSanity } from '@/backend/lib/sanityOrders';

let state: {
  order: Record<string, unknown> | null;
  revision: number;
  stock: number;
};
let sentNotifications: Set<string>;

function makePatch() {
  const patch = {
    expectedRevision: undefined as string | undefined,
    values: {} as Record<string, unknown>,
    appended: [] as { field: string; values: unknown[] }[],
    ifRevisionId(revision: string) {
      patch.expectedRevision = revision;
      return patch;
    },
    set(values: Record<string, unknown>) {
      Object.assign(patch.values, values);
      return patch;
    },
    setIfMissing(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) {
        if (!(key in patch.values)) patch.values[key] = value;
      }
      return patch;
    },
    append(field: string, values: unknown[]) {
      patch.appended.push({ field, values });
      return patch;
    },
  };
  return patch;
}

beforeEach(() => {
  process.env.SANITY_API_TOKEN = 'test-token';
  state = { order: null, revision: 0, stock: 3 };
  sentNotifications = new Set();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.createIfNotExists.mockImplementation(async (document: Record<string, unknown>) => {
    if (!state.order) {
      state.order = { ...document };
      state.revision = 1;
    }
  });
  mocks.fetch.mockImplementation(async (query: string) => {
    if (query.includes('stockQuantity')) {
      return [{ _id: 'p1', hasQty: true, hasLegacy: false, stockQuantity: state.stock, variants: [] }];
    }
    if (!state.order) return null;
    return {
      _rev: `rev-${state.revision}`,
      status: state.order.status,
      paymentStatus: state.order.paymentStatus,
      stockAdjusted: state.order.stockAdjusted,
    };
  });
  mocks.patch.mockImplementation(() => makePatch());
  mocks.transaction.mockImplementation(() => {
    const staged: { id: string; change: unknown }[] = [];
    return {
      patch(id: string, change: unknown) {
        staged.push({
          id,
          change: id === 'orders.NS-TEST0001' && typeof change === 'function'
            ? (change as (patch: never) => ReturnType<typeof makePatch>)(makePatch() as never)
            : change,
        });
        return this;
      },
      async commit() {
        const orderChange = staged.find((item) => item.id === 'orders.NS-TEST0001')?.change;
        if (!state.order || !orderChange || typeof orderChange === 'function') throw new Error('Missing order patch.');
        const orderPatch = orderChange as ReturnType<typeof makePatch>;
        if (orderPatch.expectedRevision !== `rev-${state.revision}`) {
          throw Object.assign(new Error('Revision conflict'), { statusCode: 409 });
        }
        state.order = { ...state.order, ...orderPatch.values };
        for (const entry of orderPatch.appended) {
          state.order[entry.field] = [...((state.order[entry.field] as unknown[]) ?? []), ...entry.values];
        }
        state.revision++;
        for (const item of staged) {
          if (item.id === 'orders.NS-TEST0001' || typeof item.change !== 'function') continue;
          (item.change as (patch: { inc: (values: Record<string, number>) => void }) => void)({
            inc(values) {
              state.stock += values.stockQuantity ?? 0;
            },
          });
        }
      },
    };
  });
  mocks.notify.mockImplementation(async (orderId: string, event: { status: string }) => {
    const key = `${orderId}:${event.status}`;
    if (sentNotifications.has(key)) return { sent: false, reason: 'duplicate' };
    sentNotifications.add(key);
    return { sent: true, channel: 'email' };
  });
});

afterEach(() => {
  delete process.env.SANITY_API_TOKEN;
});

const makeOrder = (paymentStatus: 'pending' | 'failed' | 'paid' = 'paid') => ({
  orderId: 'NS-TEST0001',
  items: [{ productId: 'p1', name: 'Test Product', quantity: 1, price: 100 }],
  shippingAddress: { fullName: 'Test Customer', phone: '9999999999', line1: 'Street', city: 'Mathura', state: 'UP', pincode: '281001' },
  subtotal: 100,
  deliveryCharge: 0,
  discount: 0,
  total: 100,
  paymentMethod: 'online',
  paymentGateway: 'cashfree',
  paymentStatus,
  status: paymentStatus === 'paid' ? 'confirmed' : 'pending',
  cashfreeOrderId: 'NS-TEST0001',
  createdAt: new Date('2026-10-22T00:00:00Z'),
});

describe('Cashfree Sanity synchronization', () => {
  it('accepts a paid order when stock is gone, allows negative stock, and flags manual attention', async () => {
    state.stock = 0;

    expect(await pushConfirmedOrderToSanity(makeOrder() as never, 'Payment received')).toBe(true);

    expect(state.order).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
      stockAdjusted: true,
      needsAttention: true,
      attentionNote: expect.stringContaining('Test Product'),
    });
    expect(state.stock).toBe(-1);
    expect(sentNotifications.size).toBe(1);
  });

  it('recovers the same order from payment_failed to paid and adjusts stock only once', async () => {
    const failedOrder = makeOrder('failed');
    expect(await pushCashfreePaymentFailureToSanity(failedOrder as never, 'Payment failed')).toBe(true);
    expect(state.stock).toBe(3);
    expect(state.order).toMatchObject({ status: 'payment_failed', paymentStatus: 'failed', stockAdjusted: false });

    expect(await pushConfirmedOrderToSanity(makeOrder() as never, 'Payment received on retry')).toBe(true);

    expect(state.order).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', stockAdjusted: true });
    expect(state.stock).toBe(2);
    expect(sentNotifications.size).toBe(1);
  });

  it('concurrent paid sync attempts adjust stock once and dedupe the confirmation notification', async () => {
    const paidOrder = makeOrder();

    await Promise.all([
      pushConfirmedOrderToSanity(paidOrder as never, 'Webhook payment received'),
      pushConfirmedOrderToSanity(paidOrder as never, 'Verify payment received'),
    ]);

    expect(state.order).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', stockAdjusted: true });
    expect(state.stock).toBe(2);
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    expect(sentNotifications.size).toBe(1);
  });
});
