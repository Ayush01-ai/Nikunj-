import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real cashfree.ts wrapper is tested here; only the cashfree-pg SDK class is replaced so
// no request ever leaves the process. The secret below is a dummy test value.
const PGCreateOrder = vi.fn();
const ctorArgs: unknown[][] = [];

vi.mock('cashfree-pg', () => ({
  CFEnvironment: { SANDBOX: 1, PRODUCTION: 2 },
  Cashfree: class {
    XApiVersion = '2026-01-01';
    PGCreateOrder = PGCreateOrder;
    constructor(...args: unknown[]) {
      ctorArgs.push(args);
    }
  },
}));

const TEST_SECRET = 'cf_test_dummy_secret_for_unit_tests';
const sign = (timestamp: string, body: string, secret = TEST_SECRET) =>
  createHmac('sha256', secret).update(timestamp + body).digest('base64');

describe('cashfree wrapper', () => {
  beforeEach(() => {
    vi.resetModules();
    ctorArgs.length = 0;
    PGCreateOrder.mockReset().mockResolvedValue({ data: { order_id: 'NS-1', payment_session_id: 's' } });
    process.env.CASHFREE_APP_ID = 'TEST_APP_ID';
    process.env.CASHFREE_SECRET_KEY = TEST_SECRET;
    process.env.CASHFREE_ENVIRONMENT = 'SANDBOX';
    delete process.env.CASHFREE_API_VERSION;
  });

  afterEach(() => {
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;
    delete process.env.CASHFREE_ENVIRONMENT;
  });

  describe('verifyCashfreeWebhookSignature', () => {
    const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"NS-1"}}}';
    const ts = '1700000000';

    it('accepts a correct base64 HMAC-SHA256 of timestamp + raw body and returns the parsed event', async () => {
      const { verifyCashfreeWebhookSignature } = await import('@/backend/lib/cashfree');
      const result = verifyCashfreeWebhookSignature(sign(ts, body), body, ts);
      expect(result.type).toBe('PAYMENT_SUCCESS_WEBHOOK');
      expect(result.raw).toBe(body);
    });

    it('rejects a tampered body, a different timestamp, or a signature made with another secret', async () => {
      const { verifyCashfreeWebhookSignature } = await import('@/backend/lib/cashfree');
      const good = sign(ts, body);
      expect(() => verifyCashfreeWebhookSignature(good, body.replace('NS-1', 'NS-2'), ts)).toThrow();
      expect(() => verifyCashfreeWebhookSignature(good, body, '1700000001')).toThrow();
      expect(() => verifyCashfreeWebhookSignature(sign(ts, body, 'other-secret'), body, ts)).toThrow();
    });

    it('rejects a re-serialized (not byte-identical) body', async () => {
      const { verifyCashfreeWebhookSignature } = await import('@/backend/lib/cashfree');
      const reformatted = JSON.stringify(JSON.parse(body), null, 2);
      expect(() => verifyCashfreeWebhookSignature(sign(ts, body), reformatted, ts)).toThrow();
    });

    it('rejects malformed / wrong-length signatures without throwing a non-signature error', async () => {
      const { verifyCashfreeWebhookSignature, CashfreeSignatureError } = await import('@/backend/lib/cashfree');
      expect(() => verifyCashfreeWebhookSignature('', body, ts)).toThrow(CashfreeSignatureError);
      expect(() => verifyCashfreeWebhookSignature('abc', body, ts)).toThrow(CashfreeSignatureError);
      expect(() => verifyCashfreeWebhookSignature('!!!not-base64!!!', body, ts)).toThrow(CashfreeSignatureError);
    });

    it('rejects a correctly signed body that is not JSON', async () => {
      const { verifyCashfreeWebhookSignature, CashfreeSignatureError } = await import('@/backend/lib/cashfree');
      expect(() => verifyCashfreeWebhookSignature(sign(ts, 'not json'), 'not json', ts)).toThrow(CashfreeSignatureError);
    });

    it('rejects everything when the secret is not configured', async () => {
      delete process.env.CASHFREE_SECRET_KEY;
      const { verifyCashfreeWebhookSignature } = await import('@/backend/lib/cashfree');
      expect(() => verifyCashfreeWebhookSignature(sign(ts, body), body, ts)).toThrow();
    });
  });

  describe('createCashfreeOrder', () => {
    it('sends INR, the rounded server amount, an idempotency key, and disables SDK error analytics', async () => {
      const { createCashfreeOrder } = await import('@/backend/lib/cashfree');
      await createCashfreeOrder({
        orderId: 'NS-1',
        amount: 499.004,
        customerPhone: '9876543210',
        customerName: 'Test',
        customerId: 'user_1',
        returnUrl: 'http://localhost:3000/confirmation?orderId=NS-1',
      });

      const [req, requestId, idempotencyKey] = PGCreateOrder.mock.calls[0];
      expect(req).toMatchObject({
        order_id: 'NS-1',
        order_amount: 499,
        order_currency: 'INR',
        customer_details: { customer_id: 'user_1', customer_phone: '9876543210' },
        order_meta: { return_url: 'http://localhost:3000/confirmation?orderId=NS-1' },
      });
      expect(req.order_meta.notify_url).toBeUndefined();
      expect(requestId).toBeUndefined();
      expect(idempotencyKey).toBe('create-NS-1');
      // env, appId, secret, partnerKey, clientSignature, partnerMerchantId, XEnableErrorAnalytics
      expect(ctorArgs[0][0]).toBe(1);
      expect(ctorArgs[0][6]).toBe(false);
    });

    it('uses the production environment only when CASHFREE_ENVIRONMENT=PRODUCTION', async () => {
      process.env.CASHFREE_ENVIRONMENT = 'PRODUCTION';
      const { createCashfreeOrder } = await import('@/backend/lib/cashfree');
      await createCashfreeOrder({
        orderId: 'NS-1', amount: 10, customerPhone: '9876543210', customerName: 'T', customerId: 'c', returnUrl: 'https://x.test/',
        notifyUrl: 'https://x.test/api/payment/cashfree/webhook',
      });
      expect(ctorArgs[0][0]).toBe(2);
      expect(PGCreateOrder.mock.calls[0][0].order_meta.notify_url).toBe('https://x.test/api/payment/cashfree/webhook');
    });
  });
});
