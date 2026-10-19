import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// All collaborators are mocked so this exercises only the webhook route's own
// decision logic (signature gate, event routing, idempotency, amount/currency
// checks) — no real network, database, or Cashfree/Sanity calls are made.
const verifyCashfreeWebhookSignature = vi.fn();
const isCashfreeConfigured = vi.fn(() => true);
const connectDB = vi.fn(async () => {});
const findOne = vi.fn();
const findOneAndUpdate = vi.fn();
const pushConfirmedOrderToSanity = vi.fn(async () => {});

vi.mock('@/backend/lib/cashfree', () => ({ verifyCashfreeWebhookSignature }));
vi.mock('@/backend/lib/cashfreeConfig', () => ({ isCashfreeConfigured }));
vi.mock('@/backend/lib/mongodb', () => ({ connectDB }));
vi.mock('@/backend/models/Order', () => ({
  Order: {
    findOne: (...args: unknown[]) => findOne(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
  },
}));
vi.mock('@/backend/lib/sanityOrders', () => ({ pushConfirmedOrderToSanity }));

function makeRequest(body: string, headers: Record<string, string>) {
  return new NextRequest('https://example.test/api/payment/cashfree/webhook', {
    method: 'POST',
    body,
    headers,
  });
}

const VALID_HEADERS = { 'x-webhook-signature': 'sig', 'x-webhook-timestamp': '1700000000' };

describe('POST /api/payment/cashfree/webhook', () => {
  beforeEach(() => {
    vi.resetModules();
    verifyCashfreeWebhookSignature.mockReset();
    isCashfreeConfigured.mockReset().mockReturnValue(true);
    connectDB.mockClear();
    findOne.mockReset();
    findOneAndUpdate.mockReset();
    pushConfirmedOrderToSanity.mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  it('rejects when the signature/timestamp headers are missing', async () => {
    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest('{}', {}));
    expect(res.status).toBe(400);
    expect(verifyCashfreeWebhookSignature).not.toHaveBeenCalled();
  });

  it('rejects when signature verification throws (invalid signature)', async () => {
    verifyCashfreeWebhookSignature.mockImplementation(() => {
      throw new Error('Generated signature and received signature did not match.');
    });
    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest('{"type":"PAYMENT_SUCCESS_WEBHOOK"}', VALID_HEADERS));
    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('marks a matching order paid exactly once on a valid PAYMENT_SUCCESS_WEBHOOK', async () => {
    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'order-1' },
        payment: { cf_payment_id: 'cf-pay-1', payment_status: 'SUCCESS', payment_amount: 499, payment_currency: 'INR' },
      },
    };
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });
    findOne.mockResolvedValue({ _id: 'mongo-id', orderId: 'order-1', total: 499, paymentStatus: 'pending' });
    findOneAndUpdate.mockResolvedValue({ _id: 'mongo-id', orderId: 'order-1', paymentStatus: 'paid' });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));

    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'mongo-id', paymentStatus: { $ne: 'paid' } },
      expect.objectContaining({ paymentStatus: 'paid', paymentGateway: 'cashfree' }),
      { new: true },
    );
    expect(pushConfirmedOrderToSanity).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a duplicate webhook for an already-paid order is a no-op', async () => {
    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'order-1' },
        payment: { cf_payment_id: 'cf-pay-1', payment_status: 'SUCCESS', payment_amount: 499, payment_currency: 'INR' },
      },
    };
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });
    findOne.mockResolvedValue({ _id: 'mongo-id', orderId: 'order-1', total: 499, paymentStatus: 'paid' });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));

    expect(res.status).toBe(200);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(pushConfirmedOrderToSanity).not.toHaveBeenCalled();
  });

  it('never flips to paid when the webhook amount does not match the order total', async () => {
    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'order-1' },
        payment: { cf_payment_id: 'cf-pay-1', payment_status: 'SUCCESS', payment_amount: 1, payment_currency: 'INR' },
      },
    };
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });
    findOne.mockResolvedValue({ _id: 'mongo-id', orderId: 'order-1', total: 499, paymentStatus: 'pending' });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));

    expect(res.status).toBe(200);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(pushConfirmedOrderToSanity).not.toHaveBeenCalled();
  });

  it('flips a pending order to failed on PAYMENT_FAILED_WEBHOOK without touching a paid order', async () => {
    const payload = { type: 'PAYMENT_FAILED_WEBHOOK', data: { order: { order_id: 'order-2' } } };
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });
    findOneAndUpdate.mockResolvedValue({ _id: 'mongo-id', orderId: 'order-2', paymentStatus: 'failed' });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));

    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { cashfreeOrderId: 'order-2', paymentStatus: 'pending' },
      { paymentStatus: 'failed' },
    );
  });

  it('acknowledges (200) but ignores event types it does not act on', async () => {
    const payload = { type: 'SOME_OTHER_WEBHOOK' };
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, ignored: 'SOME_OTHER_WEBHOOK' });
  });

  const successPayload = (payment: Record<string, unknown>, order: Record<string, unknown> = {}) => ({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: { order_id: 'order-1', ...order },
      payment: { cf_payment_id: 'cf-pay-1', payment_status: 'SUCCESS', payment_amount: 499, payment_currency: 'INR', ...payment },
    },
  });

  it('verifies the signature against the exact raw body and headers', async () => {
    const raw = '{"type":"PAYMENT_SUCCESS_WEBHOOK",  "data":{}}';
    verifyCashfreeWebhookSignature.mockReturnValue({ object: { type: 'IGNORED' } });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    await POST(makeRequest(raw, VALID_HEADERS));

    expect(verifyCashfreeWebhookSignature).toHaveBeenCalledWith('sig', raw, '1700000000');
  });

  it.each([
    ['a missing payment currency', successPayload({ payment_currency: undefined })],
    ['a non-INR payment currency', successPayload({ payment_currency: 'USD' })],
    ['a mismatched order-level amount', successPayload({}, { order_amount: 1 })],
    ['a non-INR order currency', successPayload({}, { order_currency: 'USD' })],
  ])('never marks paid on %s', async (_label, payload) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });
    findOne.mockResolvedValue({ _id: 'mongo-id', orderId: 'order-1', total: 499, paymentStatus: 'pending' });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));

    expect(res.status).toBe(200);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(pushConfirmedOrderToSanity).not.toHaveBeenCalled();
  });

  it('stores a numeric cf_payment_id as a string', async () => {
    const payload = successPayload({ cf_payment_id: 5114915034 }, { order_amount: 499, order_currency: 'INR' });
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });
    findOne.mockResolvedValue({ _id: 'mongo-id', orderId: 'order-1', total: 499, paymentStatus: 'pending' });
    findOneAndUpdate.mockResolvedValue({ _id: 'mongo-id', paymentStatus: 'paid' });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cashfreePaymentId: '5114915034' }),
      { new: true },
    );
  });

  it('does not re-sync Sanity when a concurrent verify/webhook already won the paid update', async () => {
    const payload = successPayload({});
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });
    findOne.mockResolvedValue({ _id: 'mongo-id', orderId: 'order-1', total: 499, paymentStatus: 'pending' });
    findOneAndUpdate.mockResolvedValue(null);

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));

    expect(res.status).toBe(200);
    expect(pushConfirmedOrderToSanity).not.toHaveBeenCalled();
  });

  it('delivering the same success webhook twice syncs Sanity at most once', async () => {
    const payload = successPayload({});
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });
    findOne
      .mockResolvedValueOnce({ _id: 'mongo-id', orderId: 'order-1', total: 499, paymentStatus: 'pending' })
      .mockResolvedValueOnce({ _id: 'mongo-id', orderId: 'order-1', total: 499, paymentStatus: 'paid' });
    findOneAndUpdate.mockResolvedValue({ _id: 'mongo-id', paymentStatus: 'paid' });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));
    await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(pushConfirmedOrderToSanity).toHaveBeenCalledTimes(1);
  });

  it('flips a pending order to failed on PAYMENT_USER_DROPPED_WEBHOOK', async () => {
    const payload = { type: 'PAYMENT_USER_DROPPED_WEBHOOK', data: { order: { order_id: 'order-3' } } };
    verifyCashfreeWebhookSignature.mockReturnValue({ object: payload });

    const { POST } = await import('@/app/api/payment/cashfree/webhook/route');
    const res = await POST(makeRequest(JSON.stringify(payload), VALID_HEADERS));

    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith({ cashfreeOrderId: 'order-3', paymentStatus: 'pending' }, { paymentStatus: 'failed' });
    expect(pushConfirmedOrderToSanity).not.toHaveBeenCalled();
  });});
