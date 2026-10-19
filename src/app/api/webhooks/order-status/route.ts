import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { notifyOrder } from '@/backend/lib/orderNotify';
import { ORDER_ID_PATTERN } from '@/backend/lib/orderAccess';

/**
 * Sanity GROQ webhook: notifies the customer (on the channel chosen at order time) whenever the owner changes an order's status in Studio.
 * Configure in sanity.io/manage → API → Webhooks:
 *   URL: {SITE_URL}/api/webhooks/order-status   Trigger: Update   Filter: _type == "order" && delta::changedAny(status)
 *   Projection: {orderNumber, status, customerName, phone, total, paymentStatus, paymentMethod, tracking, items}
 *   HTTP header: x-webhook-secret = SANITY_WEBHOOK_SECRET
 */
const NOTIFY_STATUSES = new Set(['processing', 'shipped', 'delivered', 'cancelled', 'return_approved', 'returned', 'refunded']);

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
  if (!order?.orderNumber || !NOTIFY_STATUSES.has(order.status)) {
    return NextResponse.json({ success: true, skipped: true });
  }
  if (!ORDER_ID_PATTERN.test(String(order.orderNumber))) return NextResponse.json({ success: true, skipped: true });
  // Destination is the verified contact snapshotted on the order, not the phone in the Sanity payload.
  const result = await notifyOrder(String(order.orderNumber), { ...order, orderNumber: String(order.orderNumber), phone: undefined });
  if (!result.sent && result.reason === 'duplicate') return NextResponse.json({ success: true, duplicate: true });
  return NextResponse.json({ success: result.sent, ...(result.sent ? { channel: result.channel } : { skipped: result.reason }) });
}
