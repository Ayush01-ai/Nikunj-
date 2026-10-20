import { writeClient } from '@/cms/lib/client';
import { historyEntry } from '@/cms/lib/orderOps';
import {
  clampRefundAmount,
  refundExpected,
  refundSource,
  type PayoutDetails,
  type RefundInfo,
  type RefundSource,
} from '@/cms/lib/refunds';
import { sanityOrderId } from '@/backend/lib/sanityOrders';
import { createCashfreeRefund, fetchCashfreeRefund } from '@/backend/lib/cashfree';
import { createRazorpayRefund, fetchRazorpayRefund, findRazorpayRefundByReceipt } from '@/backend/lib/razorpay';
import { createPayoutTransfer, getPayoutTransfer, isPayoutsConfigured, PayoutRequestError } from '@/backend/lib/cashfreePayouts';
import { notifyOrder } from '@/backend/lib/orderNotify';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';

/**
 * Refund engine. The owner approves a refund in Studio (sets `refund.state = 'approved'` and snapshots
 * the destination); this module then performs it server-side with the gateway secrets.
 *
 * Safety:
 *  - Only an `approved` refund is ever sent, and the move to `processing` is guarded by the document
 *    revision, so two concurrent calls can never both send money.
 *  - Every attempt uses a deterministic id (`NSXXXXXXXX_R<n>`) that the gateways treat as an idempotency key.
 *  - If we can't tell whether the gateway accepted a request, the refund stays `processing` and is
 *    reconciled with a status lookup instead of being retried.
 */

export interface RefundOrderDoc {
  _id: string;
  _rev: string;
  orderNumber: string;
  status?: string;
  customerName?: string;
  phone?: string;
  total?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentGateway?: string;
  cashfreeOrderId?: string;
  cashfreePaymentId?: string;
  razorpayPaymentId?: string;
  items?: { productName?: string; option?: string; colour?: string; quantity?: number; price?: number }[];
  refund?: RefundInfo | null;
}

const REFUND_DOC_QUERY = `*[_id == $id][0]{
  _id, _rev, orderNumber, status, customerName, phone, total, paymentMethod, paymentStatus,
  paymentGateway, cashfreeOrderId, cashfreePaymentId, razorpayPaymentId, refund,
  items[]{productName, option, colour, quantity, price}
}`;

export type RefundRunResult =
  | { ok: true; state: RefundInfo['state']; message: string }
  | { ok: false; status: number; message: string };

interface GatewayOutcome {
  outcome: 'success' | 'processing' | 'failed';
  gatewayRefundId?: string;
  bankReference?: string;
  message?: string;
}

export const refundReferenceId = (orderNumber: string, attempt: number) =>
  `${orderNumber.replace(/[^A-Za-z0-9]/g, '')}_R${attempt}`.slice(0, 40);

function gatewayErrorMessage(error: unknown, source?: RefundSource): { message: string; uncertain: boolean; status?: number } {
  if (error instanceof PayoutRequestError) return { message: error.message, uncertain: error.uncertain };
  const e = error as {
    isAxiosError?: boolean;
    request?: unknown;
    response?: { status?: number; data?: { message?: string; code?: string; error?: { description?: string } } };
    statusCode?: number;
    error?: { description?: string };
    message?: string;
  };
  const status = e.response?.status ?? e.statusCode;
  let message =
    e.response?.data?.message ?? e.response?.data?.error?.description ?? e.error?.description ?? e.message ?? 'Gateway error';
  if (source === 'cashfree' && status === 404) {
    message = `Cashfree: ${message}. This order is not on the Cashfree account/environment configured on the server (it may have been paid with older or different API keys). Refund it from that Cashfree dashboard, then use "Mark refunded".`;
  } else if (source === 'cashfree' && (status === 401 || status === 403)) {
    message = `Cashfree rejected the server's API keys (${status}): ${message}`;
  }
  // Only a request that actually left the server can have gone through: a network error (no response) or a 5xx.
  // Errors raised before sending (missing config, missing order id) are certain failures.
  const sent = Boolean(e.isAxiosError || e.request || e.response || e.statusCode);
  return { message, uncertain: sent && (!status || status >= 500), status };
}

const mapCashfreeRefund = (r: { cf_refund_id?: string; refund_status?: string; refund_arn?: string; status_description?: string }): GatewayOutcome => {
  const s = (r.refund_status ?? '').toUpperCase();
  return {
    outcome: s === 'SUCCESS' ? 'success' : s === 'CANCELLED' || s === 'FAILED' ? 'failed' : 'processing',
    gatewayRefundId: r.cf_refund_id,
    bankReference: r.refund_arn,
    message: r.status_description,
  };
};

const mapRazorpayRefund = (r: { id?: string; status?: string; acquirer_data?: { arn?: string | null; rrn?: string | null; utr?: string | null } }): GatewayOutcome => ({
  outcome: r.status === 'processed' ? 'success' : r.status === 'failed' ? 'failed' : 'processing',
  gatewayRefundId: r.id,
  bankReference: r.acquirer_data?.arn ?? r.acquirer_data?.utr ?? r.acquirer_data?.rrn ?? undefined,
});

async function sendToGateway(doc: RefundOrderDoc, source: RefundSource, referenceId: string, amount: number, dest?: PayoutDetails): Promise<GatewayOutcome> {
  const note = `Refund for order ${doc.orderNumber}`;
  if (source === 'cashfree') {
    return mapCashfreeRefund(await createCashfreeRefund(doc.cashfreeOrderId!, { refundId: referenceId, amount, note }));
  }
  if (source === 'razorpay') {
    return mapRazorpayRefund(await createRazorpayRefund(doc.razorpayPaymentId!, { amount, receipt: referenceId, note }));
  }
  const r = await createPayoutTransfer({
    transferId: referenceId,
    amount,
    mode: dest!.mode!,
    name: dest!.accountHolder || doc.customerName || 'Customer',
    phone: doc.phone,
    upiId: dest!.upiId,
    accountNumber: dest!.accountNumber,
    ifsc: dest!.ifsc,
    remarks: `Refund ${doc.orderNumber}`,
  });
  return { outcome: r.outcome, gatewayRefundId: r.cfTransferId, bankReference: r.utr, message: r.message };
}

async function lookupAtGateway(doc: RefundOrderDoc, source: RefundSource, refund: RefundInfo): Promise<GatewayOutcome> {
  const referenceId = refund.referenceId!;
  if (source === 'cashfree') {
    try {
      return mapCashfreeRefund(await fetchCashfreeRefund(doc.cashfreeOrderId!, referenceId));
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 404) return { outcome: 'failed', message: 'Refund was not created at Cashfree — approve it again to retry.' };
      throw error;
    }
  }
  if (source === 'razorpay') {
    const found = refund.gatewayRefundId
      ? await fetchRazorpayRefund(doc.razorpayPaymentId!, refund.gatewayRefundId)
      : await findRazorpayRefundByReceipt(doc.razorpayPaymentId!, referenceId);
    return found ? mapRazorpayRefund(found) : { outcome: 'failed', message: 'Refund was not created at Razorpay — approve it again to retry.' };
  }
  const r = await getPayoutTransfer(referenceId);
  return { outcome: r.outcome, gatewayRefundId: r.cfTransferId, bankReference: r.utr, message: r.message };
}

/** Writes the gateway result back to Sanity (+ MongoDB and the customer's WhatsApp on success). */
async function recordOutcome(doc: RefundOrderDoc, rev: string, refund: RefundInfo, result: GatewayOutcome): Promise<RefundRunResult> {
  const now = new Date().toISOString();
  const ids = {
    ...(result.gatewayRefundId && { 'refund.gatewayRefundId': result.gatewayRefundId }),
    ...(result.bankReference && { 'refund.bankReference': result.bankReference }),
  };

  if (result.outcome === 'processing') {
    await writeClient.patch(doc._id).set(ids).commit().catch(() => undefined);
    return { ok: true, state: 'processing', message: result.message || 'Refund initiated — waiting for the bank to confirm.' };
  }

  if (result.outcome === 'failed') {
    await writeClient
      .patch(doc._id)
      .ifRevisionId(rev)
      .set({ ...ids, 'refund.state': 'failed', 'refund.failureReason': (result.message || 'Refund failed').slice(0, 300), 'refund.completedAt': now })
      .commit();
    return { ok: true, state: 'failed', message: result.message || 'Refund failed.' };
  }

  const amount = refund.amount ?? doc.total ?? 0;
  const keepStatus = doc.status === 'cancelled';
  const newStatus = keepStatus ? 'cancelled' : 'refunded';
  const how = refund.source === 'payout' ? 'to customer account' : 'to original payment';
  await writeClient
    .patch(doc._id)
    .ifRevisionId(rev)
    .setIfMissing({ statusHistory: [], returnInfo: {} })
    .set({
      ...ids,
      'refund.state': 'success',
      'refund.completedAt': now,
      'refund.failureReason': '',
      paymentStatus: 'refunded',
      status: newStatus,
      'returnInfo.refundAmount': amount,
      'returnInfo.refundedAt': now,
    })
    .append('statusHistory', [historyEntry(newStatus, `Refunded ₹${amount} ${how}${result.bankReference ? ` · Ref ${result.bankReference}` : ''}`)])
    .commit();

  try {
    await connectDB();
    await Order.updateOne({ orderId: doc.orderNumber }, { $set: { paymentStatus: 'refunded', ...(keepStatus ? {} : { status: 'refunded' }) } });
  } catch (error) {
    console.error('[refunds] Mongo update failed', doc.orderNumber, error instanceof Error ? error.message : error);
  }
  // A status change to "refunded" is announced by the order-status webhook; a cancelled order keeps its status, so tell the customer here.
  if (keepStatus) {
    await notifyOrder(doc.orderNumber, { ...doc, status: 'refunded', paymentStatus: 'refunded' }).catch(() => undefined);
  }
  return { ok: true, state: 'success', message: `Refund of ₹${amount} completed.` };
}

async function syncProcessing(doc: RefundOrderDoc): Promise<RefundRunResult> {
  const refund = doc.refund ?? {};
  const source = refund.source ?? refundSource(doc);
  if (!refund.referenceId) return { ok: false, status: 409, message: 'Refund has no reference to check.' };
  if (source === 'payout' && !isPayoutsConfigured()) return { ok: false, status: 409, message: 'Cashfree Payouts is not configured.' };
  let result: GatewayOutcome;
  try {
    result = await lookupAtGateway(doc, source, refund);
  } catch (error) {
    return { ok: true, state: 'processing', message: `Could not check status yet: ${gatewayErrorMessage(error, source).message}` };
  }
  return recordOutcome(doc, doc._rev, { ...refund, source }, result);
}

/**
 * An approved refund that can't be sent is recorded as `failed` (with the reason) so the dashboard
 * never sits on "Approved — sending"; the owner can fix the cause and approve again.
 */
async function failApproved(doc: RefundOrderDoc, status: number, reason: string): Promise<RefundRunResult> {
  console.error('[refunds] approved refund not sent', doc.orderNumber, reason);
  await writeClient
    .patch(doc._id)
    .ifRevisionId(doc._rev)
    .set({ 'refund.state': 'failed', 'refund.failureReason': reason.slice(0, 300), 'refund.completedAt': new Date().toISOString() })
    .commit()
    .catch((err: unknown) => console.error('[refunds] could not record failure', doc.orderNumber, err instanceof Error ? err.message : err));
  return { ok: false, status, message: reason };
}

/** Perform an approved refund, or (for one already sent) refresh its status from the gateway. */
export async function processRefund(orderId: string): Promise<RefundRunResult> {
  if (!process.env.SANITY_API_TOKEN) return { ok: false, status: 503, message: 'Refunds are not configured on the server.' };
  const doc = await writeClient.fetch<RefundOrderDoc | null>(REFUND_DOC_QUERY, { id: sanityOrderId(orderId) });
  if (!doc) return { ok: false, status: 404, message: 'Order not found.' };
  const refund = doc.refund ?? {};

  if (refund.state === 'processing') return syncProcessing(doc);
  if (refund.state === 'success') return { ok: true, state: 'success', message: 'Refund already completed.' };
  if (refund.state !== 'approved') return { ok: false, status: 409, message: 'Approve the refund in the Orders dashboard first.' };
  try {
    return await sendApproved(doc);
  } catch (error) {
    // Unexpected error before the refund was locked: nothing reached the gateway.
    return failApproved(doc, 500, `Refund could not be started: ${error instanceof Error ? error.message : 'unexpected error'}`);
  }
}

async function sendApproved(doc: RefundOrderDoc): Promise<RefundRunResult> {
  const refund = doc.refund ?? {};
  if (!refundExpected(doc)) return failApproved(doc, 409, 'This order has no refund due.');

  const source = refundSource(doc);
  const total = doc.total ?? 0;
  const amount = clampRefundAmount(refund.amount, total);
  if (!(amount > 0)) return failApproved(doc, 400, 'Refund amount must be more than ₹0.');

  const dest = refund.approvedDestination;
  if (source === 'payout') {
    if (!dest?.mode || (dest.mode === 'upi' ? !dest.upiId : !dest.accountNumber || !dest.ifsc)) {
      return failApproved(doc, 400, 'No approved UPI / bank details for this refund.');
    }
    if (!isPayoutsConfigured()) {
      await writeClient.patch(doc._id).ifRevisionId(doc._rev).set({ 'refund.state': 'manual', 'refund.source': source, 'refund.amount': amount }).commit();
      return { ok: true, state: 'manual', message: 'Cashfree Payouts is not set up — send the money from your UPI / bank app, then record the UTR with "Mark refunded".' };
    }
  }

  const attempt = (refund.attempt ?? 0) + 1;
  const referenceId = refundReferenceId(doc.orderNumber, attempt);
  const now = new Date().toISOString();
  let locked: { _rev: string };
  try {
    locked = await writeClient
      .patch(doc._id)
      .ifRevisionId(doc._rev)
      .set({
        'refund.state': 'processing',
        'refund.source': source,
        'refund.amount': amount,
        'refund.attempt': attempt,
        'refund.referenceId': referenceId,
        'refund.initiatedAt': now,
        'refund.failureReason': '',
      })
      .unset(['refund.gatewayRefundId', 'refund.bankReference', 'refund.completedAt'])
      .commit();
  } catch {
    return { ok: false, status: 409, message: 'The order changed at the same time — refresh and try again.' };
  }

  const current: RefundOrderDoc = { ...doc, _rev: locked._rev };
  const currentRefund: RefundInfo = { ...refund, source, amount, attempt, referenceId };
  let result: GatewayOutcome;
  try {
    result = await sendToGateway(current, source, referenceId, amount, dest);
  } catch (error) {
    const { message, uncertain, status } = gatewayErrorMessage(error, source);
    console.error('[refunds] gateway error', doc.orderNumber, source, status ?? 'no-status', message);
    if (uncertain) return { ok: true, state: 'processing', message: `Refund sent; waiting for confirmation (${message}). Use "Check status" shortly.` };
    result = { outcome: 'failed', message };
  }
  return recordOutcome(current, locked._rev, currentRefund, result);
}
