import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { isValidPhone, requireAuth, sanitizePhone } from '@/backend/lib/auth';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { getSanityOrder } from '@/backend/lib/sanityOrders';

const ORDER_ID = /^NS-[A-Z0-9_-]{8}$/;
const NOT_FOUND = 'We could not find an order with those details. Please check the order ID and phone number.';
const isRateLimited = createRateLimiter(10, 10 * 60 * 1000);

export async function POST(req: NextRequest) {
  if (isRateLimited(`track:${clientIp(req)}`)) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });
  }

  let body: { orderId?: unknown; phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 });
  }

  const orderId = String(body.orderId ?? '').trim().toUpperCase();
  const phone = body.phone ? sanitizePhone(String(body.phone)) : '';
  if (!ORDER_ID.test(orderId)) {
    return NextResponse.json({ success: false, error: 'Enter a valid order ID, e.g. NS-AB12CD34.' }, { status: 400 });
  }

  let viewer: { userId: string } | null = null;
  try {
    viewer = requireAuth(req);
  } catch {
    // Guests verify with phone number instead.
  }
  if (!viewer && !isValidPhone(phone)) {
    return NextResponse.json({ success: false, error: 'Enter the 10-digit mobile number used for the order.' }, { status: 400 });
  }

  let mongoOrder;
  try {
    await connectDB();
    mongoOrder = await Order.findOne({ orderId }).lean();
  } catch (error) {
    console.error('[track-order]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Order tracking is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
  if (!mongoOrder) return NextResponse.json({ success: false, error: NOT_FOUND }, { status: 404 });

  const phoneMatches = phone && [mongoOrder.shippingAddress?.phone, mongoOrder.guestPhone].some((p) => p && sanitizePhone(p) === phone);
  const isOwner = viewer && mongoOrder.userId?.toString() === viewer.userId;
  if (!phoneMatches && !isOwner) return NextResponse.json({ success: false, error: NOT_FOUND }, { status: 404 });

  // Owner-managed status lives in Sanity; fall back to the website record until it is synced.
  const managed = await getSanityOrder(orderId);
  const addr = mongoOrder.shippingAddress;
  const data = {
    orderId,
    status: managed?.status ?? mongoOrder.status,
    placedAt: managed?.placedAt ?? new Date(mongoOrder.createdAt).toISOString(),
    statusHistory: managed?.statusHistory ?? [{ status: mongoOrder.status, at: new Date(mongoOrder.createdAt).toISOString() }],
    tracking: managed?.tracking ?? null,
    items: (managed?.items ?? mongoOrder.items.map((i) => ({
      productName: i.name,
      image: i.image,
      option: i.selectedSize,
      colour: i.selectedColor,
      price: i.price,
      quantity: i.quantity,
    }))),
    subtotal: mongoOrder.subtotal,
    deliveryCharge: mongoOrder.deliveryCharge,
    discount: mongoOrder.discount,
    total: mongoOrder.total,
    paymentMethod: mongoOrder.paymentMethod,
    paymentStatus: managed?.paymentStatus ?? mongoOrder.paymentStatus,
    shipTo: { name: addr?.fullName, city: addr?.city, state: addr?.state, pincode: addr?.pincode },
  };

  return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
}
