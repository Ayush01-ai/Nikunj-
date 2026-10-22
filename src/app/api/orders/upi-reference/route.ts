import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { ORDER_ID_PATTERN } from '@/backend/lib/orderAccess';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { getSanityOrder, setSanityUpiReference } from '@/backend/lib/sanityOrders';

const isIpLimited = createRateLimiter(10, 10 * 60 * 1000, 'api/orders/upi-reference:ip');
const isOrderLimited = createRateLimiter(5, 60 * 60 * 1000, 'api/orders/upi-reference:order');

/** UPI UTR / RRN: 12 digits. */
const UTR_PATTERN = /^\d{12}$/;

/**
 * Lets the customer report the UPI transaction reference after paying via the manual UPI link, so the owner
 * can match it in their bank app. This is only a hint for the owner — it never marks the order as paid.
 */
export async function POST(req: NextRequest) {
  if (await isIpLimited(clientIp(req))) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });
  }

  let body: { orderId?: unknown; utr?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 });
  }
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const utr = typeof body.utr === 'string' ? body.utr.replace(/\s+/g, '') : '';
  if (!ORDER_ID_PATTERN.test(orderId)) {
    return NextResponse.json({ success: false, error: 'Invalid order number.' }, { status: 400 });
  }
  if (!UTR_PATTERN.test(utr)) {
    return NextResponse.json({ success: false, error: 'Enter the 12-digit UPI reference / UTR number from your UPI app.' }, { status: 400 });
  }
  if (await isOrderLimited(orderId)) {
    return NextResponse.json({ success: false, error: 'Too many attempts for this order. Please contact us on WhatsApp.' }, { status: 429 });
  }

  // The owner may already have confirmed or cancelled it in Studio, which is the source of truth.
  const managed = await getSanityOrder(orderId);
  if (managed && managed.status !== 'pending') {
    return NextResponse.json({ success: false, error: 'This order is no longer awaiting payment.' }, { status: 409 });
  }

  await connectDB();
  const updated = await Order.findOneAndUpdate(
    { orderId, paymentMethod: 'upi', paymentStatus: 'pending', status: 'pending' },
    { $set: { upiReference: utr, upiReferenceAt: new Date() } },
    { new: true },
  ).select('orderId').lean();
  if (!updated) {
    return NextResponse.json({ success: false, error: 'This order is not awaiting a UPI payment.' }, { status: 409 });
  }
  if (managed) await setSanityUpiReference(orderId, utr);

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
