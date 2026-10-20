import type { NextRequest } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { isValidPhone, sanitizePhone } from '@/backend/lib/auth';
import { requireAuthHybrid } from '@/backend/lib/clerk';
import { verifyGuestPaymentProof } from '@/backend/lib/guestPaymentProof';

export const ORDER_ID_PATTERN = /^NS-[A-Z0-9_-]{8}$/;
export const ORDER_NOT_FOUND = 'We could not find an order with those details. Please check the order ID and phone number.';

type AccessResult =
  | { ok: true; orderId: string; order: NonNullable<Awaited<ReturnType<typeof findOrder>>>; viaAccount: boolean }
  | { ok: false; status: number; error: string };

const findOrder = (orderId: string) => Order.findOne({ orderId }).lean();

/** A customer may see / act on an order if they own it (logged in) or know the phone number used for it. */
export async function verifyOrderAccess(req: NextRequest, rawOrderId: unknown, rawPhone: unknown): Promise<AccessResult> {
  const orderId = String(rawOrderId ?? '').trim().toUpperCase();
  const phone = rawPhone ? sanitizePhone(String(rawPhone)) : '';
  if (!ORDER_ID_PATTERN.test(orderId)) return { ok: false, status: 400, error: 'Enter a valid order ID, e.g. NS-AB12CD34.' };

  let viewer: { userId: string } | null = null;
  try {
    viewer = await requireAuthHybrid(req);
  } catch {
    // Guests verify with phone number instead.
  }
  if (!viewer && !isValidPhone(phone)) return { ok: false, status: 400, error: 'Enter the 10-digit mobile number used for the order.' };

  let order;
  try {
    await connectDB();
    order = await findOrder(orderId);
  } catch (error) {
    console.error('[order-access]', error instanceof Error ? error.message : error);
    return { ok: false, status: 503, error: 'Order service is temporarily unavailable. Please try again shortly.' };
  }
  if (!order) return { ok: false, status: 404, error: ORDER_NOT_FOUND };

  const phoneMatches = phone && [order.shippingAddress?.phone, order.guestPhone].some((p) => p && sanitizePhone(p) === phone);
  const isOwner = viewer && order.userId?.toString() === viewer.userId;
  if (!phoneMatches && !isOwner) return { ok: false, status: 404, error: ORDER_NOT_FOUND };
  return { ok: true, orderId, order, viaAccount: Boolean(isOwner) };
}

export type PaymentAuthResult = { ok: true } | { ok: false; status: 403; error: string };

/**
 * Gate for payment-order creation (Razorpay/Cashfree `create` routes), separate from
 * `verifyOrderAccess` (which is for the order-lookup/track-order flow and returns a
 * generic "not found" to avoid order-ID enumeration).
 *
 * - Registered orders: only the authenticated owner may start a payment for it. There is
 *   no existing documented admin-initiates-payment-for-customer flow, so none is added
 *   here — this exactly preserves the ownership check the routes already had.
 * - Guest orders: a bare phone number is no longer accepted as proof — anyone who merely
 *   knew (or guessed) the phone number on the order could otherwise initiate a payment
 *   for it. The caller must instead present a short-lived, server-issued
 *   `guestPaymentProof` token (see guestPaymentProof.ts), minted only after the guest
 *   verifies an OTP sent to that exact phone number for this exact order
 *   (POST /api/payment/guest-verify/send-otp + confirm-otp). The token is validated
 *   against every phone number on file for the order (shippingAddress.phone and
 *   guestPhone) so it works regardless of which one was used to request it.
 */
export function authorizeOrderForPayment(
  order: {
    userId?: { toString(): string } | null;
    guestPhone?: string;
    shippingAddress?: { phone?: string };
    orderId?: string;
  },
  viewerUserId: string | undefined,
  rawGuestProof: unknown,
): PaymentAuthResult {
  if (order.userId) {
    if (viewerUserId && order.userId.toString() === viewerUserId) return { ok: true };
    return { ok: false, status: 403, error: 'Access denied.' };
  }
  const orderId = order.orderId;
  const phoneCandidates = [order.shippingAddress?.phone, order.guestPhone].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  if (orderId && phoneCandidates.some((p) => verifyGuestPaymentProof(rawGuestProof, orderId, p))) {
    return { ok: true };
  }
  return { ok: false, status: 403, error: 'Access denied.' };
}
