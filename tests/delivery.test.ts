import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const commit = vi.fn().mockResolvedValue({});
  const patch: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['setIfMissing', 'set', 'append']) patch[m] = vi.fn(() => patch);
  patch.commit = commit;
  return {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({}),
    getSanityOrder: vi.fn(),
    sendDeliveryOtpWhatsApp: vi.fn(),
    sendWhatsAppOtp: vi.fn(),
    isWhatsAppConfigured: vi.fn(),
    sendEmail: vi.fn(),
    patch,
    writePatch: vi.fn(() => patch),
  };
});

vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/backend/models/Order', () => ({
  Order: { findOne: mocks.findOne, findOneAndUpdate: mocks.findOneAndUpdate, updateOne: mocks.updateOne },
}));
vi.mock('@/backend/lib/sanityOrders', () => ({
  getSanityOrder: mocks.getSanityOrder,
  sanityOrderId: (id: string) => `orders.${id}`,
}));
vi.mock('@/backend/lib/whatsapp', () => ({
  sendDeliveryOtpWhatsApp: mocks.sendDeliveryOtpWhatsApp,
  sendWhatsAppOtp: mocks.sendWhatsAppOtp,
  isWhatsAppConfigured: mocks.isWhatsAppConfigured,
}));
vi.mock('@/backend/lib/email', () => ({ isEmailConfigured: () => true, sendEmail: mocks.sendEmail }));
vi.mock('@/cms/lib/orderOps', () => ({ historyEntry: (status: string, note: string) => ({ status, note }) }));
vi.mock('@/cms/lib/client', () => ({ writeClient: { patch: mocks.writePatch } }));

import { assignDelivery, deliveryView, ensureDeliveryCode, MAX_ATTEMPTS, resendDeliveryCode, TOKEN_PATTERN, verifyDelivery } from '@/backend/lib/delivery';
import { deliveryOtp } from '@/backend/lib/otpHash';
import { deliveryCodeMessage, deliveryPartnerMessage } from '@/cms/lib/orderMessages';

const TOKEN = 'a'.repeat(32);
const ORDER_ID = 'NS-AB12CD34';

function fakeOrder(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> & { set: (path: string, v: unknown) => void; save: () => Promise<void> } = {
    _id: 'oid1',
    orderId: ORDER_ID,
    status: 'confirmed',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    total: 1049,
    shippingAddress: { phone: '9876543210', fullName: 'Radha Devi' },
    ...overrides,
    set(path: string, value: unknown) {
      if (path === 'delivery') doc.delivery = value;
      else if (path.startsWith('delivery.')) doc.delivery = { ...(doc.delivery as object), [path.slice(9)]: value };
    },
    save: vi.fn().mockResolvedValue(undefined),
  };
  return doc;
}

beforeEach(() => {
  process.env.SANITY_API_TOKEN = 'test-token';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example';
  for (const fn of [mocks.findOne, mocks.findOneAndUpdate, mocks.getSanityOrder, mocks.sendDeliveryOtpWhatsApp, mocks.sendWhatsAppOtp, mocks.writePatch]) fn.mockReset();
  mocks.writePatch.mockImplementation(() => mocks.patch);
  for (const m of ['setIfMissing', 'set', 'append']) mocks.patch[m].mockClear();
  mocks.patch.commit.mockClear().mockResolvedValue({});
  mocks.updateOne.mockClear();
  mocks.getSanityOrder.mockResolvedValue({ status: 'confirmed', paymentStatus: 'pending' });
  mocks.sendDeliveryOtpWhatsApp.mockResolvedValue(true);
  mocks.sendWhatsAppOtp.mockResolvedValue(false);
  mocks.isWhatsAppConfigured.mockReset().mockReturnValue(true);
});

describe('assignDelivery', () => {
  it('creates a link, marks the order shipped and WhatsApps the customer their code', async () => {
    const order = fakeOrder();
    mocks.findOne.mockResolvedValue(order);
    const res = await assignDelivery(ORDER_ID, { partnerName: 'Ravi' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const token = (order.delivery as { token: string }).token;
    expect(token).toMatch(TOKEN_PATTERN);
    expect(res.link).toBe(`https://shop.example/deliver/${token}`);
    expect(res.otpSent).toBe(true);
    expect(res.otp).toBeUndefined(); // never handed to the owner when WhatsApp delivered it
    expect(order.status).toBe('shipped');
    expect(mocks.sendDeliveryOtpWhatsApp).toHaveBeenCalledWith('9876543210', deliveryOtp(ORDER_ID, token), ORDER_ID, expect.any(Function));
    expect(mocks.patch.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'shipped', 'delivery.otpRequired': true }));
  });

  it('returns the code to the owner only when WhatsApp could not send it', async () => {
    const order = fakeOrder();
    mocks.findOne.mockResolvedValue(order);
    mocks.sendDeliveryOtpWhatsApp.mockResolvedValue(false);
    const res = await assignDelivery(ORDER_ID);
    expect(res.ok && res.otpSent).toBe(false);
    if (res.ok) expect(res.otp).toBe(deliveryOtp(ORDER_ID, (order.delivery as { token: string }).token));
  });

  it('never emails the delivery code when WhatsApp fails; reports failure honestly and keeps the website code', async () => {
    const order = fakeOrder({ userId: 'u1' });
    mocks.findOne.mockResolvedValue(order);
    mocks.sendDeliveryOtpWhatsApp.mockResolvedValue(false);
    mocks.sendWhatsAppOtp.mockResolvedValue(false);
    const res = await assignDelivery(ORDER_ID);
    expect(res.ok && res.otpSent).toBe(false);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.updateOne).toHaveBeenCalledWith({ orderId: ORDER_ID }, { $set: { 'delivery.otpStatus': 'failed' } });
    const view = deliveryView(order as never, 'shipped', true);
    expect(view).toMatchObject({ otpStatus: null, code: deliveryOtp(ORDER_ID, (order.delivery as { token: string }).token) });
  });

  it('sends only to the delivery phone, records accepted status and the provider message id', async () => {
    const order = fakeOrder({ userId: 'u1' });
    mocks.findOne.mockResolvedValue(order);
    mocks.sendDeliveryOtpWhatsApp.mockImplementation(async (_p: string, _o: string, _i: string, cb?: (id: string) => void) => { cb?.('wamid.ABC'); return true; });
    await assignDelivery(ORDER_ID);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { orderId: ORDER_ID },
      { $set: expect.objectContaining({ 'delivery.otpStatus': 'accepted', 'delivery.otpMessageId': 'wamid.ABC' }) },
    );
    expect(mocks.sendDeliveryOtpWhatsApp.mock.calls[0][0]).toBe('9876543210');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('hides the code from non-owners and after the PIN expires', () => {
    const fresh = { orderId: ORDER_ID, delivery: { token: TOKEN, assignedAt: new Date() } };
    expect(deliveryView(fresh as never, 'shipped', false)).not.toHaveProperty('code');
    expect(deliveryView(fresh as never, 'shipped', true)).toHaveProperty('code');
    const old = { orderId: ORDER_ID, delivery: { token: TOKEN, assignedAt: new Date(Date.now() - 100 * 3_600_000) } };
    expect(deliveryView(old as never, 'shipped', true)).toMatchObject({ expired: true });
    expect(deliveryView(old as never, 'shipped', true)).not.toHaveProperty('code');
  });

  it('rejects an expired PIN and a PIN from a different order', async () => {
    const old = fakeOrder({ status: 'shipped', delivery: { token: TOKEN, attempts: 0, assignedAt: new Date(Date.now() - 100 * 3_600_000) } });
    mocks.findOne.mockResolvedValue(old);
    const expired = await verifyDelivery(TOKEN, deliveryOtp(ORDER_ID, TOKEN));
    expect(expired).toMatchObject({ ok: false, status: 410 });
    const live = fakeOrder({ status: 'shipped', delivery: { token: TOKEN, attempts: 0, assignedAt: new Date() } });
    mocks.findOne.mockResolvedValue(live);
    mocks.getSanityOrder.mockResolvedValue({ status: 'shipped' });
    mocks.findOneAndUpdate.mockResolvedValue({ delivery: { attempts: 1 } });
    const cross = await verifyDelivery(TOKEN, deliveryOtp('NS-OTHER-ORDER', TOKEN));
    expect(cross).toMatchObject({ ok: false, status: 400 });
  });

  it('reuses the existing link unless asked to regenerate', async () => {
    const order = fakeOrder({ status: 'shipped', delivery: { token: TOKEN, attempts: 1, assignedAt: new Date() } });
    mocks.findOne.mockResolvedValue(order);
    mocks.getSanityOrder.mockResolvedValue({ status: 'shipped' });
    const same = await assignDelivery(ORDER_ID);
    expect(same.ok && same.link.endsWith(TOKEN)).toBe(true);

    const fresh = await assignDelivery(ORDER_ID, { regenerate: true });
    expect(fresh.ok && !fresh.link.endsWith(TOKEN)).toBe(true);
    expect((order.delivery as { attempts: number }).attempts).toBe(0);
  });

  it('refuses delivered, cancelled or unknown orders', async () => {
    mocks.findOne.mockResolvedValue(null);
    expect((await assignDelivery(ORDER_ID)).ok).toBe(false);
    mocks.findOne.mockResolvedValue(fakeOrder());
    mocks.getSanityOrder.mockResolvedValue({ status: 'cancelled' });
    expect(await assignDelivery(ORDER_ID)).toMatchObject({ ok: false, status: 409 });
    mocks.getSanityOrder.mockResolvedValue({ status: 'delivered' });
    expect(await assignDelivery(ORDER_ID)).toMatchObject({ ok: false, status: 409 });
  });
});

describe('verifyDelivery', () => {
  const shipped = (delivery: Record<string, unknown> = {}) =>
    fakeOrder({ status: 'shipped', delivery: { token: TOKEN, attempts: 0, partnerName: 'Ravi', ...delivery } });

  beforeEach(() => mocks.getSanityOrder.mockResolvedValue({ status: 'shipped', paymentStatus: 'pending' }));

  it('marks the order delivered (and COD paid) with the right code', async () => {
    mocks.findOne.mockResolvedValue(shipped());
    mocks.findOneAndUpdate.mockResolvedValue({ ok: 1 });
    const res = await verifyDelivery(TOKEN, deliveryOtp(ORDER_ID, TOKEN));
    expect(res).toEqual({ ok: true, orderId: ORDER_ID, codCollected: 1049 });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ 'delivery.verifiedAt': { $exists: false } }),
      { $set: expect.objectContaining({ status: 'delivered', paymentStatus: 'paid' }) },
      expect.anything(),
    );
    expect(mocks.patch.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered', paymentStatus: 'paid' }));
    expect(mocks.patch.append).toHaveBeenCalledWith('statusHistory', [expect.objectContaining({ status: 'delivered' })]);
  });

  it('counts wrong codes and locks the link at the limit', async () => {
    mocks.findOne.mockResolvedValue(shipped({ attempts: 3 }));
    mocks.findOneAndUpdate.mockResolvedValue({ delivery: { attempts: 4 } });
    const wrong = deliveryOtp(ORDER_ID, TOKEN) === '000000' ? '111111' : '000000';
    expect(await verifyDelivery(TOKEN, wrong)).toMatchObject({ ok: false, status: 400, attemptsLeft: 1 });

    mocks.findOneAndUpdate.mockResolvedValue({ delivery: { attempts: MAX_ATTEMPTS } });
    expect(await verifyDelivery(TOKEN, wrong)).toMatchObject({ ok: false, status: 423, attemptsLeft: 0 });

    mocks.findOne.mockResolvedValue(shipped({ attempts: MAX_ATTEMPTS }));
    mocks.findOneAndUpdate.mockClear();
    // Even the right code is refused once locked.
    expect(await verifyDelivery(TOKEN, deliveryOtp(ORDER_ID, TOKEN))).toMatchObject({ ok: false, status: 423 });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses cancelled orders, already-delivered orders and unknown links', async () => {
    mocks.findOne.mockResolvedValue(shipped());
    mocks.getSanityOrder.mockResolvedValue({ status: 'cancelled' });
    expect(await verifyDelivery(TOKEN, deliveryOtp(ORDER_ID, TOKEN))).toMatchObject({ ok: false, status: 409 });

    mocks.findOne.mockResolvedValue(shipped({ verifiedAt: new Date() }));
    expect(await verifyDelivery(TOKEN, deliveryOtp(ORDER_ID, TOKEN))).toMatchObject({ ok: false, status: 409 });

    mocks.findOne.mockResolvedValue(null);
    expect(await verifyDelivery(TOKEN, '123456')).toMatchObject({ ok: false, status: 404 });
  });

  it('only one of two simultaneous confirmations wins', async () => {
    mocks.findOne.mockResolvedValue(shipped());
    mocks.findOneAndUpdate.mockResolvedValue(null); // the other request claimed it first
    expect(await verifyDelivery(TOKEN, deliveryOtp(ORDER_ID, TOKEN))).toMatchObject({ ok: false, status: 409 });
    expect(mocks.writePatch).not.toHaveBeenCalled();
  });
});

describe('resendDeliveryCode', () => {
  it('enforces a one-minute cooldown', async () => {
    mocks.findOne.mockResolvedValue(fakeOrder({ delivery: { token: TOKEN, otpSentAt: new Date() } }));
    expect(await resendDeliveryCode(TOKEN)).toMatchObject({ ok: false, status: 429 });
    mocks.findOne.mockResolvedValue(fakeOrder({ delivery: { token: TOKEN, otpSentAt: new Date(Date.now() - 120_000) } }));
    expect(await resendDeliveryCode(TOKEN)).toMatchObject({ ok: true });
  });
});

describe('deliveryView', () => {
  const order = { orderId: ORDER_ID, delivery: { token: TOKEN, otpSentAt: new Date('2025-01-01T10:00:00Z') } } as never;

  it('shows the code only to the signed-in owner, and only while out for delivery', () => {
    expect(deliveryView(order, 'shipped', true)).toMatchObject({ otpRequired: true, code: deliveryOtp(ORDER_ID, TOKEN) });
    expect(deliveryView(order, 'shipped', false)).not.toHaveProperty('code');
    expect(deliveryView(order, 'confirmed', true)).toBeNull();
    expect(deliveryView({ orderId: ORDER_ID } as never, 'shipped', true)).toBeNull();
  });
});

describe('ensureDeliveryCode (order marked shipped outside the Orders Dashboard)', () => {
  const lean = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

  it('persists a token atomically and the owner sees the HMAC code even when WhatsApp is not configured', async () => {
    mocks.isWhatsAppConfigured.mockReturnValue(false);
    let saved: Record<string, unknown> = {};
    mocks.findOneAndUpdate.mockImplementation(async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      expect(filter).toMatchObject({ orderId: ORDER_ID, 'delivery.token': { $exists: false }, 'delivery.verifiedAt': { $exists: false } });
      saved = { token: update.$set['delivery.token'], assignedAt: update.$set['delivery.assignedAt'], attempts: 0 };
      return fakeOrder({ delivery: saved });
    });
    mocks.findOne.mockImplementation(() => lean({ delivery: { ...saved, otpStatus: 'skipped' } }));

    const delivery = await ensureDeliveryCode(ORDER_ID);
    expect(TOKEN_PATTERN.test(String(delivery?.token))).toBe(true);
    expect(mocks.sendDeliveryOtpWhatsApp).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.updateOne).toHaveBeenCalledWith({ orderId: ORDER_ID }, { $set: { 'delivery.otpStatus': 'skipped' } });
    const view = deliveryView({ orderId: ORDER_ID, delivery } as never, 'shipped', true);
    expect(view).toMatchObject({ otpRequired: true, otpStatus: 'skipped', code: deliveryOtp(ORDER_ID, String(delivery?.token)) });
  });

  it('keeps the code and records "failed" when the WhatsApp call fails or throws', async () => {
    mocks.sendDeliveryOtpWhatsApp.mockRejectedValue(new Error('network down'));
    mocks.findOneAndUpdate.mockResolvedValue(fakeOrder({ delivery: { token: TOKEN, assignedAt: new Date(), attempts: 0 } }));
    mocks.findOne.mockImplementation(() => lean({ delivery: { token: TOKEN, otpStatus: 'failed' } }));

    const delivery = await ensureDeliveryCode(ORDER_ID);
    expect(delivery).toMatchObject({ token: TOKEN, otpStatus: 'failed' });
    expect(mocks.updateOne).toHaveBeenCalledWith({ orderId: ORDER_ID }, { $set: { 'delivery.otpStatus': 'failed' } });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('does not create a second code or re-send when one already exists', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null);
    mocks.findOne.mockImplementation(() => lean({ delivery: { token: TOKEN } }));

    expect(await ensureDeliveryCode(ORDER_ID)).toEqual({ token: TOKEN });
    expect(mocks.sendDeliveryOtpWhatsApp).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('WhatsApps the code to the order delivery phone when configured', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(fakeOrder({ delivery: { token: TOKEN, assignedAt: new Date(), attempts: 0 } }));
    mocks.findOne.mockImplementation(() => lean({ delivery: { token: TOKEN, otpStatus: 'accepted' } }));

    await ensureDeliveryCode(ORDER_ID);
    expect(mocks.sendDeliveryOtpWhatsApp).toHaveBeenCalledWith('9876543210', deliveryOtp(ORDER_ID, TOKEN), ORDER_ID, expect.any(Function));
  });

  it('treats "out_for_delivery" like "shipped" when showing the code', () => {
    expect(deliveryView({ orderId: ORDER_ID, delivery: { token: TOKEN } } as never, 'out_for_delivery', true)).toHaveProperty('code');
  });
});

describe('delivery WhatsApp messages', () => {
  const o = { orderNumber: ORDER_ID, customerName: 'Radha Devi', phone: '9876543210', paymentMethod: 'cod', total: 1049, items: [] };

  it('tells the partner to collect the code and includes the link', () => {
    const text = deliveryPartnerMessage(o, 'https://shop.example/deliver/x');
    expect(text).toContain('https://shop.example/deliver/x');
    expect(text).toContain('6-digit delivery code');
    expect(deliveryPartnerMessage(o)).toContain('AWB'); // unchanged without a link
  });

  it('gives the customer their code with a safety note', () => {
    expect(deliveryCodeMessage(o, '123456')).toMatch(/\*123456\*[\s\S]*only with the delivery partner/);
  });
});

describe('delivery API routes', () => {
  it('verify rejects malformed tokens and codes before touching the database', async () => {
    vi.resetModules();
    vi.doMock('@/backend/lib/rateLimit', () => ({ clientIp: () => '1.1.1.1', createRateLimiter: () => async () => false }));
    const { POST } = await import('@/app/api/delivery/verify/route');
    const call = (body: unknown) =>
      POST(new NextRequest('http://localhost/api/delivery/verify', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
    expect((await call({ token: 'short', otp: '123456' })).status).toBe(404);
    expect((await call({ token: TOKEN, otp: '12' })).status).toBe(400);
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it('assign is owner-only', async () => {
    vi.resetModules();
    vi.doMock('@/backend/lib/rateLimit', () => ({ clientIp: () => '1.1.1.1', createRateLimiter: () => async () => false }));
    vi.doMock('@/backend/lib/studioAuth', () => ({ isStudioOrSiteAdmin: async () => false, studioCorsHeaders: () => ({}) }));
    const { POST } = await import('@/app/api/delivery/assign/route');
    const res = await POST(
      new NextRequest('http://localhost/api/delivery/assign', { method: 'POST', body: JSON.stringify({ orderId: ORDER_ID }), headers: { 'Content-Type': 'application/json' } }),
    );
    expect(res.status).toBe(401);
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});
