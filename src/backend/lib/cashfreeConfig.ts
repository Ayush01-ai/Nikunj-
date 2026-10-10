/**
 * Cashfree is entirely opt-in and additive alongside the existing Razorpay integration.
 * Until both `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` are set, every Cashfree route treats
 * the gateway as unconfigured and refuses to create orders or accept webhooks — Razorpay
 * checkout keeps working unchanged regardless of this flag.
 */
export function isCashfreeConfigured(): boolean {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
}

/**
 * Client-visible flag only — never exposes secrets. The checkout page uses this to decide
 * whether to offer Cashfree as a gateway choice at all. Defaults to sandbox/disabled.
 */
export function isCashfreeEnabledOnClient(): boolean {
  return process.env.NEXT_PUBLIC_CASHFREE_ENABLED === 'true';
}

/** 'PRODUCTION' only when explicitly set; defaults to sandbox so nothing can go live by accident. */
export function cashfreeEnvironment(): 'SANDBOX' | 'PRODUCTION' {
  return process.env.CASHFREE_ENVIRONMENT === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
}
