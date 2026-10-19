import { NextRequest, NextResponse } from 'next/server';
import { createCashfreeOrder, fetchCashfreeOrder } from '@/backend/lib/cashfree';
import { cashfreeEnvironment, isCashfreeConfigured } from '@/backend/lib/cashfreeConfig';
import { requireAuthHybrid } from '@/backend/lib/clerk';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { authorizeOrderForPayment } from '@/backend/lib/orderAccess';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';

// Mirrors the limiter in /api/payment/create — see that file for the rationale.
const isOrderLimited = createRateLimiter(10, 5 * 60 * 1000, 'api/payment/cashfree/create:isOrderLimited');
const isIpLimited = createRateLimiter(30, 5 * 60 * 1000, 'api/payment/cashfree/create:isIpLimited');

function buildPaymentResponse(cashfreeOrderId: string, paymentSessionId: string) {
  return NextResponse.json({
    success: true,
    data: {
      cashfreeOrderId,
      paymentSessionId,
      currency: 'INR',
      environment: cashfreeEnvironment() === 'PRODUCTION' ? 'production' : 'sandbox',
    },
  });
}

/**
 * Base URL for return_url / notify_url. Prefers the configured NEXT_PUBLIC_SITE_URL so a
 * spoofed Host header can't redirect customers (or Cashfree's notifications) elsewhere;
 * falls back to the request origin for local development.
 */
function trustedBaseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {
      // Malformed value — fall through to the request origin.
    }
  }
  return req.nextUrl.origin;
}

/** Cashfree customer_id: alphanumeric plus `_`/`-`, max 50 characters. */
function cashfreeCustomerId(userId: string | undefined, guestPhone: string | undefined, orderId: string): string {
  const raw = userId || `guest_${guestPhone || orderId}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 50);
}

async function recoverExistingCashfreeOrder(orderId: string, total: number) {
  try {
    const existing = await fetchCashfreeOrder(orderId);
    if (
      existing?.order_id === orderId &&
      existing.order_status === 'ACTIVE' &&
      existing.order_currency === 'INR' &&
      typeof existing.order_amount === 'number' &&
      Math.abs(existing.order_amount - total) < 0.01 &&
      existing.payment_session_id
    ) {
      return { order_id: existing.order_id, payment_session_id: existing.payment_session_id };
    }
  } catch {
    // No such Cashfree order (or Cashfree unreachable) — report the original failure.
  }
  return undefined;
}

/**
 * Mirrors /api/payment/create (Razorpay) exactly in its auth/ownership/idempotency rules —
 * only the gateway call differs. Reuses the same Order document and the same
 * "claim-the-gateway-order-id-atomically" pattern so a retried checkout can't orphan a
 * Cashfree order, and so this route can never start a Cashfree payment on an order that
 * already has a Razorpay order in flight (or vice versa) — one gateway per order.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isCashfreeConfigured()) {
      return NextResponse.json({ success: false, error: 'Cashfree is not configured.' }, { status: 503 });
    }

    const body = await req.json();
    const { orderId, guestProof } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ success: false, error: 'Order ID is required.' }, { status: 400 });
    }

    if (await isOrderLimited(`order:${orderId}`)) {
      return NextResponse.json(
        { success: false, error: 'Too many payment attempts for this order. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(isOrderLimited.retryAfterSeconds(`order:${orderId}`)) } },
      );
    }
    const ip = clientIp(req);
    if (await isIpLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many payment attempts. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(isIpLimited.retryAfterSeconds(ip)) } },
      );
    }

    // Auth optional — allow guest checkout with phone verification
    let userId: string | undefined;
    try {
      const payload = await requireAuthHybrid(req);
      userId = payload.userId;
    } catch {
      // Guest checkout allowed
    }

    await connectDB();
    const order = await Order.findOne({ orderId });
    // Authorize before revealing anything about the order (existence, paid/COD state), and
    // answer unknown orders identically so order IDs and payment state can't be probed.
    if (!order) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    const auth = authorizeOrderForPayment(order, userId, guestProof);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ success: false, error: 'Order has already been paid.' }, { status: 400 });
    }
    if (order.paymentMethod === 'cod') {
      return NextResponse.json({ success: false, error: 'Order is Cash on Delivery.' }, { status: 400 });
    }
    if (order.razorpayOrderId) {
      return NextResponse.json(
        { success: false, error: 'This order is already associated with another payment gateway.' },
        { status: 409 },
      );
    }
    // Cashfree's minimum order amount is ₹1; order.total is the server-computed total.
    if (!(typeof order.total === 'number' && Number.isFinite(order.total) && order.total >= 1)) {
      return NextResponse.json({ success: false, error: 'This order cannot be paid online.' }, { status: 400 });
    }

    if (order.cashfreeOrderId && order.cashfreePaymentSessionId) {
      return buildPaymentResponse(order.cashfreeOrderId, order.cashfreePaymentSessionId);
    }

    const baseUrl = trustedBaseUrl(req);
    let cfOrder: { order_id?: string; payment_session_id?: string } | undefined;
    try {
      cfOrder = await createCashfreeOrder({
        orderId,
        amount: order.total,
        customerPhone: order.shippingAddress.phone,
        customerName: order.shippingAddress.fullName,
        customerId: cashfreeCustomerId(userId, order.guestPhone, orderId),
        // The return_url only brings the customer back; the confirmation page re-checks the
        // payment with Cashfree's API server-side before showing it as paid.
        returnUrl: `${baseUrl}/confirmation?orderId=${encodeURIComponent(orderId)}`,
        // Cashfree only accepts an https notify_url; the dashboard webhook is the primary channel.
        notifyUrl: baseUrl.startsWith('https://') ? `${baseUrl}/api/payment/cashfree/webhook` : undefined,
      });
    } catch (err) {
      // A previous attempt may have created the Cashfree order (order_id is unique at Cashfree)
      // before our DB claim succeeded. Recover its session only if it matches this order exactly.
      cfOrder = await recoverExistingCashfreeOrder(orderId, order.total);
      if (!cfOrder) throw err;
    }

    if (!cfOrder?.order_id || !cfOrder.payment_session_id || cfOrder.order_id !== orderId) {
      return NextResponse.json({ success: false, error: 'Could not start Cashfree payment.' }, { status: 502 });
    }

    // Atomically claim the cashfree fields so two concurrent requests can't both "win".
    const claimed = await Order.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: { $ne: 'paid' },
        $or: [{ cashfreeOrderId: { $exists: false } }, { cashfreeOrderId: null }, { cashfreeOrderId: '' }],
      },
      {
        paymentGateway: 'cashfree',
        cashfreeOrderId: cfOrder.order_id,
        cashfreePaymentSessionId: cfOrder.payment_session_id,
      },
      { new: true },
    );

    if (!claimed) {
      const current = await Order.findOne({ _id: order._id });
      if (!current) {
        return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
      }
      if (current.paymentStatus === 'paid') {
        return NextResponse.json({ success: false, error: 'Order has already been paid.' }, { status: 400 });
      }
      if (current.cashfreeOrderId && current.cashfreePaymentSessionId) {
        return buildPaymentResponse(current.cashfreeOrderId, current.cashfreePaymentSessionId);
      }
      return NextResponse.json(
        { success: false, error: 'Could not start payment. Please try again.' },
        { status: 409 },
      );
    }

    return buildPaymentResponse(cfOrder.order_id, cfOrder.payment_session_id);
  } catch (error) {
    console.error('[payment/cashfree/create]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Failed to create payment order.' }, { status: 500 });
  }
}
