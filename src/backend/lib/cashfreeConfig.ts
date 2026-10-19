/**
 * Cashfree is the sole active online-payment gateway (checkout no longer offers a
 * Razorpay option). Until both `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` are set, every
 * Cashfree route treats the gateway as unconfigured and refuses to create orders or
 * accept webhooks — online checkout will fail safely rather than silently falling back to
 * an unconfigured provider. Razorpay's code paths (`/api/payment/webhook`,
 * `src/backend/lib/razorpay.ts`) are kept only to settle/refund pre-existing Razorpay
 * orders already recorded in the database; new payments are never routed there.
 */
export function isCashfreeConfigured(): boolean {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
}

/**
 * @deprecated No longer consulted by the checkout UI — Cashfree is unconditionally the
 * only online gateway offered, so there is nothing left to toggle on the client. Kept
 * (rather than deleted) only for backward compatibility with any external tooling that
 * may still read `NEXT_PUBLIC_CASHFREE_ENABLED`; safe to remove once confirmed unused.
 */
export function isCashfreeEnabledOnClient(): boolean {
  return process.env.NEXT_PUBLIC_CASHFREE_ENABLED === 'true';
}

/**
 * 'PRODUCTION' only when explicitly set; defaults to sandbox so nothing can go live by accident.
 * `CASHFREE_ENV` is accepted as a legacy alias when `CASHFREE_ENVIRONMENT` is not set.
 */
export function cashfreeEnvironment(): 'SANDBOX' | 'PRODUCTION' {
  const value = process.env.CASHFREE_ENVIRONMENT ?? process.env.CASHFREE_ENV;
  return value === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
}
