// Refund rules shared by the website, API routes and the Studio (no server-only imports).

/**
 * Where the money goes back to:
 *  - `cashfree` / `razorpay`: back to the original online payment (card / UPI / net banking) via the gateway.
 *  - `payout`: no online payment to reverse (Cash on Delivery, WhatsApp / manual payments) — the customer
 *    shares a UPI ID or bank account and the amount is sent there (Cashfree Payouts, or manually by the owner).
 */
export type RefundSource = 'cashfree' | 'razorpay' | 'payout';

export type RefundState =
  /** Payout refund: waiting for the customer's UPI / bank details. */
  | 'awaiting_details'
  /** Payout refund: customer shared details, waiting for the owner to approve. */
  | 'details_submitted'
  /** Owner approved — the server is about to send it to the gateway. */
  | 'approved'
  /** Sent to the gateway / bank, final result not known yet. */
  | 'processing'
  /** Approved but Cashfree Payouts isn't configured: the owner pays manually and records the reference. */
  | 'manual'
  | 'success'
  | 'failed';

export interface PayoutDetails {
  mode?: 'upi' | 'bank';
  upiId?: string;
  accountHolder?: string;
  accountNumber?: string;
  ifsc?: string;
  submittedAt?: string;
}

export interface RefundInfo {
  source?: RefundSource;
  state?: RefundState;
  amount?: number;
  /** Delivery / COD charges kept back from this refund (0 = full refund). */
  deductedCharges?: number;
  payoutDetails?: PayoutDetails;
  /** Snapshot of the payout details the owner approved — the only destination the server will pay. */
  approvedDestination?: PayoutDetails;
  approvedAt?: string;
  initiatedAt?: string;
  completedAt?: string;
  /** Our idempotency id sent to the gateway (refund_id / transfer_id / receipt). */
  referenceId?: string;
  /** The gateway's own id (cf_refund_id, cf_transfer_id, Razorpay refund id). */
  gatewayRefundId?: string;
  /** Bank reference (UTR / ARN) once available. */
  bankReference?: string;
  failureReason?: string;
  attempt?: number;
}

export interface RefundableOrder {
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentGateway?: string;
  cashfreeOrderId?: string;
  cashfreePaymentId?: string;
  razorpayPaymentId?: string;
  total?: number;
  refund?: RefundInfo | null;
}

export function refundSource(order: RefundableOrder): RefundSource {
  if (order.paymentMethod !== 'cod') {
    if (order.cashfreeOrderId && order.cashfreePaymentId && (order.paymentGateway ?? 'cashfree') === 'cashfree') return 'cashfree';
    if (order.razorpayPaymentId) return 'razorpay';
  }
  return 'payout';
}

/** Money was collected and has to go back (refund due, or a return the owner has already approved). */
export function refundExpected(order: RefundableOrder): boolean {
  if (order.paymentStatus === 'refunded') return false;
  if (order.paymentStatus === 'refund_due') return true;
  return order.paymentStatus === 'paid' && (order.status === 'return_approved' || order.status === 'returned');
}

const LOCKED_STATES: readonly RefundState[] = ['approved', 'processing', 'manual', 'success'];

/** Refund is in the owner's / gateway's hands — the customer can no longer change where it goes. */
export const refundLocked = (refund?: RefundInfo | null) => Boolean(refund?.state && LOCKED_STATES.includes(refund.state));

/** The customer may (re)submit UPI / bank details for this order. */
export function canSubmitPayoutDetails(order: RefundableOrder): boolean {
  return refundSource(order) === 'payout' && refundExpected(order) && !refundLocked(order.refund);
}

export const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_NUMBER_PATTERN = /^\d{9,18}$/;
/** Cashfree Payouts accepts only letters and spaces in the beneficiary name. */
export const HOLDER_NAME_PATTERN = /^[A-Za-z][A-Za-z .]{1,99}$/;

export type PayoutValidation = { ok: true; details: PayoutDetails } | { ok: false; error: string };

/** Normalises and validates customer-entered payout details. */
export function validatePayoutDetails(input: {
  mode?: unknown;
  upiId?: unknown;
  accountHolder?: unknown;
  accountNumber?: unknown;
  confirmAccountNumber?: unknown;
  ifsc?: unknown;
}): PayoutValidation {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const holder = str(input.accountHolder).replace(/\s+/g, ' ');
  if (input.mode === 'upi') {
    const upiId = str(input.upiId).toLowerCase();
    if (!UPI_PATTERN.test(upiId)) return { ok: false, error: 'Enter a valid UPI ID, e.g. name@okaxis.' };
    if (holder && !HOLDER_NAME_PATTERN.test(holder)) return { ok: false, error: 'Name can contain only letters and spaces.' };
    return { ok: true, details: { mode: 'upi', upiId, ...(holder && { accountHolder: holder }) } };
  }
  if (input.mode === 'bank') {
    const accountNumber = str(input.accountNumber).replace(/\s/g, '');
    const confirm = str(input.confirmAccountNumber).replace(/\s/g, '');
    const ifsc = str(input.ifsc).toUpperCase();
    if (!HOLDER_NAME_PATTERN.test(holder)) return { ok: false, error: 'Enter the account holder name (letters and spaces only).' };
    if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) return { ok: false, error: 'Enter a valid bank account number (9–18 digits).' };
    if (confirm !== accountNumber) return { ok: false, error: 'Account numbers do not match.' };
    if (!IFSC_PATTERN.test(ifsc)) return { ok: false, error: 'Enter a valid 11-character IFSC code, e.g. SBIN0001234.' };
    return { ok: true, details: { mode: 'bank', accountHolder: holder, accountNumber, ifsc } };
  }
  return { ok: false, error: 'Choose UPI or bank account.' };
}

export const maskAccount = (n?: string) => (n ? `${'•'.repeat(Math.max(0, Math.min(n.length - 4, 8)))}${n.slice(-4)}` : '');

export function maskUpi(upi?: string) {
  if (!upi) return '';
  const [user, host] = upi.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${host ?? ''}`;
}

/** One-line description of a payout destination (masked unless `full`). */
export function describePayout(d?: PayoutDetails | null, full = false): string {
  if (!d?.mode) return '';
  if (d.mode === 'upi') return `UPI ${full ? d.upiId : maskUpi(d.upiId)}${d.accountHolder ? ` (${d.accountHolder})` : ''}`;
  return `Bank A/c ${full ? d.accountNumber : maskAccount(d.accountNumber)} · IFSC ${d.ifsc} · ${d.accountHolder ?? ''}`.trim();
}

export const REFUND_SOURCE_LABEL: Record<RefundSource, string> = {
  cashfree: 'Back to original payment (Cashfree)',
  razorpay: 'Back to original payment (Razorpay)',
  payout: 'To customer UPI / bank account',
};

export const REFUND_STATE_LABEL: Record<RefundState, string> = {
  awaiting_details: 'Waiting for your UPI / bank details',
  details_submitted: 'Details received — refund under review',
  approved: 'Refund approved — sending now',
  processing: 'Refund initiated — on its way',
  manual: 'Refund approved — being transferred',
  success: 'Refund completed',
  failed: 'Refund could not be completed',
};

/** Clamp a requested refund amount to (0, order total], rounded to paise. */
export function clampRefundAmount(requested: unknown, total: number): number {
  const n = typeof requested === 'number' ? requested : Number(requested);
  const value = Number.isFinite(n) && n > 0 ? n : total;
  return Math.round(Math.min(value, total) * 100) / 100;
}

export interface RefundBreakdown {
  /** Amount paid by the customer. */
  total: number;
  /** Delivery / COD charge on the order. */
  deliveryCharge: number;
  /** Total minus delivery charges (never below zero). */
  itemsOnly: number;
  /** What will be refunded under the shop's policy. */
  expected: number;
  /** Charges kept back under the policy (0 when the full amount is refunded). */
  deducted: number;
}

/**
 * Refund split for an order. By default delivery / COD charges are not refunded (`refundDeliveryCharge`
 * in Admin Settings switches that); if the charge is the whole order value, the full amount is refunded.
 */
export function refundBreakdown(
  order: { total?: number; deliveryCharge?: number },
  refundDeliveryCharge = false,
): RefundBreakdown {
  const total = Math.max(0, Number(order.total) || 0);
  const deliveryCharge = Math.min(total, Math.max(0, Number(order.deliveryCharge) || 0));
  const round = (n: number) => Math.round(n * 100) / 100;
  const itemsOnly = round(total - deliveryCharge);
  const keepCharges = !refundDeliveryCharge && deliveryCharge > 0 && itemsOnly > 0;
  return {
    total,
    deliveryCharge,
    itemsOnly,
    expected: keepCharges ? itemsOnly : total,
    deducted: keepCharges ? deliveryCharge : 0,
  };
}

/** Polite customer-facing line about delivery charges, or '' when nothing is kept back. */
export function deliveryChargeNotice(b: RefundBreakdown): string {
  if (b.deducted <= 0) return '';
  const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  return `Kindly note: the delivery / COD charge of ${inr(b.deducted)} is non-refundable, as the delivery has already been arranged. We'll refund the item value of ${inr(b.expected)}.`;
}
