import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  updateOne: vi.fn(),
  settle: vi.fn(),
  resync: vi.fn(),
  ensureShiprocket: vi.fn(),
  release: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock('@/backend/models/Order', () => ({
  Order: {
    find: (...a: unknown[]) => mocks.find(...a),
    updateOne: (...a: unknown[]) => mocks.updateOne(...a),
  },
}));
vi.mock('@/backend/lib/cashfreeSettlement', () => ({ settleCashfreeOrder: (...a: unknown[]) => mocks.settle(...a) }));
vi.mock('@/backend/lib/sanityOrders', () => ({ resyncOrderToSanity: (...a: unknown[]) => mocks.resync(...a) }));
vi.mock('@/backend/lib/shiprocketFulfilment', () => ({ ensureShiprocketOrder: (...a: unknown[]) => mocks.ensureShiprocket(...a) }));
vi.mock('@/backend/lib/stockHold', () => ({ releaseStockHold: (...a: unknown[]) => mocks.release(...a), HOLD_MINUTES: 30 }));
vi.mock('@/backend/lib/ownerAlert', () => ({ alertOwnerOrderIssue: (...a: unknown[]) => mocks.alert(...a) }));

import { GET, POST } from '@/app/api/cron/reconcile-orders/route';

const SECRET = 'test-cron-secret-value';
const old = (mins: number) => new Date(Date.now() - mins * 60_000);
const order = (over: Record<string, unknown> = {}) => ({
  _id: 'id1',
  orderId: 'NS-AAAA1111',
  total: 500,
  shippingAddress: { fullName: 'Asha', phone: '9140110859' },
  createdAt: old(60),
  ...over,
});

/** Order.find() calls happen in bucket order: abandoned, unsynced, [unbooked], flagged. */
function queueFinds(...buckets: unknown[][]) {
  let i = 0;
  mocks.find.mockImplementation(() => {
    const rows = buckets[i++] ?? [];
    return { sort: () => ({ limit: async () => rows }) };
  });
}

const req = (headers: Record<string, string> = {}, method = 'POST') =>
  new NextRequest('https://nikunjsakhi.in/api/cron/reconcile-orders', { method, headers });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  delete process.env.SHIPROCKET_ENABLED;
  mocks.alert.mockResolvedValue('sent');
  mocks.release.mockResolvedValue(undefined);
  queueFinds([], [], []);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.SHIPROCKET_ENABLED;
});

describe('reconcile-orders auth', () => {
  it('returns 401 without a secret', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('returns 401 with a wrong secret', async () => {
    const res = await POST(req({ authorization: 'Bearer nope' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ authorization: 'Bearer undefined' }));
    expect(res.status).toBe(401);
  });

  it('accepts the Bearer header and returns a summary', async () => {
    const res = await POST(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, settled: 0, failed: 0, resynced: 0, shiprocketBooked: 0, alerted: 0, errors: 0 });
  });

  it('accepts the x-cron-secret header on GET', async () => {
    const res = await GET(req({ 'x-cron-secret': SECRET }, 'GET'));
    expect(res.status).toBe(200);
  });
});

describe('reconcile-orders buckets', () => {
  const auth = { authorization: `Bearer ${SECRET}` };

  it('confirms an expired pending order that Cashfree reports as paid', async () => {
    queueFinds([order({ paymentMethod: 'online', paymentGateway: 'cashfree', cashfreeOrderId: 'cf1' })], [], []);
    mocks.settle.mockResolvedValue({ state: 'paid' });
    const body = await (await POST(req(auth))).json();
    expect(body.settled).toBe(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('fails an abandoned order and releases its stock hold', async () => {
    queueFinds([order({ paymentMethod: 'online', paymentGateway: 'cashfree', cashfreeOrderId: 'cf1' })], [], []);
    mocks.settle.mockResolvedValue({ state: 'failed' });
    const body = await (await POST(req(auth))).json();
    expect(body.failed).toBe(1);
    expect(mocks.release).toHaveBeenCalledWith('NS-AAAA1111');
  });

  it('fails an online order that never created a Cashfree order', async () => {
    queueFinds([order({ paymentMethod: 'online' })], [], []);
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    const body = await (await POST(req(auth))).json();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: { paymentStatus: 'failed' } });
    expect(mocks.release).toHaveBeenCalled();
    expect(body.failed).toBe(1);
  });

  it('queries gateway orders of any method with no lookback floor', async () => {
    await POST(req(auth));
    const filter = mocks.find.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.$or).toEqual([{ paymentMethod: { $in: ['online', 'card', 'netbanking'] } }, { paymentGateway: 'cashfree' }]);
    expect(filter.createdAt).toEqual({ $lt: expect.any(Date) });
  });

  it('fails and releases a legacy card order that has no Cashfree order', async () => {
    queueFinds([order({ paymentMethod: 'card', stockHeld: true, createdAt: old(60 * 24 * 20) })], [], []);
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    const body = await (await POST(req(auth))).json();
    expect(body.failed).toBe(1);
    expect(mocks.release).toHaveBeenCalledWith('NS-AAAA1111');
  });

  it('alerts the owner when a Cashfree payment mismatches', async () => {
    queueFinds([order({ paymentMethod: 'online', paymentGateway: 'cashfree', cashfreeOrderId: 'cf1' })], [], []);
    mocks.settle.mockResolvedValue({ state: 'mismatch' });
    const body = await (await POST(req(auth))).json();
    expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({ orderNumber: 'NS-AAAA1111', stage: 'stuck_order' }));
    expect(body.alerted).toBe(1);
  });

  it('re-syncs orders missing in Sanity', async () => {
    queueFinds([], [order({ paymentMethod: 'cod', stockHeld: true })], []);
    mocks.resync.mockResolvedValue(true);
    const body = await (await POST(req(auth))).json();
    expect(mocks.resync).toHaveBeenCalledWith('NS-AAAA1111');
    expect(body.resynced).toBe(1);
  });

  it('alerts when an old order still cannot be synced', async () => {
    queueFinds([], [order({ paymentMethod: 'cod', stockHeld: true, createdAt: old(120) })], []);
    mocks.resync.mockResolvedValue(false);
    const body = await (await POST(req(auth))).json();
    expect(body.resynced).toBe(0);
    expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({ stage: 'stuck_order' }));
  });

  it('skips the Shiprocket retry unless SHIPROCKET_ENABLED is "true"', async () => {
    await POST(req(auth));
    expect(mocks.find).toHaveBeenCalledTimes(3);
    expect(mocks.ensureShiprocket).not.toHaveBeenCalled();
  });

  it('retries Shiprocket booking when enabled', async () => {
    process.env.SHIPROCKET_ENABLED = 'true';
    queueFinds([], [], [order({ status: 'confirmed', paymentMethod: 'cod' })], []);
    mocks.ensureShiprocket.mockResolvedValue({ ok: true, created: true });
    const body = await (await POST(req(auth))).json();
    expect(mocks.ensureShiprocket).toHaveBeenCalledWith('NS-AAAA1111');
    expect(body.shiprocketBooked).toBe(1);
  });

  it('counts a failed Shiprocket booking as an error', async () => {
    process.env.SHIPROCKET_ENABLED = 'true';
    queueFinds([], [], [order({ status: 'confirmed', paymentMethod: 'cod' })], []);
    mocks.ensureShiprocket.mockResolvedValue({ ok: false, error: 'boom' });
    const body = await (await POST(req(auth))).json();
    expect(body.errors).toBe(1);
    expect(body.shiprocketBooked).toBe(0);
  });

  it('alerts the owner for orders stuck in needsAttention', async () => {
    queueFinds([], [], [order({ needsAttention: true, attentionNote: 'Shiprocket booking failed' })]);
    const body = await (await POST(req(auth))).json();
    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'stuck_order', reason: expect.stringContaining('Shiprocket booking failed') }),
    );
    expect(body.alerted).toBe(1);
  });

  it('does not count deduplicated alerts and keeps going after an error', async () => {
    queueFinds([], [order({ stockHeld: true, paymentMethod: 'cod' }), order({ orderId: 'NS-BBBB2222', stockHeld: true, paymentMethod: 'cod' })], []);
    mocks.resync.mockRejectedValueOnce(new Error('sanity down')).mockResolvedValueOnce(true);
    const body = await (await POST(req(auth))).json();
    expect(body.errors).toBe(1);
    expect(body.resynced).toBe(1);
  });
});
