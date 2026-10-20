import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
  userFindById: vi.fn(),
  sendEmail: vi.fn(),
  sendOrderWhatsApp: vi.fn(),
  emailConfigured: vi.fn(),
}));

vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/backend/models/Order', () => ({
  Order: {
    findOne: () => ({ select: () => ({ lean: () => mocks.findOne() }) }),
    updateOne: mocks.updateOne,
  },
}));
vi.mock('@/backend/models/User', () => ({
  User: { findById: () => ({ select: () => ({ lean: () => mocks.userFindById() }) }) },
}));
vi.mock('@/backend/lib/email', () => ({
  isEmailConfigured: mocks.emailConfigured,
  sendEmail: mocks.sendEmail,
  orderConfirmationEmail: () => '<p>confirmed</p>',
  orderStatusEmail: () => '<p>status</p>',
}));
vi.mock('@/backend/lib/whatsapp', () => ({ sendOrderWhatsApp: mocks.sendOrderWhatsApp }));

import { buildNotificationSnapshot, notifyOrder, snapshotForOrder } from '@/backend/lib/orderNotify';

const verifiedEmail = { email: 'Radha@Example.com', emailVerified: true, phone: undefined, authProviders: ['google'] };
const verifiedPhone = { email: undefined, emailVerified: false, phone: '9876543210', authProviders: ['whatsapp'] };

describe('buildNotificationSnapshot (policy)', () => {
  it('google and email/password sessions notify the verified account email', () => {
    expect(buildNotificationSnapshot(verifiedEmail, 'google', undefined)).toMatchObject({ channel: 'email', email: 'radha@example.com', method: 'google' });
    expect(buildNotificationSnapshot(verifiedEmail, 'email', undefined)).toMatchObject({ channel: 'email', method: 'email' });
  });

  it('whatsapp sessions notify the verified account phone', () => {
    expect(buildNotificationSnapshot(verifiedPhone, 'whatsapp', undefined)).toMatchObject({ channel: 'whatsapp', phone: '9876543210', method: 'whatsapp' });
  });

  it('never uses an unverified email or phone', () => {
    expect(buildNotificationSnapshot({ ...verifiedEmail, emailVerified: false }, 'email', undefined)).toMatchObject({ channel: 'none', reason: 'email_unverified' });
    expect(buildNotificationSnapshot({ phone: '9876543210', authProviders: ['google'] }, 'whatsapp', undefined)).toMatchObject({ channel: 'none', reason: 'phone_unverified' });
  });

  it('does not fall back to the other channel when the chosen one is missing', () => {
    const both = { email: 'a@b.co', emailVerified: true, phone: '9876543210', authProviders: ['whatsapp'] };
    expect(buildNotificationSnapshot({ ...both, emailVerified: false }, 'google', undefined).channel).toBe('none');
    expect(buildNotificationSnapshot({ ...both, phone: undefined }, 'whatsapp', undefined).channel).toBe('none');
  });

  it('unknown method: uses the only verified contact, otherwise refuses to guess', () => {
    expect(buildNotificationSnapshot(verifiedEmail, undefined, undefined).channel).toBe('email');
    expect(buildNotificationSnapshot(verifiedPhone, undefined, undefined).channel).toBe('whatsapp');
    const both = { email: 'a@b.co', emailVerified: true, phone: '9876543210', authProviders: ['whatsapp'] };
    expect(buildNotificationSnapshot(both, undefined, undefined)).toMatchObject({ channel: 'none', reason: 'method_unknown' });
    expect(buildNotificationSnapshot({}, undefined, undefined)).toMatchObject({ channel: 'none', reason: 'no_contact' });
  });

  it('guest orders use the phone entered on the order via WhatsApp', () => {
    expect(buildNotificationSnapshot(null, 'email', '+91 98765 43210')).toMatchObject({ channel: 'whatsapp', method: 'guest', phone: '9876543210' });
    expect(buildNotificationSnapshot(null, undefined, undefined)).toMatchObject({ channel: 'none', reason: 'no_contact' });
  });

  it('never stores contact details in the "reason"', () => {
    const snap = buildNotificationSnapshot({ ...verifiedEmail, emailVerified: false }, 'email', undefined);
    expect(JSON.stringify(snap)).not.toContain('example.com');
  });
});

describe('snapshotForOrder', () => {
  beforeEach(() => mocks.userFindById.mockReset());

  it('loads the account server-side and applies the policy', async () => {
    mocks.userFindById.mockResolvedValue(verifiedEmail);
    expect(await snapshotForOrder('u1', 'google', undefined)).toMatchObject({ channel: 'email' });
  });

  it('degrades to no channel when the account is missing', async () => {
    mocks.userFindById.mockResolvedValue(null);
    expect(await snapshotForOrder('u1', 'google', undefined)).toMatchObject({ channel: 'none' });
  });
});

describe('notifyOrder', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.emailConfigured.mockReturnValue(true);
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.sendEmail.mockResolvedValue(true);
    mocks.sendOrderWhatsApp.mockResolvedValue(true);
  });

  const order = (notification: unknown, extra: Record<string, unknown> = {}) =>
    mocks.findOne.mockResolvedValue({ userId: 'u1', shippingAddress: { phone: '9000000000' }, notification, ...extra });

  it('emails the snapshotted email for google/email orders (Resend), not WhatsApp', async () => {
    order({ channel: 'email', email: 'radha@example.com', method: 'google' });
    const res = await notifyOrder('NS-1', { status: 'shipped', customerName: 'Radha' });
    expect(res).toEqual({ sent: true, channel: 'email' });
    expect(mocks.sendEmail).toHaveBeenCalledWith('radha@example.com', expect.stringContaining('NS-1'), expect.any(String));
    expect(mocks.sendOrderWhatsApp).not.toHaveBeenCalled();
  });

  it('sends the confirmation email with the order summary when provided', async () => {
    order({ channel: 'email', email: 'radha@example.com', method: 'email' });
    await notifyOrder('NS-1', { status: 'confirmed', confirmation: { orderId: 'NS-1' } as never });
    expect(mocks.sendEmail).toHaveBeenCalledWith('radha@example.com', expect.stringContaining('Order confirmed'), '<p>confirmed</p>');
  });

  it('WhatsApps the snapshotted account phone for phone-login orders and ignores any phone in the event', async () => {
    order({ channel: 'whatsapp', phone: '9876543210', method: 'whatsapp' });
    const res = await notifyOrder('NS-1', { status: 'shipped', phone: '9111111111' } as never);
    expect(res).toEqual({ sent: true, channel: 'whatsapp' });
    expect(mocks.sendOrderWhatsApp).toHaveBeenCalledWith(expect.objectContaining({ phone: '9876543210' }));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('uses the snapshot even if the account contact changes after the order was placed', async () => {
    order({ channel: 'email', email: 'old@example.com', method: 'google' });
    mocks.userFindById.mockResolvedValue({ ...verifiedEmail, email: 'new@example.com' });
    await notifyOrder('NS-1', { status: 'shipped' });
    expect(mocks.sendEmail.mock.calls[0][0]).toBe('old@example.com');
    expect(mocks.userFindById).not.toHaveBeenCalled();
  });

  it('sends nothing when the order has no verified channel', async () => {
    order({ channel: 'none', reason: 'email_unverified' });
    expect(await notifyOrder('NS-1', { status: 'shipped' })).toEqual({ sent: false, reason: 'no_channel' });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendOrderWhatsApp).not.toHaveBeenCalled();
  });

  it('legacy registered orders without a snapshot are not guessed; legacy guest orders keep WhatsApp', async () => {
    order(undefined);
    expect((await notifyOrder('NS-1', { status: 'shipped' })).sent).toBe(false);
    mocks.findOne.mockResolvedValue({ shippingAddress: { phone: '9000000000' } });
    await notifyOrder('NS-2', { status: 'shipped' });
    expect(mocks.sendOrderWhatsApp).toHaveBeenCalledWith(expect.objectContaining({ phone: '9000000000' }));
  });

  it('is idempotent: a duplicate event is not sent twice', async () => {
    order({ channel: 'email', email: 'radha@example.com', method: 'email' });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 0 });
    expect(await notifyOrder('NS-1', { status: 'shipped' })).toEqual({ sent: false, reason: 'duplicate' });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('releases the claim on provider failure so a retry can deliver', async () => {
    order({ channel: 'whatsapp', phone: '9876543210', method: 'whatsapp' });
    mocks.sendOrderWhatsApp.mockResolvedValue(false);
    expect(await notifyOrder('NS-1', { status: 'shipped' })).toEqual({ sent: false, reason: 'send_failed' });
    expect(mocks.updateOne).toHaveBeenLastCalledWith({ orderId: 'NS-1' }, { $pull: { notificationLog: { key: 'shipped' } } });
    mocks.sendEmail.mockRejectedValue(new Error('resend down'));
    order({ channel: 'email', email: 'a@b.co', method: 'email' });
    expect((await notifyOrder('NS-1', { status: 'packed' })).sent).toBe(false);
  });

  it('reports not_configured when Resend is not set up, without claiming the key', async () => {
    order({ channel: 'email', email: 'a@b.co', method: 'email' });
    mocks.emailConfigured.mockReturnValue(false);
    expect(await notifyOrder('NS-1', { status: 'shipped' })).toEqual({ sent: false, reason: 'not_configured' });
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('returns order_not_found for unknown orders', async () => {
    mocks.findOne.mockResolvedValue(null);
    expect(await notifyOrder('NS-X', { status: 'shipped' })).toEqual({ sent: false, reason: 'order_not_found' });
  });
});
