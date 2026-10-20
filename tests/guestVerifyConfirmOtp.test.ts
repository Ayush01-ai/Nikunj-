import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

// All collaborators mocked — exercises only this route's own decision logic (order/phone
// matching, OTP attempt/expiry handling, rate limiting, proof issuance) with no real
// database or network calls. Mirrors tests/guestVerifySendOtp.test.ts conventions.
const connectDB = vi.fn(async () => {});
const orderFindOne = vi.fn();
const otpFindOne = vi.fn();
const otpFindOneAndUpdate = vi.fn();
const otpDeleteMany = vi.fn();

vi.mock('@/backend/lib/mongodb', () => ({ connectDB }));
vi.mock('@/backend/models/Order', () => ({ Order: { findOne: orderFindOne } }));
vi.mock('@/backend/models/Otp', () => ({ Otp: { findOne: otpFindOne, findOneAndUpdate: otpFindOneAndUpdate, deleteMany: otpDeleteMany } }));

function makeRequest(body: unknown, ip = '203.0.113.1') {
  return new NextRequest('https://example.test/api/payment/guest-verify/confirm-otp', {
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

function makeOtpRecord(overrides: Partial<{ otp: string; attempts: number; expiresAt: Date }> = {}) {
  const record = {
    otp: '123456',
    attempts: 0,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    save: vi.fn(async function (this: typeof record) {}),
    ...overrides,
  };
  return record;
}

describe('POST /api/payment/guest-verify/confirm-otp', () => {
  // Warm the module transform cache once so the first test's cold import can't exceed the
  // per-test timeout when the whole suite runs in parallel.
  beforeAll(async () => {
    await import('@/app/api/payment/guest-verify/confirm-otp/route');
  }, 30_000);

  beforeEach(() => {
    vi.resetModules();
    connectDB.mockClear();
    orderFindOne.mockReset();
    otpFindOne.mockReset();
    otpDeleteMany.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('rejects a malformed order id', async () => {
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    const res = await POST(makeRequest({ orderId: 'bad', phone: '9876543210', otp: '123456' }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-6-digit otp', async () => {
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210', otp: '12' }));
    expect(res.status).toBe(400);
  });

  it('returns a generic not-found for a registered (non-guest) order', async () => {
    orderFindOne.mockReturnValue({ lean: async () => ({ ...GUEST_ORDER, userId: 'user-1' }) });
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210', otp: '123456' }));
    expect(res.status).toBe(404);
  });

  it('returns a generic not-found when the phone does not match the order', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9111111111', otp: '123456' }));
    expect(res.status).toBe(404);
  });

  it('rejects when no OTP record exists', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    otpFindOne.mockReturnValue({ sort: () => Promise.resolve(null) });
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210', otp: '123456' }));
    expect(res.status).toBe(400);
  });

  it('rejects an expired code and deletes it', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    const expired = makeOtpRecord({ expiresAt: new Date(Date.now() - 1000) });
    otpFindOne.mockReturnValue({ sort: () => Promise.resolve(expired) });
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210', otp: '123456' }));
    expect(res.status).toBe(400);
    expect(otpDeleteMany).toHaveBeenCalled();
  });

  it('rejects an incorrect code and increments attempts', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    // The route reserves the attempt atomically in the database and receives the incremented record.
    const record = makeOtpRecord({ attempts: 1 });
    otpFindOneAndUpdate.mockResolvedValue(record);
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210', otp: '000000' }));
    expect(res.status).toBe(400);
    expect(otpFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: { $lt: 5 } }),
      { $inc: { attempts: 1 } },
      expect.anything(),
    );
    expect(otpDeleteMany).not.toHaveBeenCalled();
  });

  it('locks out after exceeding the max attempts and deletes the record', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    // No attempt can be reserved (attempts already at the cap), so the latest record is inspected.
    const record = makeOtpRecord({ attempts: 5 });
    otpFindOneAndUpdate.mockResolvedValue(null);
    otpFindOne.mockReturnValue({ sort: () => Promise.resolve(record) });
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210', otp: '000000' }));
    expect(res.status).toBe(429);
    expect(otpDeleteMany).toHaveBeenCalled();
  });

  it('accepts a correct code, deletes it (single-use), and mints a guestPaymentProof', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    const record = makeOtpRecord({ otp: '123456', attempts: 1 });
    otpFindOneAndUpdate.mockResolvedValue(record);
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    const res = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210', otp: '123456' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(typeof json.guestProof).toBe('string');
    expect(otpDeleteMany).toHaveBeenCalled();

    // The minted proof decodes to exactly this order+phone and nothing a client could forge.
    const decoded = jwt.decode(json.guestProof) as jwt.JwtPayload;
    expect(decoded.orderId).toBe('NS-AAAAAAAA');
    expect(decoded.phone).toBe('9876543210');
    expect(decoded.purpose).toBe('guest_payment');
  });

  it('returns 429 with Retry-After once the per-order rate limit is exceeded', async () => {
    orderFindOne.mockReturnValue({ lean: async () => GUEST_ORDER });
    otpFindOne.mockReturnValue({ sort: () => Promise.resolve(null) });
    const { POST } = await import('@/app/api/payment/guest-verify/confirm-otp/route');
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await POST(makeRequest({ orderId: 'NS-AAAAAAAA', phone: '9876543210', otp: '123456' }, `203.0.113.${i + 1}`));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
  });
});
