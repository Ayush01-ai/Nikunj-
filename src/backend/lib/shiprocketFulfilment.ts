import { Order, type IOrder } from '@/backend/models/Order';
import { connectDB } from '@/backend/lib/mongodb';
import { notifyOrder } from '@/backend/lib/orderNotify';
import { writeClient } from '@/cms/lib/client';
import { historyEntry } from '@/cms/lib/orderOps';
import {
  assignShiprocketAWB,
  cancelShiprocketOrder,
  createShiprocketOrder,
  generatePickup,
  generateShiprocketLabel,
  isShiprocketEnabled,
  LOGIN_FAILED_NOTE,
  ShiprocketError,
  mapShiprocketStatus,
  shiprocketTrackingUrl,
  shouldAutoAssignAwb,
} from '@/backend/lib/shiprocket';

// Sanity order docs live under a private id path; inlined to avoid a circular import with sanityOrders.ts.
const sanityId = (orderId: string) => `orders.${orderId}`;
const CLAIM_STALE_MS = 5 * 60 * 1000;
const hasToken = () => Boolean(process.env.SANITY_API_TOKEN);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);

export type FulfilResult =
  | { ok: true; created: true; shiprocketOrderId: string; shiprocketShipmentId: string; awbCode?: string }
  | { ok: true; created: false; reason: 'disabled' | 'not_found' | 'ineligible' | 'self_delivery' | 'exists' | 'in_progress' }
  | { ok: false; error: string };

type Shippable = Pick<IOrder, 'status' | 'paymentMethod' | 'paymentStatus'>;

/** Only paid (or COD) orders that are still waiting to be packed should be booked on Shiprocket. */
export function isShiprocketEligible(order: Shippable): boolean {
  const cod = order.paymentMethod === 'cod';
  if (!cod && order.paymentStatus !== 'paid') return false;
  return order.status === 'confirmed' || order.status === 'processing' || (cod && order.status === 'pending');
}

/** Best-effort Sanity write: Mongo is the system of record for the booking, so a Sanity outage never fails it. */
async function patchSanity(orderId: string, build: (p: ReturnType<typeof writeClient.patch>) => ReturnType<typeof writeClient.patch>) {
  if (!hasToken()) return;
  try {
    await build(writeClient.patch(sanityId(orderId)).setIfMissing({ shiprocket: {}, tracking: {}, statusHistory: [] })).commit({ autoGenerateArrayKeys: true });
  } catch (e) {
    console.error('[shiprocket] sanity patch', orderId, errMsg(e));
  }
}

async function sanityFulfilmentMode(orderId: string): Promise<string | undefined> {
  if (!hasToken()) return undefined;
  try {
    return (await writeClient.fetch<string | null>(`*[_id == $id][0].fulfilmentMode`, { id: sanityId(orderId) })) ?? undefined;
  } catch {
    return undefined;
  }
}

async function flagAttention(orderId: string, note: string) {
  await Order.updateOne({ orderId }, { $set: { shiprocketError: note, needsAttention: true, attentionNote: note }, $unset: { shiprocketClaimAt: '' } }).catch(() => undefined);
  await patchSanity(orderId, (p) => p.set({ needsAttention: true, attentionNote: note, 'shiprocket.error': note }));
}

/**
 * Idempotently books the order on Shiprocket (lands in the "New" queue unless AUTO_SHIP_AWB=true).
 * Never throws: a Shiprocket outage must not fail checkout, it flags the order for the owner instead.
 */
export async function ensureShiprocketOrder(orderId: string): Promise<FulfilResult> {
  if (!isShiprocketEnabled()) return { ok: true, created: false, reason: 'disabled' };
  try {
    await connectDB();
    const order = await Order.findOne({ orderId }).lean<IOrder>();
    if (!order) return { ok: true, created: false, reason: 'not_found' };
    if (order.fulfilmentMode === 'SELF_DELIVERY' || (await sanityFulfilmentMode(orderId)) === 'SELF_DELIVERY') {
      return { ok: true, created: false, reason: 'self_delivery' };
    }
    if (order.shiprocketOrderId) return { ok: true, created: false, reason: 'exists' };
    if (!isShiprocketEligible(order)) return { ok: true, created: false, reason: 'ineligible' };

    // Atomic claim: only one caller (verify, webhook, Studio) gets to create the Shiprocket order.
    const claim = await Order.updateOne(
      {
        orderId,
        shiprocketOrderId: null,
        $or: [{ shiprocketClaimAt: { $exists: false } }, { shiprocketClaimAt: null }, { shiprocketClaimAt: { $lt: new Date(Date.now() - CLAIM_STALE_MS) } }],
      },
      { $set: { shiprocketClaimAt: new Date() } },
    );
    if (!claim.modifiedCount) return { ok: true, created: false, reason: 'in_progress' };

    let created;
    try {
      created = await createShiprocketOrder(order);
    } catch (e) {
      const note = e instanceof ShiprocketError && e.loginFailure ? LOGIN_FAILED_NOTE : `Shiprocket booking failed: ${errMsg(e)}. Book it manually in Shiprocket or retry from the dashboard.`;
      await flagAttention(orderId, note);
      return { ok: false, error: note };
    }

    const set: Record<string, unknown> = {
      shiprocketOrderId: created.shiprocketOrderId,
      shiprocketShipmentId: created.shiprocketShipmentId,
      fulfilmentMode: 'SHIPROCKET',
    };
    await Order.updateOne({ orderId }, { $set: set, $unset: { shiprocketError: '', shiprocketClaimAt: '' } });
    await patchSanity(orderId, (p) =>
      p
        .set({ fulfilmentMode: 'SHIPROCKET', 'shiprocket.orderId': created.shiprocketOrderId, 'shiprocket.shipmentId': created.shiprocketShipmentId })
        .unset(['shiprocket.error'])
        .append('statusHistory', [historyEntry(order.status, 'Booked on Shiprocket')]),
    );

    let awbCode: string | undefined;
    if (shouldAutoAssignAwb() && created.shiprocketShipmentId) {
      awbCode = await autoShip(orderId, created.shiprocketShipmentId);
    }
    return { ok: true, created: true, shiprocketOrderId: created.shiprocketOrderId, shiprocketShipmentId: created.shiprocketShipmentId, awbCode };
  } catch (e) {
    console.error('[shiprocket] ensure', orderId, errMsg(e));
    return { ok: false, error: errMsg(e) };
  }
}

/** AWB + pickup + label, each best-effort; a failed step leaves the order in Shiprocket's queue for one-click shipping. */
export async function autoShip(orderId: string, shipmentId: string): Promise<string | undefined> {
  try {
    const awb = await assignShiprocketAWB(shipmentId);
    const trackingUrl = shiprocketTrackingUrl(awb.awbCode);
    let labelUrl: string | undefined;
    await generatePickup(shipmentId).catch((e) => console.error('[shiprocket] pickup', orderId, errMsg(e)));
    labelUrl = await generateShiprocketLabel(shipmentId).catch(() => undefined);
    await Order.updateOne(
      { orderId },
      {
        $set: {
          awbCode: awb.awbCode, courierName: awb.courierName, trackingUrl, ...(labelUrl ? { labelUrl } : {}),
          'tracking.courier': awb.courierName, 'tracking.trackingNumber': awb.awbCode, 'tracking.trackingUrl': trackingUrl,
        },
      },
    );
    await patchSanity(orderId, (p) =>
      p.set({
        'tracking.courier': awb.courierName, 'tracking.trackingNumber': awb.awbCode, 'tracking.trackingUrl': trackingUrl,
        'shiprocket.awbCode': awb.awbCode, 'shiprocket.courierName': awb.courierName, 'shiprocket.trackingUrl': trackingUrl,
        ...(labelUrl ? { 'shiprocket.labelUrl': labelUrl } : {}),
      }),
    );
    return awb.awbCode;
  } catch (e) {
    await flagAttention(orderId, e instanceof ShiprocketError && e.loginFailure ? LOGIN_FAILED_NOTE : `Shiprocket AWB not assigned: ${errMsg(e)}. Assign a courier in the Shiprocket panel.`);
    return undefined;
  }
}

/** Cancels the Shiprocket order when the owner cancels before the parcel moves. Never throws. */
export async function cancelShiprocketForOrder(orderId: string): Promise<{ cancelled: boolean; reason?: string }> {
  if (!isShiprocketEnabled()) return { cancelled: false, reason: 'disabled' };
  try {
    await connectDB();
    const order = await Order.findOne({ orderId }).select('shiprocketOrderId').lean<Pick<IOrder, 'shiprocketOrderId'>>();
    if (!order?.shiprocketOrderId) return { cancelled: false, reason: 'no_shiprocket_order' };
    await cancelShiprocketOrder(order.shiprocketOrderId);
    await Order.updateOne({ orderId }, { $unset: { shiprocketOrderId: '', shiprocketShipmentId: '', awbCode: '' } });
    await patchSanity(orderId, (p) => p.append('statusHistory', [historyEntry('cancelled', 'Shiprocket order cancelled')]));
    return { cancelled: true };
  } catch (e) {
    await flagAttention(orderId, `Could not cancel the Shiprocket order: ${errMsg(e)}. Cancel it in the Shiprocket panel.`);
    return { cancelled: false, reason: errMsg(e) };
  }
}

const RANK: Record<string, number> = { pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4 };

export interface ShiprocketWebhookPayload {
  awb?: string | number;
  courier_name?: string;
  current_status?: string;
  shipment_status?: string;
  order_id?: string | number;
}

export type WebhookOutcome = { handled: boolean; reason?: 'unknown_order' | 'unmapped_status' | 'no_change'; status?: string };

/** Applies one Shiprocket tracking event. Forward-only and idempotent, so retries and duplicates are harmless. */
export async function applyShiprocketStatusUpdate(payload: ShiprocketWebhookPayload): Promise<WebhookOutcome> {
  await connectDB();
  const awb = payload.awb ? String(payload.awb) : undefined;
  const orderRef = payload.order_id ? String(payload.order_id) : undefined;
  const order = (orderRef && (await Order.findOne({ orderId: orderRef }).lean<IOrder>())) || (awb && (await Order.findOne({ awbCode: awb }).lean<IOrder>())) || null;
  if (!order) return { handled: false, reason: 'unknown_order' };

  const mapped = mapShiprocketStatus(payload.current_status ?? payload.shipment_status);
  if (!mapped) return { handled: false, reason: 'unmapped_status' };
  const orderId = order.orderId;

  const trackingSet: Record<string, string> = {};
  if (awb && order.awbCode !== awb) {
    const trackingUrl = shiprocketTrackingUrl(awb);
    Object.assign(trackingSet, {
      awbCode: awb, trackingUrl, 'tracking.trackingNumber': awb, 'tracking.trackingUrl': trackingUrl,
      ...(payload.courier_name ? { courierName: payload.courier_name, 'tracking.courier': payload.courier_name } : {}),
    });
  }

  let advanced: string | undefined;
  if (mapped.status) {
    const next = mapped.status;
    const allowed =
      next === 'returned'
        ? ['shipped', 'delivered'].includes(order.status)
        : (RANK[order.status] ?? 99) < RANK[next];
    if (allowed) {
      const set: Record<string, string> = { ...trackingSet, status: next };
      const paymentNowPaid = next === 'delivered' && order.paymentMethod === 'cod' && order.paymentStatus !== 'paid';
      if (paymentNowPaid) set.paymentStatus = 'paid';
      // Filtering on the status we read makes a concurrent duplicate event a no-op.
      const res = await Order.updateOne({ orderId, status: order.status }, { $set: set });
      if (res.modifiedCount) {
        advanced = next;
        await patchSanity(orderId, (p) =>
          p
            .set({
              status: next,
              ...(paymentNowPaid ? { paymentStatus: 'paid' } : {}),
              ...(trackingSet['tracking.trackingNumber'] ? {
                'tracking.trackingNumber': trackingSet['tracking.trackingNumber'],
                'tracking.trackingUrl': trackingSet['tracking.trackingUrl'],
                ...(trackingSet['tracking.courier'] ? { 'tracking.courier': trackingSet['tracking.courier'] } : {}),
              } : {}),
            })
            .append('statusHistory', [historyEntry(next, mapped.note)]),
        );
      }
    }
  }
  if (!advanced && Object.keys(trackingSet).length) {
    await Order.updateOne({ orderId }, { $set: trackingSet });
  }

  if (mapped.attention) await flagAttention(orderId, mapped.attention);

  if (advanced === 'shipped' || advanced === 'delivered' || advanced === 'returned') {
    const fresh = await Order.findOne({ orderId }).lean<IOrder>();
    if (fresh) {
      // Keyed by status, so the Sanity "status changed" webhook cannot send the same message twice.
      await notifyOrder(orderId, {
        orderNumber: orderId,
        status: advanced,
        customerName: fresh.shippingAddress.fullName,
        total: fresh.total,
        paymentStatus: fresh.paymentStatus,
        tracking: { courier: fresh.tracking?.courier ?? fresh.courierName, trackingNumber: fresh.tracking?.trackingNumber ?? fresh.awbCode, trackingUrl: fresh.tracking?.trackingUrl ?? fresh.trackingUrl },
        items: fresh.items.map((i) => ({ productName: i.name, option: i.selectedSize, colour: i.selectedColor, price: i.price, quantity: i.quantity })),
      }).catch((e) => console.error('[shiprocket] notify', orderId, errMsg(e)));
    }
    return { handled: true, status: advanced };
  }
  if (mapped.attention) return { handled: true, status: order.status };

  // Out-for-delivery has no status of its own: log it once on the timeline without moving the order.
  if (mapped.status === 'shipped' && order.status === 'shipped' && mapped.note.endsWith('out for delivery')) {
    const key = 'sr:out_for_delivery';
    const claim = await Order.updateOne({ orderId, 'notificationLog.key': { $ne: key } }, { $push: { notificationLog: { key, channel: 'none', at: new Date() } } });
    if (claim.modifiedCount) {
      await patchSanity(orderId, (p) => p.append('statusHistory', [historyEntry('shipped', mapped.note)]));
      return { handled: true, status: 'shipped' };
    }
  }
  return { handled: false, reason: 'no_change' };
}
