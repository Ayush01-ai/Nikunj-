import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { notifyOrder } from '@/backend/lib/orderNotify';
import { ORDER_ID_PATTERN } from '@/backend/lib/orderAccess';
import { ensureDeliveryCode, OUT_FOR_DELIVERY } from '@/backend/lib/delivery';
import { notifyCustomerOrderConfirmed } from '@/backend/lib/sanityOrders';
import { connectDB } from '@/backend/lib/mongodb';
import { Order, type IOrder } from '@/backend/models/Order';

/**
 * Sanity GROQ webhook: notifies the customer (on the channel chosen at order time) whenever the owner changes an order's status in Studio.
 * Configure in sanity.io/manage → API → Webhooks:
 *   URL: {SITE_URL}/api/webhooks/order-status   Trigger: Update   Filter: _type == "order" && delta::changedAny(status)
 *   Projection: {orderNumber, status, customerName, phone, total, paymentStatus, paymentMethod, tracking, items}
 *   HTTP header: x-webhook-secret = SANITY_WEBHOOK_SECRET
 */
const NOTIFY_STATUSES = new Set(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'return_approved', 'returned', 'refunded']);
const MONGO_STATUSES = new Set(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'return_requested', 'return_approved', 'returned', 'refunded']);
const MONGO_PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded']);

/** Mirrors the owner's Studio decision onto the website copy so customer pages agree even if Sanity is briefly unreachable. */
async function syncMongo(orderId: string, status: unknown, paymentStatus: unknown): Promise<IOrder | null> {
  const set: Record<string, string> = {};
  if (typeof status === 'string' && MONGO_STATUSES.has(status)) set.status = status;
  if (typeof paymentStatus === 'string' && MONGO_PAYMENT_STATUSES.has(paymentStatus)) set.paymentStatus = paymentStatus;
  await connectDB();
  if (!Object.keys(set).length) return Order.findOne({ orderId }).lean<IOrder>();
  return Order.findOneAndUpdate({ orderId }, { $set: set }, { new: true }).lean<IOrder>();
}

function validSecret(given: string | null) {
  const expected = process.env.SANITY_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!validSecret(req.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const order = await req.json().catch(() => null);
  if (!order?.orderNumber || !ORDER_ID_PATTERN.test(String(order.orderNumber))) {
    return NextResponse.json({ success: true, skipped: true });
  }
  const mongoOrder = await syncMongo(String(order.orderNumber), order.status, order.paymentStatus).catch((err: unknown) => {
    console.error('[order-status] mongo sync', order.orderNumber, err instanceof Error ? err.message : err);
    return null;
  });
  if (!NOTIFY_STATUSES.has(order.status)) return NextResponse.json({ success: true, skipped: true });
  if (order.status === 'confirmed') {
    // Manual-UPI orders reach "confirmed" only when the owner verifies payment; send the full confirmation once
    // (COD orders already used the same idempotency key at checkout, so they are not messaged twice).
    if (mongoOrder) await notifyCustomerOrderConfirmed(mongoOrder);
    return NextResponse.json({ success: true });
  }
  if (OUT_FOR_DELIVERY.has(order.status)) {
    // Generate the doorstep code before the "shipped" message; a WhatsApp/Sanity hiccup must not block notifications.
    await ensureDeliveryCode(String(order.orderNumber)).catch((err: unknown) =>
      console.error('[order-status] delivery code', order.orderNumber, err instanceof Error ? err.message : err));
  }
  // Destination is the verified contact snapshotted on the order, not the phone in the Sanity payload.
  const result = await notifyOrder(String(order.orderNumber), { ...order, orderNumber: String(order.orderNumber), phone: undefined });
  if (!result.sent && result.reason === 'duplicate') return NextResponse.json({ success: true, duplicate: true });
  return NextResponse.json({ success: result.sent, ...(result.sent ? { channel: result.channel } : { skipped: result.reason }) });
}
