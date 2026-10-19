import { NextRequest, NextResponse } from 'next/server';
import { verifyOrderAccess } from '@/backend/lib/orderAccess';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { getAdminSettings, getSanityOrder } from '@/backend/lib/sanityOrders';
import { requestEligibility } from '@/cms/lib/orderRequests';
import { refundBreakdown } from '@/cms/lib/refunds';
import { refundView } from '@/backend/lib/refundView';
import { deliveryView } from '@/backend/lib/delivery';

const isRateLimited = createRateLimiter(10, 10 * 60 * 1000, 'api/track-order:isRateLimited');

export async function POST(req: NextRequest) {
  if (await isRateLimited(`track:${clientIp(req)}`)) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });
  }

  let body: { orderId?: unknown; phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 });
  }

  const access = await verifyOrderAccess(req, body.orderId, body.phone);
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  const { orderId, order: mongoOrder, viaAccount } = access;

  // Owner-managed status lives in Sanity; fall back to the website record until it is synced.
  const [managed, admin] = await Promise.all([getSanityOrder(orderId), getAdminSettings()]);
  const status = managed?.status ?? mongoOrder.status;
  const statusHistory = managed?.statusHistory ?? [{ status: mongoOrder.status, at: new Date(mongoOrder.createdAt).toISOString() }];
  const ri = managed?.returnInfo;
  const addr = mongoOrder.shippingAddress;
  const policy = refundBreakdown(mongoOrder, admin.refundDeliveryCharge);
  const data = {
    orderId,
    status,
    placedAt: managed?.placedAt ?? new Date(mongoOrder.createdAt).toISOString(),
    statusHistory,
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
    cancelRequest: managed?.cancelRequest ?? null,
    returnRequest: ri?.requestedAt
      ? { reasonCategory: ri.reasonCategory, requestedAt: ri.requestedAt, rejectedReason: ri.rejectedReason, rejectedAt: ri.rejectedAt, photoCount: ri.photoCount ?? 0 }
      : null,
    // Requests are stored in Sanity, so they need the order to be synced there.
    ...(managed
      ? requestEligibility({ status, statusHistory, cancelRequest: managed.cancelRequest, returnInfo: ri }, admin.returnWindowDays ?? 7)
      : { canCancel: false, canReturn: false, returnDaysLeft: null, returnWindowDays: admin.returnWindowDays ?? 7 }),
    shipTo: { name: addr?.fullName, city: addr?.city, state: addr?.state, pincode: addr?.pincode },
    verifyWith: mongoOrder.userId ? 'account' : 'otp',
    refund: refundView(managed, mongoOrder.userId ? 'account' : 'otp', policy),
    // What a cancellation / return would refund, so the customer is told before they ask.
    refundPolicy: { deliveryCharge: policy.deliveryCharge, refundable: policy.expected, deducted: policy.deducted },
    delivery: deliveryView(mongoOrder, status, viaAccount),
  };

  return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
}
