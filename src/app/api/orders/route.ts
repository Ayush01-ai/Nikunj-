import { NextRequest, NextResponse } from 'next/server';
import { connectDB, isDbConnectionError } from '@/backend/lib/mongodb';
import { Order, type IOrder } from '@/backend/models/Order';
import { AuthError, isValidPhone, sanitizePhone, type LoginMethod } from '@/backend/lib/auth';
import { snapshotForOrder } from '@/backend/lib/orderNotify';
import { requireAuthHybrid } from '@/backend/lib/clerk';
import { nanoid } from 'nanoid';
import sanitizeHtml from 'sanitize-html';
import { client } from '@/cms/lib/client';
import { COUPON_BY_CODE_QUERY, SITE_SETTINGS_QUERY } from '@/cms/lib/queries';
import { getAdminSettings, getSanityOrderStatuses, getSanityOrders, pushConfirmedOrderToSanity } from '@/backend/lib/sanityOrders';
import { refundView } from '@/backend/lib/refundView';
import { deliveryView } from '@/backend/lib/delivery';
import { refundBreakdown } from '@/cms/lib/refunds';
import { heldQuantities, holdKey, withStockLock } from '@/backend/lib/stockHold';
import { getVariantPricing } from '@/cms/lib/pricing';
import type { Coupon, ProductSize, SiteSettings } from '@/types';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';

const MAX_LINE_ITEMS = 50;
const MAX_QTY_PER_ITEM = 99;

// Order creation has no gateway call and no order id to scope by yet, so this is IP-only —
// a generous ceiling that blocks scripted cart-spam without interfering with a real shopper
// retrying checkout a few times. See rateLimit.ts for the process-local caveat.
const isOrderCreateLimited = createRateLimiter(20, 10 * 60 * 1000, 'api/orders:isOrderCreateLimited');

interface IncomingItem {
  productId: string;
  productName?: string;
  image?: string;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

interface VerifiedProduct {
  _id: string;
  name: string;
  price: number;
  stock: number;
  sizes?: { label: string; priceModifier?: number; price?: number; mrp?: number; stock?: number }[];
  colors?: { label: string; price?: number; mrp?: number }[];
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? sanitizeHtml(v, { allowedTags: [], allowedAttributes: {} }).slice(0, max) : undefined;

// ─── POST: Place a new order ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    if (await isOrderCreateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many orders placed. Please try again in a few minutes.' },
        { status: 429, headers: { 'Retry-After': String(isOrderCreateLimited.retryAfterSeconds(ip)) } },
      );
    }

    const body = await req.json();

    // Optional auth — recognizes either a Clerk session or the legacy `ns_token` cookie.
    let userId: string | undefined;
    let loginMethod: LoginMethod | undefined;
    try {
      const payload = await requireAuthHybrid(req);
      userId = payload.userId;
      loginMethod = payload.method;
    } catch {
      // Guest checkout
    }

    // ── Input validation ────────────────────────────────────────────────
    const { items, shippingAddress, couponCode, paymentMethod } = body ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'Cart is empty.' }, { status: 400 });
    }
    if (items.length > MAX_LINE_ITEMS) {
      return NextResponse.json({ success: false, error: 'Too many items in cart.' }, { status: 400 });
    }
    for (const item of items as IncomingItem[]) {
      if (
        typeof item?.productId !== 'string' ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > MAX_QTY_PER_ITEM
      ) {
        return NextResponse.json({ success: false, error: 'Invalid cart item.' }, { status: 400 });
      }
    }

    const validPaymentMethods = ['upi', 'card', 'netbanking', 'cod', 'whatsapp'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return NextResponse.json({ success: false, error: 'Invalid payment method.' }, { status: 400 });
    }

    const addr = shippingAddress;
    if (!addr?.fullName || !addr?.phone || !addr?.line1 || !addr?.city || !addr?.state || !addr?.pincode) {
      return NextResponse.json({ success: false, error: 'Complete shipping address is required.' }, { status: 400 });
    }

    // Validate pincode & phone format
    if (!/^\d{6}$/.test(String(addr.pincode))) {
      return NextResponse.json({ success: false, error: 'Invalid pincode.' }, { status: 400 });
    }
    if (!isValidPhone(String(addr.phone))) {
      return NextResponse.json({ success: false, error: 'Invalid mobile number.' }, { status: 400 });
    }
    const addrPhone = sanitizePhone(String(addr.phone));
    const guestPhone = userId ? undefined : addrPhone;

    // Whitelist + sanitise text fields (no spreading of untrusted input)
    const sanitized = {
      fullName: clean(addr.fullName, 100),
      phone: addrPhone,
      line1: clean(addr.line1, 200),
      line2: clean(addr.line2, 200),
      city: clean(addr.city, 80),
      state: clean(addr.state, 80),
      pincode: String(addr.pincode),
      landmark: clean(addr.landmark, 120),
    };

    // ── Server-side verification & price calculation ────────────────────
    const productIds = (items as IncomingItem[]).map((item) => item.productId);
    // Price must match what the storefront displays (shared pricing rules).
    const dbProducts = await client.fetch<VerifiedProduct[]>(
      `*[_type == "product" && isActive == true && _id in $productIds]{
        _id, name,
        "price": select(defined(salePrice) && salePrice > 0 && salePrice < price => salePrice, price),
        "stock": coalesce(stockQuantity, stock, 0),
        "sizes": sizes[defined(label)]{label, "priceModifier": coalesce(priceModifier, 0), price, mrp, stock},
        "colors": colors[defined(label)]{label, price, mrp}
      }`,
      { productIds }
    );

    const productMap = new Map(dbProducts.map((p) => [p._id, p]));
    let calculatedSubtotal = 0;
    const verifiedItems: IOrder['items'] = [];
    const stockChecks: { key: string; available: number; label: string }[] = [];

    for (const item of items as IncomingItem[]) {
      const dbProduct = productMap.get(item.productId);
      if (!dbProduct) {
        return NextResponse.json(
          { success: false, error: `Product "${item.productName || 'unknown'}" is no longer available.` },
          { status: 400 }
        );
      }

      // Use verified price from CMS, including variant price / adjustment
      const variants = dbProduct.sizes ?? [];
      const variant = item.selectedSize ? variants.find((s) => s.label === item.selectedSize) : undefined;
      if (variants.length > 0 && !variant) {
        return NextResponse.json(
          { success: false, error: `Please choose a valid option for "${dbProduct.name}".` },
          { status: 400 }
        );
      }
      const colours = dbProduct.colors ?? [];
      const colour = item.selectedColor ? colours.find((c) => c.label === item.selectedColor) : undefined;
      const pricing = getVariantPricing(
        { price: dbProduct.price, stock: dbProduct.stock, sizes: variants as ProductSize[], colors: colours },
        variant?.label,
        colour?.label,
      );
      if (pricing.stock < item.quantity) {
        return NextResponse.json(
          { success: false, error: `Insufficient stock for "${dbProduct.name}"${variant ? ` (${variant.label})` : ''}.` },
          { status: 400 }
        );
      }
      const verifiedPrice = pricing.price;
      calculatedSubtotal += verifiedPrice * item.quantity;
      stockChecks.push({
        key: holdKey(item.productId, typeof variant?.stock === 'number' ? variant.label : undefined),
        available: pricing.stock,
        label: `${dbProduct.name}${variant ? ` (${variant.label})` : ''}`,
      });

      verifiedItems.push({
        productId: item.productId,
        name: dbProduct.name,
        image: typeof item.image === 'string' && item.image.startsWith('https://cdn.sanity.io/') ? item.image : '',
        price: verifiedPrice,
        quantity: item.quantity,
        selectedSize: clean(item.selectedSize, 50),
        selectedColor: clean(item.selectedColor, 50),
      });
    }

    // Fetch site settings for delivery fee configuration
    const settings = await client.fetch<SiteSettings | null>(SITE_SETTINGS_QUERY);
    const FREE_DELIVERY_THRESHOLD = settings?.freeDeliveryThreshold ?? 999;
    const DELIVERY_CHARGE = settings?.deliveryCharge ?? 99;

    // Validate Coupon if applied
    await connectDB();
    let calculatedDiscount = 0;
    let appliedCoupon: string | undefined;
    if (couponCode) {
      const formattedCode = String(couponCode).trim().toUpperCase().slice(0, 20);
      const coupon = await client.fetch<Coupon | null>(COUPON_BY_CODE_QUERY, { code: formattedCode });
      
      if (coupon) {
        const now = new Date();
        const isStarted = !coupon.validFrom || now >= new Date(coupon.validFrom);
        const isNotExpired = !coupon.validUntil || now <= new Date(coupon.validUntil);
        const meetsMinValue = !coupon.minimumOrderValue || calculatedSubtotal >= coupon.minimumOrderValue;
        const withinUsageLimit =
          !coupon.usageLimit ||
          (await Order.countDocuments({ couponCode: coupon.code, status: { $nin: ['cancelled', 'refunded'] } })) <
            coupon.usageLimit;

        if (isStarted && isNotExpired && meetsMinValue && withinUsageLimit) {
          appliedCoupon = coupon.code;
          if (coupon.discountType === 'percentage') {
            calculatedDiscount = Math.round((calculatedSubtotal * coupon.discountValue) / 100);
            if (coupon.maximumDiscountCap > 0) {
              calculatedDiscount = Math.min(calculatedDiscount, coupon.maximumDiscountCap);
            }
          } else {
            calculatedDiscount = Math.min(coupon.discountValue, calculatedSubtotal);
          }
        }
      }
    }

    const calculatedDeliveryCharge = calculatedSubtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;
    const calculatedTotal = calculatedSubtotal + calculatedDeliveryCharge - calculatedDiscount;

    const orderId = `NS-${nanoid(8).toUpperCase()}`;

    // Re-check stock against pieces already reserved by other unconfirmed orders, under a lock so
    // two simultaneous checkouts can't both take the last piece.
    const wanted = new Map<string, number>();
    for (let i = 0; i < verifiedItems.length; i++) {
      wanted.set(stockChecks[i].key, (wanted.get(stockChecks[i].key) ?? 0) + verifiedItems[i].quantity);
    }
    // Destination for order updates comes from the verified session + account, never from the request body.
    const notification = await snapshotForOrder(userId, loginMethod, guestPhone);
    const created = await withStockLock(productIds, async () => {
      const held = await heldQuantities(productIds);
      for (const check of stockChecks) {
        if ((held.get(check.key) ?? 0) + (wanted.get(check.key) ?? 0) > check.available) {
          return { soldOut: check.label } as const;
        }
      }
      const doc = await Order.create({
        orderId,
        userId,
        guestPhone,
        notification,
        items: verifiedItems,
        shippingAddress: sanitized,
        subtotal: calculatedSubtotal,
        deliveryCharge: calculatedDeliveryCharge,
        discount: calculatedDiscount,
        total: calculatedTotal,
        couponCode: appliedCoupon,
        paymentMethod,
        paymentStatus: 'pending',
        // COD is confirmed immediately; online orders are confirmed once payment is verified.
        status: paymentMethod === 'cod' ? 'confirmed' : 'pending',
        stockHeld: true,
      });
      return { order: doc } as const;
    });

    if ('soldOut' in created) {
      return NextResponse.json(
        { success: false, error: `Sorry, "${created.soldOut}" just sold out — other customers are checking out the last pieces. Please reduce the quantity or try again later.` },
        { status: 409 },
      );
    }
    const order = created.order;

    if (paymentMethod === 'cod') {
      await pushConfirmedOrderToSanity(order, 'Cash on Delivery order placed');
    }

    return NextResponse.json({
      success: true,
      orderId: order.orderId,
      _id: order._id.toString(),
      total: order.total,
    });
  } catch (error) {
    console.error('[orders POST]', error);
    if (isDbConnectionError(error)) {
      // Be honest: this is a database outage, not a problem with the order itself.
      // No order was created, so it's safe for the customer to retry shortly.
      return NextResponse.json(
        { success: false, error: 'Unable to reach the database right now. Please try again in a few minutes.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: false, error: 'Failed to place order.' }, { status: 500 });
  }
}

// ─── GET: Fetch orders (admin or own orders) ──────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { userId, role } = await requireAuthHybrid(req);

    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const status = searchParams.get('status');
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = role === 'admin'
      ? (status ? { status } : {})
      : { userId };

    const [orders, total] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(query),
    ]);

    // The owner manages status in Sanity; that is the source of truth for customers.
    let data;
    if (role === 'admin') {
      const statuses = await getSanityOrderStatuses(orders.map((o) => o.orderId));
      data = orders.map((o) => ({ ...o, status: statuses.get(o.orderId) ?? o.status }));
    } else {
      // Customers also get their refund status, so "share your UPI / bank details" can be shown up front.
      const [managed, admin] = await Promise.all([getSanityOrders(orders.map((o) => o.orderId)), getAdminSettings()]);
      data = orders.map((o) => {
        const m = managed.get(o.orderId) ?? null;
        return {
          ...o,
          delivery: deliveryView(o, m?.status ?? o.status, true),
          status: m?.status ?? o.status,
          paymentStatus: m?.paymentStatus ?? o.paymentStatus,
          refund: refundView(m, 'account', refundBreakdown(o, admin.refundDeliveryCharge)),
        };
      });
    }

    return NextResponse.json({
      success: true,
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[orders GET]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch orders.' }, { status: 500 });
  }
}
