import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateOne: vi.fn(),
  exists: vi.fn(),
  sendEmail: vi.fn(),
  isEmailConfigured: vi.fn(),
  sendOwnerWhatsApp: vi.fn(),
  fetch: vi.fn(),
  patchSet: vi.fn(),
  patchCommit: vi.fn(),
}));

vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock('@/backend/models/Order', () => ({
  Order: {
    updateOne: (...a: unknown[]) => mocks.updateOne(...a),
    exists: (...a: unknown[]) => mocks.exists(...a),
  },
}));
vi.mock('@/backend/lib/email', () => ({
  isEmailConfigured: () => mocks.isEmailConfigured(),
  sendEmail: (...a: unknown[]) => mocks.sendEmail(...a),
}));
vi.mock('@/backend/lib/whatsapp', () => ({ sendOwnerWhatsApp: (...a: unknown[]) => mocks.sendOwnerWhatsApp(...a) }));
vi.mock('@/cms/lib/client', () => ({
  writeClient: {
    fetch: (...a: unknown[]) => mocks.fetch(...a),
    patch: () => {
      const p: Record<string, unknown> = {};
      p.set = (...a: unknown[]) => { mocks.patchSet(...a); return p; };
      p.commit = mocks.patchCommit;
      return p;
    },
  },
}));
vi.mock('@/backend/lib/orderNotify', () => ({ notifyOrder: vi.fn() }));
vi.mock('@/backend/lib/analytics', () => ({ recordOrderPlaced: vi.fn() }));
vi.mock('@/backend/lib/stockHold', () => ({ releaseStockHold: vi.fn() }));
vi.mock('@/backend/lib/shiprocketFulfilment', () => ({ ensureShiprocketOrder: vi.fn() }));

import { alertDedupeKey, alertOwnerOrderIssue } from '@/backend/lib/ownerAlert';
import { handleLatePaymentOnCancelledOrder } from '@/backend/lib/sanityOrders';

const input = { orderNumber: 'NS-AB12CD34', stage: 'shiprocket', reason: 'Booking failed', customerName: 'Asha', phone: '9140110859', total: 950 };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OWNER_ALERT_EMAIL;
  delete process.env.OWNER_ALERT_PHONE;
  delete process.env.SANITY_API_TOKEN;
  mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mocks.exists.mockResolvedValue({ _id: 'x' });
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.sendEmail.mockResolvedValue(true);
  mocks.sendOwnerWhatsApp.mockResolvedValue(true);
  mocks.patchCommit.mockResolvedValue({});
});

describe('alertOwnerOrderIssue', () => {
  it('emails the default owner address and returns sent', async () => {
    expect(await alertOwnerOrderIssue(input)).toBe('sent');
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail.mock.calls[0][0]).toBe('Nikunj.sakhi14@gmail.com');
    expect(mocks.sendOwnerWhatsApp).not.toHaveBeenCalled();
  });

  it('uses OWNER_ALERT_EMAIL and OWNER_ALERT_PHONE and tries both channels', async () => {
    process.env.OWNER_ALERT_EMAIL = 'owner@example.com';
    process.env.OWNER_ALERT_PHONE = '9876543210';
    expect(await alertOwnerOrderIssue(input)).toBe('sent');
    expect(mocks.sendEmail.mock.calls[0][0]).toBe('owner@example.com');
    expect(mocks.sendOwnerWhatsApp.mock.calls[0][0]).toBe('9876543210');
  });

  it('falls back to settings.admin ownerWhatsApp, then adminPhones[0]', async () => {
    process.env.SANITY_API_TOKEN = 't';
    mocks.isEmailConfigured.mockReturnValue(false);
    mocks.fetch.mockResolvedValueOnce({ ownerWhatsApp: '9111111111', adminPhones: ['9222222222'] });
    expect(await alertOwnerOrderIssue(input)).toBe('sent');
    expect(mocks.sendOwnerWhatsApp.mock.calls[0][0]).toBe('9111111111');

    mocks.fetch.mockResolvedValueOnce({ adminPhones: ['9222222222'] });
    await alertOwnerOrderIssue({ ...input, stage: 'other' });
    expect(mocks.sendOwnerWhatsApp.mock.calls[1][0]).toBe('9222222222');
  });

  it('returns duplicate when the claim is already taken and sends nothing', async () => {
    mocks.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    expect(await alertOwnerOrderIssue(input)).toBe('duplicate');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('normalizes whitespace/case in the reason for the dedupe key', () => {
    expect(alertDedupeKey('s', 'Booking   failed ')).toBe(alertDedupeKey('s', 'booking failed'));
    expect(alertDedupeKey('s', 'a')).not.toBe(alertDedupeKey('t', 'a'));
  });

  it('releases the claim and returns failed when every configured channel fails', async () => {
    mocks.sendEmail.mockResolvedValue(false);
    expect(await alertOwnerOrderIssue(input)).toBe('failed');
    expect(mocks.updateOne).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.updateOne.mock.calls[1][1])).toContain('$pull');
  });

  it('keeps the claim when one channel succeeds and the other fails', async () => {
    process.env.OWNER_ALERT_PHONE = '9876543210';
    mocks.sendEmail.mockResolvedValue(false);
    expect(await alertOwnerOrderIssue(input)).toBe('sent');
    expect(mocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it('releases the claim and returns not_configured when no channel is available', async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    expect(await alertOwnerOrderIssue(input)).toBe('not_configured');
    expect(JSON.stringify(mocks.updateOne.mock.calls[1][1])).toContain('$pull');
  });

  it('still sends when the order is not in Mongo, and never throws', async () => {
    mocks.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    mocks.exists.mockResolvedValueOnce(null);
    expect(await alertOwnerOrderIssue(input)).toBe('sent');
    mocks.sendEmail.mockRejectedValueOnce(new Error('boom'));
    await expect(alertOwnerOrderIssue({ ...input, stage: 'x2' })).resolves.toBe('failed');
  });
});

describe('handleLatePaymentOnCancelledOrder', () => {
  const order = { orderId: 'NS-AB12CD34', status: 'cancelled', total: 950, shippingAddress: { fullName: 'Asha', phone: '9140110859' } } as never;

  it('marks refund_due + needsAttention in Mongo and Sanity and alerts the owner', async () => {
    process.env.SANITY_API_TOKEN = 't';
    expect(await handleLatePaymentOnCancelledOrder(order, 'cf_1')).toBe(true);
    const set = mocks.updateOne.mock.calls.find((c) => JSON.stringify(c[1]).includes('refund_due'));
    expect(JSON.stringify(set?.[1])).toContain('needsAttention');
    expect(mocks.patchSet).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: 'refund_due', needsAttention: true }));
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it('detects a cancel that only exists in Sanity', async () => {
    process.env.SANITY_API_TOKEN = 't';
    mocks.fetch.mockResolvedValueOnce('cancelled');
    expect(await handleLatePaymentOnCancelledOrder({ ...(order as object), status: 'pending' } as never, 'cf_1')).toBe(true);
  });

  it('does nothing for a live order', async () => {
    mocks.fetch.mockResolvedValueOnce('pending');
    process.env.SANITY_API_TOKEN = 't';
    expect(await handleLatePaymentOnCancelledOrder({ ...(order as object), status: 'pending' } as never, 'cf_1')).toBe(false);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
