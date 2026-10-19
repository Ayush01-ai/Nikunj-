import type { SanityOrder } from '@/backend/lib/sanityOrders';
import { canSubmitPayoutDetails, describePayout, refundExpected, refundSource, type RefundBreakdown } from '@/cms/lib/refunds';

/** Customer-facing refund status (Track Order + My Account). Destination details are always masked. */
export function refundView(order: SanityOrder | null, verifyWith: 'account' | 'otp', policy: RefundBreakdown) {
  if (!order) return null;
  const r = order.refund;
  if (!r?.state && !refundExpected(order) && order.paymentStatus !== 'refunded') return null;
  const source = r?.source ?? refundSource(order);
  const canSubmitDetails = canSubmitPayoutDetails(order);
  const state = r?.state ?? (order.paymentStatus === 'refunded' ? 'success' : source === 'payout' ? 'awaiting_details' : 'details_submitted');
  return {
    source,
    state,
    amount: r?.amount ?? order.returnInfo?.refundAmount ?? policy.expected,
    deductedCharges: r?.amount !== undefined ? (r.deductedCharges ?? 0) : policy.deducted,
    destination: describePayout(r?.approvedDestination ?? r?.payoutDetails) || null,
    bankReference: r?.bankReference ?? null,
    completedAt: r?.completedAt ?? order.returnInfo?.refundedAt ?? null,
    canSubmitDetails,
    verifyWith,
  };
}

export type CustomerRefundView = NonNullable<ReturnType<typeof refundView>>;
