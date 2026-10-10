import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isWhatsAppConfigured, sendOrderWhatsApp } from '@/backend/lib/whatsapp';

/**
 * Sanity GROQ webhook: notifies the customer on WhatsApp whenever the owner changes an order's status in Studio.
 * Configure in sanity.io/manage → API → Webhooks:
 *   URL: {SITE_URL}/api/webhooks/order-status   Trigger: Update   Filter: _type == "order" && delta::changedAny(status)
 *   Projection: {orderNumber, status, customerName, phone, total, paymentStatus, tracking, items}
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
  if (!isWhatsAppConfigured()) return NextResponse.json({ success: true, skipped: true, reason: 'whatsapp_not_configured' });
  const sent = await sendOrderWhatsApp(order);
  return NextResponse.json({ success: sent });
}
