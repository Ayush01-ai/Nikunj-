import { NextRequest, NextResponse } from 'next/server';
import { authorizeOrderForPayment, verifyOrderAccess } from '@/backend/lib/orderAccess';
import { requireAuthHybrid } from '@/backend/lib/clerk';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { sanityOrderId } from '@/backend/lib/sanityOrders';
import { writeClient } from '@/cms/lib/client';
import { canSubmitPayoutDetails, describePayout, validatePayoutDetails, type RefundableOrder } from '@/cms/lib/refunds';

export const runtime = 'nodejs';

const isRateLimited = createRateLimiter(8, 10 * 60 * 1000, 'api/orders/refund-details:isRateLimited');
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

/**
 * Customer shares the UPI ID / bank account a Cash-on-Delivery (or manual-payment) refund should go to.
 * Bank details are sensitive, so knowing the phone number isn't enough: the customer must be the logged-in
 * owner, or a guest who verified an OTP sent to the order's phone (`guestProof`).
 */
export async function POST(req: NextRequest) {
  if (await isRateLimited(`refund-details:${clientIp(req)}`)) return fail('Too many attempts. Please try again in a few minutes.', 429);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail('Invalid request.');

  const access = await verifyOrderAccess(req, body.orderId, body.phone);
  if (!access.ok) return fail(access.error, access.status);
  const { orderId, order } = access;

  let viewerId: string | undefined;
  try {
    viewerId = (await requireAuthHybrid(req)).userId;
  } catch {
    // guest
  }
  const auth = authorizeOrderForPayment(order, viewerId, body.guestProof);
  if (!auth.ok) {
    return fail(
      order.userId ? 'Please log in to the account used for this order to share refund details.' : 'Please verify your phone number with the OTP first.',
      403,
      { needsVerification: !order.userId },
    );
  }

  const parsed = validatePayoutDetails(body);
  if (!parsed.ok) return fail(parsed.error);

  if (!process.env.SANITY_API_TOKEN) return fail('Refund details can’t be saved right now. Please share them with us on WhatsApp.', 503);
  const id = sanityOrderId(orderId);
  const doc = await writeClient.fetch<(RefundableOrder & { _rev: string }) | null>(
    `*[_id == $id][0]{_rev, status, paymentMethod, paymentStatus, paymentGateway, cashfreeOrderId, cashfreePaymentId, razorpayPaymentId, total, refund}`,
    { id },
  );
  if (!doc) return fail('This order is still being processed. Please try again shortly.', 409);
  if (!canSubmitPayoutDetails(doc)) {
    return fail('Refund details can’t be changed for this order now. Please contact us on WhatsApp if something is wrong.', 409);
  }

  const details = { ...parsed.details, submittedAt: new Date().toISOString() };
  try {
    await writeClient
      .patch(id)
      .ifRevisionId(doc._rev)
      .setIfMissing({ refund: {} })
      .set({ 'refund.payoutDetails': details, 'refund.state': 'details_submitted', 'refund.source': 'payout' })
      .commit();
  } catch {
    return fail('Your order was just updated. Please refresh the page and try again.', 409);
  }
  return NextResponse.json({ success: true, destination: describePayout(details), state: 'details_submitted' });
}
