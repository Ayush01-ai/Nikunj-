import { createHmac, timingSafeEqual } from 'node:crypto';
import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { cashfreeEnvironment, isCashfreeConfigured } from './cashfreeConfig';

let client: Cashfree | null = null;

export const DEFAULT_CASHFREE_API_VERSION = '2023-08-01';

/** `x-api-version` for every PG call; override with CASHFREE_API_VERSION. */
export function cashfreeApiVersion() {
  return process.env.CASHFREE_API_VERSION?.trim() || DEFAULT_CASHFREE_API_VERSION;
}

/**
 * Lazily constructs the Cashfree SDK client so that importing this file never throws when
 * Cashfree isn't configured yet — callers must check `isCashfreeConfigured()` first.
 *
 * The 7th constructor argument (`XEnableErrorAnalytics`) is explicitly `false`: cashfree-pg
 * otherwise initialises Sentry with Cashfree's own DSN and ships SDK error reports (which can
 * include request context) to a third party.
 */
function getClient(): Cashfree {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY missing).');
  }
  if (!client) {
    const env = cashfreeEnvironment() === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
    client = new Cashfree(
      env,
      process.env.CASHFREE_APP_ID,
      process.env.CASHFREE_SECRET_KEY,
      undefined,
      undefined,
      undefined,
      false,
    );
    // The SDK sends x-client-id / x-client-secret itself; x-api-version is pinned so an SDK upgrade can't silently change it.
    client.XApiVersion = cashfreeApiVersion();
  }
  return client;
}

export interface CreateCashfreeOrderOptions {
  /** Our own order id (orderId on the Order document) — becomes the Cashfree order_id. */
  orderId: string;
  /** Amount in RUPEES (not paise) — Cashfree accepts decimal rupee amounts directly. */
  amount: number;
  customerPhone: string;
  customerName: string;
  /** Cashfree requires a non-empty, alphanumeric customer_id. */
  customerId: string;
  returnUrl: string;
  /** Only sent when set — Cashfree requires notify_url to be https. */
  notifyUrl?: string;
}

/** Creates a Cashfree order and returns the payment_session_id the frontend Checkout JS SDK needs. */
export async function createCashfreeOrder(options: CreateCashfreeOrderOptions) {
  const cashfree = getClient();
  const response = await cashfree.PGCreateOrder(
    {
      order_id: options.orderId,
      order_amount: Math.round(options.amount * 100) / 100,
      order_currency: 'INR',
      customer_details: {
        customer_id: options.customerId,
        customer_phone: options.customerPhone,
        customer_name: options.customerName,
      },
      order_meta: {
        return_url: options.returnUrl,
        ...(options.notifyUrl ? { notify_url: options.notifyUrl } : {}),
      },
    },
    undefined,
    // Same key for retries of the same order, so Cashfree de-duplicates a retried create.
    `create-${options.orderId}`,
  );
  return response.data;
}

/** Server-side source of truth for order status — used instead of trusting the browser. */
export async function fetchCashfreeOrder(cashfreeOrderId: string) {
  const cashfree = getClient();
  const response = await cashfree.PGFetchOrder(cashfreeOrderId);
  return response.data;
}

/** Used to cross-check the actual settled amount/currency of the successful payment, if any. */
export async function fetchCashfreeOrderPayments(cashfreeOrderId: string) {
  const cashfree = getClient();
  const response = await cashfree.PGOrderFetchPayments(cashfreeOrderId);
  return response.data;
}

/**
 * Refunds a Cashfree PG order back to the customer's original payment instrument.
 * `refundId` is our idempotency key — Cashfree rejects a second refund with the same id,
 * so a retried call can never refund twice.
 */
export async function createCashfreeRefund(cashfreeOrderId: string, options: { refundId: string; amount: number; note?: string }) {
  const cashfree = getClient();
  const response = await cashfree.PGOrderCreateRefund(
    cashfreeOrderId,
    {
      refund_amount: Math.round(options.amount * 100) / 100,
      refund_id: options.refundId,
      refund_note: options.note?.slice(0, 100),
    },
    undefined,
    `refund-${options.refundId}`,
  );
  return response.data;
}

export async function fetchCashfreeRefund(cashfreeOrderId: string, refundId: string) {
  const cashfree = getClient();
  const response = await cashfree.PGOrderFetchRefund(cashfreeOrderId, refundId);
  return response.data;
}

export class CashfreeSignatureError extends Error {}

/**
 * Verifies the `x-webhook-signature` / `x-webhook-timestamp` headers against the RAW request
 * body using Cashfree's documented scheme — base64(HMAC-SHA256(timestamp + rawBody)) keyed by
 * the merchant's client secret (CASHFREE_SECRET_KEY; there is no separate webhook secret).
 * This is the same computation as the SDK's `PGVerifyWebhookSignature`, but compared in
 * constant time. Throws `CashfreeSignatureError` on any mismatch; callers must reject.
 */
export function verifyCashfreeWebhookSignature(
  signature: string,
  rawBody: string,
  timestamp: string,
  options?: { maxAgeMs?: number; now?: number },
) {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret) throw new CashfreeSignatureError('Cashfree is not configured.');

  if (options?.maxAgeMs) {
    let ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      throw new CashfreeSignatureError('Webhook timestamp is invalid.');
    }
    // Convert seconds to ms if 10-digit unix timestamp
    if (ts < 1e11) ts *= 1000;
    const now = options.now ?? Date.now();
    if (Math.abs(now - ts) > options.maxAgeMs) {
      throw new CashfreeSignatureError('Webhook timestamp is expired or outside tolerance window.');
    }
  }

  const expected = createHmac('sha256', secret).update(timestamp + rawBody).digest();
  const received = Buffer.from(signature, 'base64');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new CashfreeSignatureError('Webhook signature mismatch.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new CashfreeSignatureError('Webhook body is not valid JSON.');
  }
  const object = (parsed && typeof parsed === 'object' ? parsed : {}) as { type?: string };
  return { type: object.type, raw: rawBody, object };
}