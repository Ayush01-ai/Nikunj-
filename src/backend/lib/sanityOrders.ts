import { writeClient } from '@/cms/lib/client';
import { STOCK_PRODUCTS_QUERY, buildStockPatches, stockLookupIds } from '@/cms/lib/orderStock';
import type { IOrder } from '@/backend/models/Order';
import { sendOrderWhatsApp } from '@/backend/lib/whatsapp';
import type { CancelRequestInfo } from '@/cms/lib/orderRequests';

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
  returnInfo?: { reasonCategory?: string; reason?: string; requestedAt?: string; rejectedReason?: string; rejectedAt?: string; photoCount?: number } | null;
}

const ORDER_PROJECTION = `{
  orderNumber, status, placedAt, customerName, phone,
  shippingAddress{city, state, pincode},
  items[]{productName, image, option, colour, price, quantity},
  subtotal, deliveryCharge, discount, total, paymentMethod, paymentStatus,
  tracking, statusHistory[]{status, at, note},
  cancelRequest{state, reasonCategory, details, requestedAt, decidedAt, decisionNote},
  returnInfo{reasonCategory, reason, requestedAt, rejectedReason, rejectedAt, "photoCount": count(photos)}
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
      statusHistory: [{ status: 'confirmed', at: now, note }],
      stockAdjusted: stockPatches.length > 0,
    });
    for (const patch of stockPatches) tx.patch(patch.id, (p) => p.inc(patch.inc));
    await tx.commit({ autoGenerateArrayKeys: true });
    // Fresh order only (a duplicate create returns 409 below), so the customer is messaged once.
    await sendOrderWhatsApp({
      orderNumber: order.orderId,
      status: 'confirmed',
      customerName: addr.fullName,
      phone: addr.phone,
      total: order.total,
      paymentStatus: order.paymentStatus,
      items: order.items.map((i) => ({
        productName: i.name,
        option: i.selectedSize,
        colour: i.selectedColor,
        price: i.price,
        quantity: i.quantity,
      })),
    });
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 409) return true;
    console.error('[sanity-orders] sync failed', order.orderId, error instanceof Error ? error.message : error);
    return false;
  }
}

export async function getAdminSettings(): Promise<{ ownerWhatsApp?: string; adminPhones?: string[]; returnWindowDays?: number }> {
  if (!hasToken()) return {};
  try {
    return (await writeClient.fetch(`*[_id == "settings.admin"][0]{ownerWhatsApp, adminPhones, returnWindowDays}`)) ?? {};
  } catch {
    return {};
  }
}
