import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
  notifyOrder: vi.fn(),
  patchCommit: vi.fn(),
  patchSet: vi.fn(),
}));

vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock('@/backend/lib/orderNotify', () => ({ notifyOrder: mocks.notifyOrder }));
vi.mock('@/backend/models/Order', () => ({
  Order: {
    findOne: (...a: unknown[]) => {
      const q = { select: () => q, lean: () => mocks.findOne(...a) };
      return q;
    },
    updateOne: (...a: unknown[]) => mocks.updateOne(...a),
  },
}));
vi.mock('@/cms/lib/client', () => {
  const patch = () => {
    const p: Record<string, unknown> = {};
    for (const m of ['setIfMissing', 'set', 'unset', 'append']) p[m] = (...a: unknown[]) => { if (m === 'set') mocks.patchSet(...a); return p; };
    p.commit = mocks.patchCommit;
    return p;
  };
  return { writeClient: { patch, fetch: vi.fn(async () => null) } };
});
vi.mock('@/cms/lib/orderOps', () => ({ historyEntry: (status: string, note: string) => ({ status, note }) }));

import {
  buildShiprocketPayload, createShiprocketOrder, mapShiprocketStatus, resetShiprocketTokenCache, shiprocketRequest,
} from '@/backend/lib/shiprocket';
import { applyShiprocketStatusUpdate, ensureShiprocketOrder, isShiprocketEligible } from '@/backend/lib/shiprocketFulfilment';
import { buildMongoStatusUpdate } from '@/backend/lib/orderStatusSync';
import { POST as shiprocketWebhook } from '@/app/api/webhooks/courier-status/route';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const baseOrder = (over: Record<string, unknown> = {}) => ({
  orderId: 'NS-AB12CD34',
  status: 'confirmed',
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  subtotal: 1000,
  deliveryCharge: 50,
  discount: 100,
  total: 950,
  createdAt: new Date('2026-01-02T10:00:00Z'),
  shippingAddress: { fullName: 'Asha Devi Sharma', phone: '+91 91401 10859', line1: '12 Temple Rd', city: 'Pune', state: 'MH', pincode: '411001' },
  items: [{ productId: 'prod-1', name: 'Mukut', selectedSize: '0-10', quantity: 2, price: 500 }],
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.SHIPROCKET_EMAIL = 'ops@example.test';
  process.env.SHIPROCKET_PASSWORD = 'pw';
  process.env.SHIPROCKET_PICKUP_LOCATION = 'Warehouse';
  process.env.SHIPROCKET_ENABLED = 'true';
  delete process.env.AUTO_SHIP_AWB;
  delete process.env.SANITY_API_TOKEN;
  resetShiprocketTokenCache();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  mocks.findOne.mockReset();
  mocks.updateOne.mockReset().mockResolvedValue({ modifiedCount: 1 });
  mocks.notifyOrder.mockReset().mockResolvedValue({ sent: true });
  mocks.patchCommit.mockReset().mockResolvedValue({});
  mocks.patchSet.mockReset();
});

describe('Shiprocket client: auth', () => {
  it('caches the bearer token across calls', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.endsWith('/auth/login') ? json({ token: 'tok-1' }) : json({ ok: true })));
    await shiprocketRequest('/a');
    await shiprocketRequest('/b');
    const logins = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth/login'));
    expect(logins).toHaveLength(1);
  });

  it('re-authenticates once on a 401 and retries the call', async () => {
    let tokens = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/auth/login')) return json({ token: `tok-${++tokens}` });
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth.endsWith('tok-1') ? json({ message: 'expired' }, 401) : json({ done: true });
    });
    await expect(shiprocketRequest('/x')).resolves.toEqual({ done: true });
    expect(tokens).toBe(2);
  });
});

describe('Shiprocket payload mapping', () => {
  it('maps a COD order with the amount to collect', () => {
    const p = buildShiprocketPayload(baseOrder() as never);
    expect(p).toMatchObject({
      order_id: 'NS-AB12CD34', payment_method: 'COD', pickup_location: 'Warehouse', billing_phone: '9140110859',
      billing_customer_name: 'Asha', billing_last_name: 'Devi Sharma', sub_total: 1000, shipping_charges: 50, total_discount: 100,
      weight: 0.5, length: 10, breadth: 10, height: 5,
    });
    expect(p.order_items[0]).toMatchObject({ sku: 'prod-1', units: 2, selling_price: 500, name: 'Mukut - 0-10' });
  });

  it('maps online-paid and already-paid COD orders as Prepaid', () => {
    expect(buildShiprocketPayload(baseOrder({ paymentMethod: 'online', paymentStatus: 'paid' }) as never).payment_method).toBe('Prepaid');
    expect(buildShiprocketPayload(baseOrder({ paymentStatus: 'paid' }) as never).payment_method).toBe('Prepaid');
  });

  it('falls back to the Primary pickup location', () => {
    delete process.env.SHIPROCKET_PICKUP_LOCATION;
    expect(buildShiprocketPayload(baseOrder() as never).pickup_location).toBe('Primary');
  });

  it('createShiprocketOrder returns the ids', async () => {
    fetchMock.mockImplementation(async (url: string) => (String(url).endsWith('/auth/login') ? json({ token: 't' }) : json({ order_id: 77, shipment_id: 88 })));
    await expect(createShiprocketOrder(baseOrder() as never)).resolves.toEqual({ shiprocketOrderId: '77', shiprocketShipmentId: '88' });
  });
});

describe('ensureShiprocketOrder', () => {
  const happyFetch = () =>
    fetchMock.mockImplementation(async (url: string) => (String(url).endsWith('/auth/login') ? json({ token: 't' }) : json({ order_id: 77, shipment_id: 88 })));

  it('books an eligible order and stores the ids', async () => {
    happyFetch();
    mocks.findOne.mockResolvedValue(baseOrder());
    const res = await ensureShiprocketOrder('NS-AB12CD34');
    expect(res).toMatchObject({ ok: true, created: true, shiprocketOrderId: '77' });
    expect(mocks.updateOne).toHaveBeenCalledWith({ orderId: 'NS-AB12CD34' }, expect.objectContaining({ $set: expect.objectContaining({ shiprocketOrderId: '77', shiprocketShipmentId: '88' }) }));
  });

  it('is idempotent: no Shiprocket call when shiprocketOrderId already exists', async () => {
    mocks.findOne.mockResolvedValue(baseOrder({ shiprocketOrderId: '55' }));
    expect(await ensureShiprocketOrder('NS-AB12CD34')).toEqual({ ok: true, created: false, reason: 'exists' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not double-create when another caller holds the claim', async () => {
    mocks.findOne.mockResolvedValue(baseOrder());
    mocks.updateOne.mockResolvedValue({ modifiedCount: 0 });
    expect(await ensureShiprocketOrder('NS-AB12CD34')).toEqual({ ok: true, created: false, reason: 'in_progress' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips self-delivery, unpaid online and disabled setups', async () => {
    mocks.findOne.mockResolvedValue(baseOrder({ fulfilmentMode: 'SELF_DELIVERY' }));
    expect(await ensureShiprocketOrder('NS-AB12CD34')).toMatchObject({ reason: 'self_delivery' });
    mocks.findOne.mockResolvedValue(baseOrder({ paymentMethod: 'online', paymentStatus: 'pending' }));
    expect(await ensureShiprocketOrder('NS-AB12CD34')).toMatchObject({ reason: 'ineligible' });
    process.env.SHIPROCKET_ENABLED = 'false';
    expect(await ensureShiprocketOrder('NS-AB12CD34')).toMatchObject({ reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags needsAttention instead of throwing when Shiprocket fails', async () => {
    fetchMock.mockImplementation(async (url: string) => (String(url).endsWith('/auth/login') ? json({ token: 't' }) : json({ message: 'bad pincode' }, 422)));
    mocks.findOne.mockResolvedValue(baseOrder());
    const res = await ensureShiprocketOrder('NS-AB12CD34');
    expect(res.ok).toBe(false);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { orderId: 'NS-AB12CD34' },
      expect.objectContaining({ $set: expect.objectContaining({ needsAttention: true, shiprocketError: expect.stringContaining('bad pincode') }) }),
    );
  });

  it('is fully inert (no DB, no HTTP) when SHIPROCKET_ENABLED is unset or false, even with credentials', async () => {
    mocks.findOne.mockResolvedValue(baseOrder());
    for (const v of [undefined, 'false', '']) {
      if (v === undefined) delete process.env.SHIPROCKET_ENABLED;
      else process.env.SHIPROCKET_ENABLED = v;
      expect(await ensureShiprocketOrder('NS-AB12CD34')).toEqual({ ok: true, created: false, reason: 'disabled' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.findOne).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('eligibility rules', () => {
    expect(isShiprocketEligible({ status: 'confirmed', paymentMethod: 'online', paymentStatus: 'paid' })).toBe(true);
    expect(isShiprocketEligible({ status: 'pending', paymentMethod: 'cod', paymentStatus: 'pending' })).toBe(true);
    expect(isShiprocketEligible({ status: 'shipped', paymentMethod: 'cod', paymentStatus: 'pending' })).toBe(false);
    expect(isShiprocketEligible({ status: 'cancelled', paymentMethod: 'online', paymentStatus: 'paid' })).toBe(false);
  });
});

describe('Shiprocket status mapping', () => {
  it('maps courier statuses to order statuses', () => {
    expect(mapShiprocketStatus('SHIPPED')?.status).toBe('shipped');
    expect(mapShiprocketStatus('In Transit')?.status).toBe('shipped');
    expect(mapShiprocketStatus('OUT FOR DELIVERY')?.status).toBe('shipped');
    expect(mapShiprocketStatus('DELIVERED')?.status).toBe('delivered');
    expect(mapShiprocketStatus('RTO DELIVERED')?.status).toBe('returned');
    expect(mapShiprocketStatus('RTO')?.attention).toBeTruthy();
    expect(mapShiprocketStatus('CANCELED')?.status).toBeUndefined();
    expect(mapShiprocketStatus('CANCELED')?.attention).toBeTruthy();
    expect(mapShiprocketStatus('SOMETHING NEW')).toBeNull();
  });
});

describe('applyShiprocketStatusUpdate', () => {
  it('moves a confirmed order to shipped, stores tracking and notifies once', async () => {
    mocks.findOne.mockResolvedValue(baseOrder({ status: 'processing' }));
    const out = await applyShiprocketStatusUpdate({ order_id: 'NS-AB12CD34', awb: 123, courier_name: 'Delhivery', current_status: 'SHIPPED' });
    expect(out).toEqual({ handled: true, status: 'shipped' });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { orderId: 'NS-AB12CD34', status: 'processing' },
      { $set: expect.objectContaining({ status: 'shipped', awbCode: '123', courierName: 'Delhivery' }) },
    );
    expect(mocks.notifyOrder).toHaveBeenCalledTimes(1);
  });

  it('marks COD paid on delivery', async () => {
    mocks.findOne.mockResolvedValue(baseOrder({ status: 'shipped' }));
    await applyShiprocketStatusUpdate({ order_id: 'NS-AB12CD34', current_status: 'DELIVERED' });
    expect(mocks.updateOne).toHaveBeenCalledWith({ orderId: 'NS-AB12CD34', status: 'shipped' }, { $set: expect.objectContaining({ status: 'delivered', paymentStatus: 'paid' }) });
  });

  it('never moves an order backwards and sends no duplicate notification', async () => {
    mocks.findOne.mockResolvedValue(baseOrder({ status: 'delivered' }));
    const out = await applyShiprocketStatusUpdate({ order_id: 'NS-AB12CD34', current_status: 'SHIPPED' });
    expect(out).toMatchObject({ handled: false, reason: 'no_change' });
    expect(mocks.notifyOrder).not.toHaveBeenCalled();
  });

  it('a concurrent duplicate event (status already changed) is a no-op', async () => {
    mocks.findOne.mockResolvedValue(baseOrder({ status: 'shipped' }));
    mocks.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await applyShiprocketStatusUpdate({ order_id: 'NS-AB12CD34', current_status: 'DELIVERED' });
    expect(mocks.notifyOrder).not.toHaveBeenCalled();
  });

  it('RTO and cancellations only flag attention', async () => {
    mocks.findOne.mockResolvedValue(baseOrder({ status: 'shipped' }));
    const out = await applyShiprocketStatusUpdate({ order_id: 'NS-AB12CD34', current_status: 'RTO INITIATED' });
    expect(out).toEqual({ handled: true, status: 'shipped' });
    expect(mocks.updateOne).toHaveBeenCalledWith({ orderId: 'NS-AB12CD34' }, expect.objectContaining({ $set: expect.objectContaining({ needsAttention: true }) }));
    expect(mocks.notifyOrder).not.toHaveBeenCalled();
  });

  it('ignores unknown orders and unmapped statuses', async () => {
    mocks.findOne.mockResolvedValue(null);
    expect(await applyShiprocketStatusUpdate({ order_id: 'NS-ZZZZZZZZ', current_status: 'SHIPPED' })).toMatchObject({ reason: 'unknown_order' });
    mocks.findOne.mockResolvedValue(baseOrder());
    expect(await applyShiprocketStatusUpdate({ order_id: 'NS-AB12CD34', current_status: 'PICKUP SCHEDULED' })).toMatchObject({ reason: 'unmapped_status' });
  });
});

describe('POST /api/webhooks/courier-status', () => {
  const call = (key: string | null, body: unknown) =>
    shiprocketWebhook(new NextRequest('http://localhost/api/webhooks/courier-status', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    }));

  it('fails closed without a configured secret and rejects a wrong key', async () => {
    delete process.env.SHIPROCKET_WEBHOOK_SECRET;
    expect((await call('anything', {})).status).toBe(401);
    process.env.SHIPROCKET_WEBHOOK_SECRET = 'sr-secret';
    expect((await call('wrong', {})).status).toBe(401);
    expect((await call(null, {})).status).toBe(401);
  });

  it('applies a valid event', async () => {
    process.env.SHIPROCKET_WEBHOOK_SECRET = 'sr-secret';
    mocks.findOne.mockResolvedValue(baseOrder({ status: 'shipped' }));
    const res = await call('sr-secret', { order_id: 'NS-AB12CD34', current_status: 'DELIVERED' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, handled: true, status: 'delivered' });
  });
});

describe('buildMongoStatusUpdate (Sanity -> Mongo)', () => {
  it('copies status, marks COD delivered as paid and copies tracking', () => {
    const set = buildMongoStatusUpdate({ status: 'delivered', tracking: { courier: 'DTDC', trackingNumber: 'A1', trackingUrl: 'https://t/A1' } }, { paymentMethod: 'cod' });
    expect(set).toMatchObject({ status: 'delivered', paymentStatus: 'paid', 'tracking.courier': 'DTDC', 'tracking.trackingNumber': 'A1', awbCode: 'A1' });
  });

  it('does not copy Sanity-only states and stores out_for_delivery as shipped', () => {
    expect(buildMongoStatusUpdate({ status: 'payment_failed' }, { paymentMethod: 'online' })).not.toHaveProperty('status');
    expect(buildMongoStatusUpdate({ status: 'out_for_delivery' }, { paymentMethod: 'online' }).status).toBe('shipped');
  });

  it('does not mark online orders paid on delivery', () => {
    expect(buildMongoStatusUpdate({ status: 'delivered' }, { paymentMethod: 'online' })).not.toHaveProperty('paymentStatus');
  });
});
