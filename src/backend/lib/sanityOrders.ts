import { writeClient } from '@/cms/lib/client';
import { STOCK_PRODUCTS_QUERY, buildStockPatches, findInsufficientStockLines, stockLookupIds } from '@/cms/lib/orderStock';
import { Order, type IOrder } from '@/backend/models/Order';
import { notifyOrder } from '@/backend/lib/orderNotify';
import type { CancelRequestInfo } from '@/cms/lib/orderRequests';
import type { RefundInfo } from '@/cms/lib/refunds';
import { recordOrderPlaced } from '@/backend/lib/analytics';
import { releaseStockHold } from '@/backend/lib/stockHold';
import { ensureShiprocketOrder } from '@/backend/lib/shiprocketFulfilment';
import { alertOwnerOrderIssue } from '@/backend/lib/ownerAlert';

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
  needsAttention?: boolean;
  attentionNote?: string;
  razorpayPaymentId?: string;
  upiReference?: string;
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
  paymentGateway, cashfreeOrderId, cashfreePaymentId, razorpayPaymentId, upiReference, refund
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

/** Records the customer-reported UPI reference on an order that is still awaiting payment in Studio. */
export async function setSanityUpiReference(orderId: string, upiReference: string): Promise<boolean> {
  if (!hasToken()) return false;
  const id = sanityOrderId(orderId);
  try {
    const doc = await writeClient.fetch<{ _rev: string } | null>(`*[_id == $id && status == "pending"][0]{_rev}`, { id });
    if (!doc) return false;
    // ifRevisionId: abort if the owner confirmed/cancelled the order between the read and this write.
    await writeClient
      .patch(id)
      .ifRevisionId(doc._rev)
      .setIfMissing({ statusHistory: [] })
      .set({ upiReference })
      .append('statusHistory', [{ status: 'pending', at: new Date().toISOString(), note: `Customer reported UPI reference ${upiReference}` }])
      .commit({ autoGenerateArrayKeys: true });
    return true;
  } catch (error) {
    console.error('[sanity-orders] upi reference failed', orderId, error instanceof Error ? error.message : error);
    return false;
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

/** Sync a confirmed order to Sanity; Cashfree orders use the revision-guarded paid/failure path below. */
export async function pushConfirmedOrderToSanity(order: IOrder, note: string): Promise<boolean> {
  if (order.paymentMethod === 'online' && order.paymentGateway === 'cashfree') {
    return syncCashfreeOrderToSanity(order, 'paid', note);
  }
  return pushOrderToSanity(order, note, 'confirmed');
}

/** Updates Cashfree payment failures without touching inventory unless it was previously decremented. */
export async function pushCashfreePaymentFailureToSanity(order: IOrder, note: string): Promise<boolean> {
  return syncCashfreeOrderToSanity(order, 'failed', note);
}

/**
 * Manual-UPI order: copied into Sanity as "Awaiting payment" (stock reserved there) so the owner can match
 * the incoming UPI credit and confirm it. The customer is not sent a confirmation until the owner confirms.
 */
export async function pushAwaitingPaymentOrderToSanity(order: IOrder, note: string): Promise<boolean> {
  return pushOrderToSanity(order, note, 'pending');
}

/**
 * Retries the Sanity copy of an order whose first sync failed (e.g. the token was missing or Sanity was down).
 * `stockHeld` is cleared once an order reaches Sanity, so it marks orders that never got there.
 * Safe to call repeatedly: it is a no-op for synced orders, and a concurrent duplicate create returns 409.
 */
export async function resyncOrderToSanity(orderId: string): Promise<boolean> {
  if (!hasToken()) return false;
  try {
    const order = await Order.findOne({ orderId, stockHeld: true, status: { $ne: 'cancelled' } });
    if (!order) return false;
    if (order.paymentMethod === 'upi' && order.paymentStatus !== 'paid') {
      // Abandoned payment-gateway attempts (e.g. legacy Cashfree) are not manual-UPI orders.
      if (order.paymentGateway) return false;
      return await pushOrderToSanity(order, 'UPI order placed — awaiting manual payment verification (re-synced)', 'pending');
    }
    if (order.paymentGateway === 'cashfree' && order.paymentStatus === 'paid') {
      return await pushConfirmedOrderToSanity(order, 'Cashfree payment received (re-synced)');
    }
    if (order.paymentMethod === 'cod' || order.paymentStatus === 'paid') {
      return await pushOrderToSanity(order, `${order.paymentMethod === 'cod' ? 'Cash on Delivery order placed' : 'Payment received online'} (re-synced)`, 'confirmed');
    }
    return false;
  } catch (error) {
    console.error('[sanity-orders] resync failed', orderId, error instanceof Error ? error.message : error);
    return false;
  }
}

async function pushOrderToSanity(order: IOrder, note: string, status: 'confirmed' | 'pending'): Promise<boolean> {
  const confirmed = status === 'confirmed';
  if (!hasToken()) {
    console.error(
      '[sanity-orders] SANITY_API_TOKEN missing; order not synced:', order.orderId,
      '— add SANITY_API_TOKEN (Editor role) under Cloudflare → Workers → nikunj → Settings → Variables and Secrets. ' +
        'The order is re-synced automatically when the customer next opens its page, or run scripts/sync-orders-to-sanity.mjs.',
    );
    // The order is saved and confirmed on the website, so the customer must still be told.
    if (confirmed) await notifyCustomerOrderConfirmed(order);
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
      status,
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
      upiReference: order.upiReference,
      statusHistory: [{ status, at: now, note }],
      stockAdjusted: stockPatches.length > 0,
    });
    for (const patch of stockPatches) tx.patch(patch.id, (p) => p.inc(patch.inc));
    await tx.commit({ autoGenerateArrayKeys: true });
    await releaseStockHold(order.orderId);
    if (confirmed) {
      await recordOrderPlaced({ orderId: order.orderId, total: order.total, phone: addr.phone, name: addr.fullName, placedAt: order.createdAt });
    }
    // Fresh order only (a duplicate create returns 409 below), so the customer is messaged once.
    if (confirmed) await notifyCustomerOrderConfirmed(order);
    return true;
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 409) {
      await releaseStockHold(order.orderId);
      return true;
    }
    console.error('[sanity-orders] sync failed', order.orderId, error instanceof Error ? error.message : error);
    if (statusCode === 401 || statusCode === 403) {
      console.error(
        '[sanity-orders] SANITY_API_TOKEN cannot write to Sanity. Use a token with the "Editor" role ' +
          '(sanity.io/manage → API → Tokens). Copy missed orders with: ' +
          'npx sanity exec scripts/sync-orders-to-sanity.mjs --with-user-token -- --apply',
      );
    }
    // The order is saved and confirmed on the website, so the customer must still be told.
    if (confirmed) await notifyCustomerOrderConfirmed(order);
    return false;
  }
}

async function syncCashfreeOrderToSanity(
  order: IOrder,
  paymentStatus: 'paid' | 'failed',
  note: string,
): Promise<boolean> {
  if (!hasToken()) {
    console.error('[sanity-orders] SANITY_API_TOKEN missing; Cashfree order not synced:', order.orderId);
    if (paymentStatus === 'paid') await notifyCustomerOrderConfirmed(order);
    return false;
  }

  const id = sanityOrderId(order.orderId);
  const lines = order.items.map((item) => ({
    productId: item.productId,
    option: item.selectedSize,
    quantity: item.quantity,
  }));
  const now = new Date().toISOString();
  const address = order.shippingAddress;
  const initialStatus = paymentStatus === 'paid' ? 'pending' : 'payment_failed';
  const initialDocument = {
    _id: id,
    _type: 'order',
    orderNumber: order.orderId,
    status: initialStatus,
    placedAt: (order.createdAt ?? new Date()).toISOString(),
    customerName: address.fullName,
    phone: address.phone,
    shippingAddress: {
      line1: address.line1,
      line2: address.line2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    },
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.name,
      image: item.image || undefined,
      option: item.selectedSize,
      colour: item.selectedColor,
      price: item.price,
      quantity: item.quantity,
    })),
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    discount: order.discount,
    couponCode: order.couponCode,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus,
    paymentGateway: order.paymentGateway,
    cashfreeOrderId: order.cashfreeOrderId,
    cashfreePaymentId: order.cashfreePaymentId,
    statusHistory: [{ status: initialStatus, at: now, note }],
    stockAdjusted: false,
  };

  try {
    // Seed absent orders without changing stock. The following revision-guarded patch is
    // the only operation allowed to adjust inventory, including for concurrent webhook retries.
    await writeClient.createIfNotExists(initialDocument);

    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await writeClient.fetch<{
        _rev: string;
        status?: string;
        paymentStatus?: string;
        stockAdjusted?: boolean;
      } | null>(`*[_id == $id][0]{_rev,status,paymentStatus,stockAdjusted}`, { id });
      if (!current) throw new Error('Cashfree Sanity order could not be created.');
      const protectedStatuses = new Set([
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'return_requested',
        'return_approved',
        'returned',
        'refunded',
      ]);
      if (paymentStatus === 'failed' && (current.paymentStatus === 'paid' || protectedStatuses.has(current.status ?? ''))) {
        return true;
      }

      const adjustStock = paymentStatus === 'paid' ? current.stockAdjusted !== true : current.stockAdjusted === true;
      let stockPatches: ReturnType<typeof buildStockPatches> = [];
      let insufficientStockLines: ReturnType<typeof findInsufficientStockLines> = [];
      if (adjustStock) {
        const products = await writeClient.fetch(STOCK_PRODUCTS_QUERY, { ids: stockLookupIds(lines) });
        stockPatches = buildStockPatches(products, lines, paymentStatus === 'paid' ? -1 : 1);
        if (paymentStatus === 'paid') insufficientStockLines = findInsufficientStockLines(products, lines);
        if (paymentStatus === 'failed' && stockPatches.length === 0) {
          throw new Error('Previously adjusted Cashfree stock could not be found for restoration.');
        }
      }
      const attentionItems = insufficientStockLines.map((line) => {
        const item = order.items.find(
          (candidate) => candidate.productId === line.productId && candidate.selectedSize === line.option,
        );
        return `${item?.name ?? line.productId}${line.option ? ` (${line.option})` : ''}`;
      });

      const nextStatus =
        paymentStatus === 'paid'
          ? current.status === 'pending' || current.status === 'payment_failed' ? 'confirmed' : current.status ?? 'confirmed'
          : 'payment_failed';
      const changed = current.status !== nextStatus || current.paymentStatus !== paymentStatus;
      const tx = writeClient.transaction().patch(id, (patch) => {
        patch
          .ifRevisionId(current._rev)
          .set({
            status: nextStatus,
            paymentStatus,
            paymentGateway: order.paymentGateway,
            cashfreeOrderId: order.cashfreeOrderId,
            ...(order.cashfreePaymentId ? { cashfreePaymentId: order.cashfreePaymentId } : {}),
            stockAdjusted: paymentStatus === 'paid' ? current.stockAdjusted === true || stockPatches.length > 0 : false,
            ...(attentionItems.length
              ? {
                  needsAttention: true,
                  attentionNote: `Paid order exceeded tracked stock for ${attentionItems.join(', ')}. Review inventory and fulfillment manually.`,
                }
              : {}),
          })
          .setIfMissing({ statusHistory: [] });
        if (changed) patch.append('statusHistory', [{ status: nextStatus, at: now, note }]);
        return patch;
      });

      for (const stockPatch of stockPatches) tx.patch(stockPatch.id, (patch) => patch.inc(stockPatch.inc));

      try {
        await tx.commit({ autoGenerateArrayKeys: true });
        if (attentionItems.length) {
          await alertOwnerOrderIssue({
            orderNumber: order.orderId,
            stage: 'over_stock',
            reason: `Paid order exceeded tracked stock for ${attentionItems.join(', ')}`,
            customerName: address.fullName,
            phone: address.phone,
            total: order.total,
          });
        }
        if (paymentStatus === 'paid') {
          await releaseStockHold(order.orderId);
          if (changed) {
            await recordOrderPlaced({
              orderId: order.orderId,
              total: order.total,
              phone: address.phone,
              name: address.fullName,
              placedAt: order.createdAt,
            });
          }
          await notifyCustomerOrderConfirmed(order);
        }
        return true;
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode !== 409 || attempt === 2) throw error;
      }
    }
    return false;
  } catch (error) {
    console.error('[sanity-orders] Cashfree sync failed', order.orderId, error instanceof Error ? error.message : error);
    if (paymentStatus === 'paid') {
      await alertOwnerOrderIssue({
        orderNumber: order.orderId,
        stage: 'sanity_push_failed',
        reason: 'Paid order could not be pushed to Sanity. Check the order manually.',
        customerName: address.fullName,
        phone: address.phone,
        total: order.total,
      });
      await notifyCustomerOrderConfirmed(order);
    }
    return false;
  }
}

/**
 * A successful payment arriving for an order that was already cancelled (in Mongo or Sanity) must not
 * confirm it: mark it refund_due + needsAttention on both stores and alert the owner. Returns true if handled.
 */
export async function handleLatePaymentOnCancelledOrder(order: IOrder, cashfreePaymentId: string): Promise<boolean> {
  const id = sanityOrderId(order.orderId);
  let sanityCancelled = false;
  if (hasToken()) {
    try {
      sanityCancelled = (await writeClient.fetch<string | null>(`*[_id == $id][0].status`, { id })) === 'cancelled';
    } catch {
      sanityCancelled = false;
    }
  }
  if (order.status !== 'cancelled' && !sanityCancelled) return false;

  const note = `Payment received after the order was cancelled (Cashfree payment ${cashfreePaymentId}). Refund the customer.`;
  await Order.updateOne(
    { orderId: order.orderId },
    { $set: { paymentStatus: 'refund_due', needsAttention: true, attentionNote: note, cashfreePaymentId } },
  ).catch(() => undefined);
  if (hasToken()) {
    await writeClient
      .patch(id)
      .set({ paymentStatus: 'refund_due', needsAttention: true, attentionNote: note, cashfreePaymentId })
      .commit()
      .catch((e: unknown) => console.error('[sanity-orders] late payment patch', order.orderId, e instanceof Error ? e.message : e));
  }
  await alertOwnerOrderIssue({
    orderNumber: order.orderId,
    stage: 'late_payment_on_cancelled',
    reason: note,
    customerName: order.shippingAddress?.fullName,
    phone: order.shippingAddress?.phone,
    total: order.total,
  });
  return true;
}

/** Order confirmation to the customer on the channel snapshotted at order time (see orderNotify.ts). Idempotent. */
export async function notifyCustomerOrderConfirmed(order: IOrder): Promise<void> {
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
      paymentMethod: order.paymentMethod,
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

  // Confirmed orders are booked on Shiprocket automatically (idempotent; failures only flag the order).
  await ensureShiprocketOrder(order.orderId).catch(() => undefined);
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
