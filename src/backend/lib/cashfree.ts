import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { cashfreeEnvironment, isCashfreeConfigured } from './cashfreeConfig';

const APP_ID = process.env.CASHFREE_APP_ID;
const SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

let client: Cashfree | null = null;

/**
 * Lazily constructs the Cashfree SDK client. Lazy (not module-top-level like razorpay.ts)
 * so that importing this file never throws when Cashfree isn't configured yet — callers
 * must check `isCashfreeConfigured()` before calling any of the functions below.
 */
function getClient(): Cashfree {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY missing).');
  }
  if (!client) {
    const env = cashfreeEnvironment() === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
    client = new Cashfree(env, APP_ID, SECRET_KEY);
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
  notifyUrl: string;
}

/** Creates a Cashfree order and returns the payment_session_id the frontend Checkout JS SDK needs. */
export async function createCashfreeOrder(options: CreateCashfreeOrderOptions) {
  const cashfree = getClient();
  const response = await cashfree.PGCreateOrder({
    order_id: options.orderId,
    order_amount: Math.round(options.amount * 100) / 100,
    order_currency: 'INR',
    customer_details: {
      customer_id: options.customerId,
      customer_phone: `+91${options.customerPhone}`,
      customer_name: options.customerName,
    },
    order_meta: {
      return_url: options.returnUrl,
      notify_url: options.notifyUrl,
    },
  });
  return response.data;
}

/** Server-side source of truth for order status — used by /verify instead of trusting the client. */
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
 * Verifies the `x-webhook-signature` / `x-webhook-timestamp` headers against the RAW request
 * body using Cashfree's official SDK method (HMAC-SHA256 over `timestamp + rawBody`, keyed by
 * the client secret) — never re-serializes/parses the body before verifying. Throws on an
 * invalid signature (per the SDK's documented behavior); callers must catch and reject.
 */
export function verifyCashfreeWebhookSignature(signature: string, rawBody: string, timestamp: string) {
  const cashfree = getClient();
  return cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp);
}
