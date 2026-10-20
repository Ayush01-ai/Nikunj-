import Razorpay from 'razorpay';
import crypto from 'crypto';

/**
 * Razorpay is retired as the active checkout gateway (see /api/payment/create, which
 * now returns 410 for new payments) but this module is kept functional so any payment
 * that was already created against Razorpay before the retirement can still be verified
 * and settled via webhook/verify.
 *
 * Lazily reads env vars instead of throwing at module import time: eagerly importing
 * this file (e.g. from the webhook/verify routes, which must stay importable even once
 * RAZORPAY_* credentials are removed from the environment) must not crash the whole
 * route just because Razorpay is no longer configured. Callers get a clear error only
 * when they actually try to use a Razorpay function without credentials present.
 */
function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys not configured in environment variables');
  }
  return { keyId, keySecret };
}

let cachedClient: Razorpay | null = null;
function getClient(): Razorpay {
  if (cachedClient) return cachedClient;
  const { keyId, keySecret } = getCredentials();
  cachedClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return cachedClient;
}

export interface CreateOrderOptions {
  amount: number; // in rupees
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

/** Create a Razorpay order — amount in RUPEES (not paise) */
export async function createRazorpayOrder(options: CreateOrderOptions) {
  const order = await getClient().orders.create({
    amount: Math.round(options.amount * 100), // convert to paise
    currency: options.currency || 'INR',
    receipt: options.receipt.slice(0, 40),
    notes: options.notes,
  });
  return order;
}

/** Fetch an existing Razorpay order by ID (used by the webhook's notes-fallback lookup). */
export async function fetchRazorpayOrder(razorpayOrderId: string) {
  return getClient().orders.fetch(razorpayOrderId);
}

/** Refund a captured Razorpay payment back to its original method — amount in RUPEES. */
export async function createRazorpayRefund(paymentId: string, options: { amount: number; receipt: string; note?: string }) {
  return getClient().payments.refund(paymentId, {
    amount: Math.round(options.amount * 100),
    speed: 'normal',
    receipt: options.receipt.slice(0, 40),
    ...(options.note ? { notes: { reason: options.note.slice(0, 250) } } : {}),
  });
}

export async function fetchRazorpayRefund(paymentId: string, refundId: string) {
  return getClient().payments.fetchRefund(paymentId, refundId);
}

/** Finds a refund we created earlier by its receipt (used if we crashed before storing the refund id). */
export async function findRazorpayRefundByReceipt(paymentId: string, receipt: string) {
  const list = await getClient().payments.fetchMultipleRefund(paymentId, { count: 100 });
  return list.items.find((r) => r.receipt === receipt) ?? null;
}

/** Verify payment signature — MUST be verified server-side */
export function verifyPaymentSignature(params: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): boolean {
  const { keySecret } = getCredentials();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params;
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
  const signatureBuffer = Buffer.from(razorpay_signature, 'utf-8');

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
