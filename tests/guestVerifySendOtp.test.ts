import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// All collaborators mocked — exercises only this route's own decision logic (order/phone
// matching, rate limiting, delivery-channel fallback) with no real database/network/WhatsApp
// calls. Mirrors tests/payment-cashfree-create.test.ts conventions.
const connectDB = vi.fn(async () => {});
const orderFindOne = vi.fn();
const otpFindOne = vi.fn();
const otpDeleteMany = vi.fn();
const otpCreate = vi.fn();
const isWhatsAppConfigured = vi.fn(() => false);
const sendWhatsAppOtp = vi.fn();

vi.mock('@/backend/lib/mongodb', () => ({ connectDB }));
vi.mock('@/backend/models/Order', () => ({ Order: { findOne: orderFindOne } }));
vi.mock('@/backend/models/Otp', () => ({
  Otp: { findOne: otpFindOne, deleteMany: otpDeleteMany, create: otpCreate },
}));
vi.mock('@/backend/lib/whatsapp', () => ({ isWhatsAppConfigured, sendWhatsAppOtp }));

function makeRequest(body: unknown, ip = '203.0.113.1') {
  return new NextRequest('https://example.test/api/payment/guest-verify/send-otp', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  });
}

const GUEST_ORDER = {
  orderId: 'NS-AAAAAAAA',
  userId: undefined,
  guestPhone: '9876543210',
  shippingAddress: { phone: '9876543210' },
};

describe('POST /api/payment/guest-verify/send-otp', () => {
  // Warm the module transform cache once so the first test's cold import can't exceed the
  // per-test timeout when the whole suite runs in parallel.
  beforeAll(async () => {
    await import('@/app/api/payment/guest-verify/send-otp/route');
  }, 30_000);

  beforeEach(() => {
    vi.resetModules();
    connectDB.mockClear();
    orderFindOne.mockReset();
    otpFindOne.mockReset().mockReturnValue({ sort: () => ({ lean: async () => null }) });
    otpDeleteMany.mockReset().mockResolvedValue(undefined);
    otpCreate.mockReset().mockResolvedValue(undefined);
    isWhatsAppConfigured.mockReset().mockReturnValue(false);
    sendWhatsAppOtp.mockReset().mockResolvedValue(true);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MSG91_AUTH_KEY', '');
    vi.stubEnv('MSG91_TEMPLATE_ID', '');
    vi.stubEnv('WHATSAPP_OTP_TEMPLATE', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects a malformed order id without touching the database', async () => {
    const { POST } = await import('@/app/api/payment/guest-verify/send-otp/route');
    const res = await POST(makeRequest({ orderId: 'not-an-order-id', phone: '9876543210' }));
    expect(res.status).toBe(400);
    expect(orderFindOne).not.toHaveBeenCalled();
  });

  it('rejects an invalid phone number', async () => {
    const { POST } = await import('@/app/api/payment/guest-verify/send-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '123' }));
    expect(res.status).toBe(400);
  });

  it('returns a generic not-found for a registered (non-guest) order', async () => {
    orderFindOne.mockReturnValue({ lean: async () => ({ ...GUEST_ORDER, userId: 'user-1' }) });
    const { POST } = await import('@/app/api/payment/guest-verify/send-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210' }));
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).toMatch(/could not find/i);
  });

  it('returns a generic not-found when the phone does not match the order', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    const { POST } = await import('@/app/api/payment/guest-verify/send-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9111111111' }));
    expect(res.status).toBe(404);
  });

  it('sends a code for a valid guest order + matching phone without exposing or logging the OTP', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    const { POST } = await import('@/app/api/payment/guest-verify/send-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // The OTP must never be returned to the client, in any environment.
    expect(json._devOtp).toBeUndefined();
    expect(Object.keys(json)).toEqual(['success', 'message']);
    expect(otpCreate).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '9876543210', orderId: 'NS-AAAAAAAA', purpose: 'guest_payment' }),
    );
    // The OTP must never be logged to the server console either, in any environment.
    const createdOtp = otpCreate.mock.calls[0]?.[0]?.otp;
    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allLoggedText).not.toContain(createdOtp);
  });

  it('fails closed (503) in production when no delivery channel is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    const { POST } = await import('@/app/api/payment/guest-verify/send-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210' }));
    expect(res.status).toBe(503);
  });

  it('enforces the per-order resend cooldown', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    otpFindOne.mockReturnValue({ sort: () => ({ lean: async () => ({ createdAt: new Date() }) }) });
    const { POST } = await import('@/app/api/payment/guest-verify/send-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210' }));
    expect(res.status).toBe(429);
  });

  it('returns 429 with Retry-After once the per-order rate limit is exceeded', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    const { POST } = await import('@/app/api/payment/guest-verify/send-otp/route');
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210' }, `203.0.113.${i + 1}`));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
  });
});
