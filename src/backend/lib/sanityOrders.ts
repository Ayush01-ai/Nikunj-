import { writeClient } from '@/cms/lib/client';
import { STOCK_PRODUCTS_QUERY, buildStockPatches, stockLookupIds } from '@/cms/lib/orderStock';
import type { IOrder } from '@/backend/models/Order';
import { notifyOrder } from '@/backend/lib/orderNotify';
import type { CancelRequestInfo } from '@/cms/lib/orderRequests';
import type { RefundInfo } from '@/cms/lib/refunds';
import { recordOrderPlaced } from '@/backend/lib/analytics';
import { releaseStockHold } from '@/backend/lib/stockHold';

/** Private ID path: documents with a dot in the ID are not readable through the public dataset API. */
export const sanityOrderId = (orderId: string) => `orders.${orderId}`;

export interface SanityOrder {
  orderNumber: string;
  status: string;
  placedAt?: string;
  customerName?: string;
  phone?: string;
  shippingAddress?: { city?: string; state?: string; pincode?: string };
  items?: { productName?: string; image?: string; option?: string; colour?: string; price?: number; quantity?: number }[];
  subtotal?: number;
  deliveryCharge?: number;
  discount?: number;
  total?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  tracking?: { courier?: string; trackingNumber?: string; trackingUrl?: string };
  statusHistory?: { status: string; at: string; note?: string }[];
  cancelRequest?: CancelRequestInfo | null;
  returnInfo?: { reasonCategory?: string; reason?: string; requestedAt?: string; rejectedReason?: string; rejectedAt?: string; photoCount?: number; refundAmount?: number; refundedAt?: string } | null;
  paymentGateway?: string;
  cashfreeOrderId?: string;
  cashfreePaymentId?: string;
  razorpayPaymentId?: string;
  refund?: RefundInfo | null;
}

const ORDER_PROJECTION = `{
  orderNumber, status, placedAt, customerName, phone,
  shippingAddress{city, state, pincode},
  items[]{productName, image, option, colour, price, quantity},
  subtotal, deliveryCharge, discount, total, paymentMethod, paymentStatus,
  tracking, statusHistory[]{status, at, note},
  cancelRequest{state, reasonCategory, details, requestedAt, decidedAt, decisionNote},
  returnInfo{reasonCategory, reason, requestedAt, rejectedReason, rejectedAt, refundAmount, refundedAt, "photoCount": count(photos)},
  paymentGateway, cashfreeOrderId, cashfreePaymentId, razorpayPaymentId, refund
}`;

const hasToken = () => Boolean(process.env.SANITY_API_TOKEN);

export async function getSanityOrder(orderId: string): Promise<SanityOrder | null> {
  if (!hasToken()) return null;
  try {
    return await writeClient.fetch<SanityOrder | null>(`*[_id == $id][0]${ORDER_PROJECTION}`, { id: sanityOrderId(orderId) });
  } catch (error) {
    console.error('[sanity-orders] read failed', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Several orders at once (customer's My Account list), keyed by order number. */
export async function getSanityOrders(orderIds: string[]): Promise<Map<string, SanityOrder>> {
  if (!hasToken() || orderIds.length === 0) return new Map();
  try {
    const rows = await writeClient.fetch<SanityOrder[]>(`*[_id in $ids]${ORDER_PROJECTION}`, { ids: orderIds.map(sanityOrderId) });
    return new Map(rows.map((r) => [r.orderNumber, r]));
  } catch (error) {
    console.error('[sanity-orders] bulk read failed', error instanceof Error ? error.message : error);
    return new Map();
  }
}

export async function getSanityOrderStatuses(orderIds: string[]): Promise<Map<string, string>> {
  if (!hasToken() || orderIds.length === 0) return new Map();
  try {
    const rows = await writeClient.fetch<{ orderNumber: string; status: string }[]>(
      `*[_id in $ids]{orderNumber, status}`,
      { ids: orderIds.map(sanityOrderId) },
    );
    return new Map(rows.map((r) => [r.orderNumber, r.status]));
  } catch {
    return new Map();
  }
}

/**
 * Copy a confirmed order into Sanity (where the owner manages it) and reduce stock — in one transaction.
 * Idempotent: if the order already exists the create fails with 409 and stock is untouched.
 */
export async function pushConfirmedOrderToSanity(order: IOrder, note: string): Promise<boolean> {
  if (!hasToken()) {
    console.error('[sanity-orders] SANITY_API_TOKEN missing; order not synced:', order.orderId);
    return false;
  }
  try {
    const lines = order.items.map((i) => ({ productId: i.productId, option: i.selectedSize, quantity: i.quantity }));
    const products = await writeClient.fetch(STOCK_PRODUCTS_QUERY, { ids: stockLookupIds(lines) });
    const stockPatches = buildStockPatches(products, lines, -1);
    const now = new Date().toISOString();
    const addr = order.shippingAddress;

    const tx = writeClient.transaction().create({
      _id: sanityOrderId(order.orderId),
      _type: 'order',
      orderNumber: order.orderId,
      status: 'confirmed',
      placedAt: (order.createdAt ?? new Date()).toISOString(),
      customerName: addr.fullName,
      phone: addr.phone,
      shippingAddress: {
        line1: addr.line1,
        line2: addr.line2,
        landmark: addr.landmark,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
      },
      items: order.items.map((i) => ({
        productId: i.productId,
        productName: i.name,
        image: i.image || undefined,
        option: i.selectedSize,
        colour: i.selectedColor,
        price: i.price,
        quantity: i.quantity,
      })),
      subtotal: order.subtotal,
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      couponCode: order.couponCode,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      razorpayPaymentId: order.razorpayPaymentId,
      paymentGateway: order.paymentGateway,
      cashfreeOrderId: order.cashfreeOrderId,
      cashfreePaymentId: order.cashfreePaymentId,
      statusHistory: [{ status: 'confirmed', at: now, note }],
      stockAdjusted: stockPatches.length > 0,
    });
    for (const patch of stockPatches) tx.patch(patch.id, (p) => p.inc(patch.inc));
    await tx.commit({ autoGenerateArrayKeys: true });
    await releaseStockHold(order.orderId);
    await recordOrderPlaced({ orderId: order.orderId, total: order.total, phone: addr.phone, name: addr.fullName, placedAt: order.createdAt });
    // Fresh order only (a duplicate create returns 409 below), so the customer is messaged once.
    await notifyCustomerOrderConfirmed(order);
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 409) {
      await releaseStockHold(order.orderId);
      return true;
    }
    console.error('[sanity-orders] sync failed', order.orderId, error instanceof Error ? error.message : error);
    if (status === 401 || status === 403) {
      console.error(
        '[sanity-orders] SANITY_API_TOKEN cannot write to Sanity. Use a token with the "Editor" role ' +
          '(sanity.io/manage → API → Tokens). Copy missed orders with: ' +
          'npx sanity exec scripts/sync-orders-to-sanity.mjs --with-user-token -- --apply',
      );
    }
    // The order is saved and confirmed on the website, so the customer must still be told.
    await notifyCustomerOrderConfirmed(order);
    return false;
  }
}

/** Order confirmation to the customer on the channel snapshotted at order time (see orderNotify.ts). Idempotent. */
async function notifyCustomerOrderConfirmed(order: IOrder): Promise<void> {
  const addr = order.shippingAddress;
  const items = order.items.map((i) => ({
    productName: i.name,
    option: i.selectedSize,
    colour: i.selectedColor,
    price: i.price,
    quantity: i.quantity,
  }));

  try {
    await notifyOrder(order.orderId, {
      orderNumber: order.orderId,
      status: 'confirmed',
      customerName: addr.fullName,
      total: order.total,
      paymentStatus: order.paymentStatus,
      items,
      confirmation: {
        orderNumber: order.orderId,
        customerName: addr.fullName,
        items,
        subtotal: order.subtotal,
        deliveryCharge: order.deliveryCharge,
        discount: order.discount,
        total: order.total,
        paymentMethod: order.paymentMethod,
        trackUrl: '',
      },
    });
  } catch (error) {
    console.error('[order-notify]', order.orderId, error instanceof Error ? error.message : error);
  }
}

export interface AdminSettings {
  ownerWhatsApp?: string;
  adminPhones?: string[];
  returnWindowDays?: number;
  deliveryPartnerName?: string;
  deliveryPartnerWhatsApp?: string;
  refundDeliveryCharge?: boolean;
}

export async function getAdminSettings(): Promise<AdminSettings> {
  if (!hasToken()) return {};
  try {
    return (await writeClient.fetch(`*[_id == "settings.admin"][0]{ownerWhatsApp, adminPhones, returnWindowDays, deliveryPartnerName, deliveryPartnerWhatsApp, refundDeliveryCharge}`)) ?? {};
  } catch {
    return {};
  }
}
