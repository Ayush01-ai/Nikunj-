import { randomBytes, timingSafeEqual } from 'crypto';
import { Order, type IOrder } from '@/backend/models/Order';
import { connectDB } from '@/backend/lib/mongodb';
import { deliveryOtp } from '@/backend/lib/otpHash';
import { getSanityOrder, sanityOrderId } from '@/backend/lib/sanityOrders';
import { isWhatsAppConfigured, sendWhatsAppOtp, sendDeliveryOtpWhatsApp } from '@/backend/lib/whatsapp';
import { historyEntry } from '@/cms/lib/orderOps';
import { writeClient } from '@/cms/lib/client';

/**
 * Doorstep delivery confirmation ("share the OTP with the delivery partner"):
 *
 *  1. The owner hands an order to the delivery partner from the Orders Dashboard. The server creates a
 *     secret link (/deliver/<token>) for the partner and WhatsApps a 6-digit code to the customer.
 *  2. At the door the customer tells the partner the code; the partner types it on the link.
 *  3. The server checks it and marks the order Delivered (and COD as collected) in Sanity + MongoDB —
 *     the customer gets the usual "delivered" WhatsApp from the order-status webhook.
 *
 * The code is derived from the token (never stored); a new link means a new code. A link locks after
 * MAX_ATTEMPTS wrong codes, and works only while the order is out for delivery.
 */
export const MAX_ATTEMPTS = 5;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
/** Order statuses in which a delivery can be handed over / confirmed. */
export const DELIVERABLE = new Set(['confirmed', 'processing', 'shipped']);

export const newDeliveryToken = () => randomBytes(24).toString('base64url');

export function deliveryLink(token: string, origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000') {
  return `${origin.replace(/\/$/, '')}/deliver/${token}`;
}

export function otpEquals(expected: string, input: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(String(input ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * WhatsApp the delivery code to the phone entered for this order (not the login phone, never email).
 * "accepted" only means the provider took the message; delivery is confirmed later by the provider webhook.
 * False when WhatsApp isn't set up / the send failed — the code then stays available on the owner's order page.
 */
export async function sendDeliveryCode(order: Pick<IOrder, 'orderId' | 'shippingAddress'> & { delivery?: IOrder['delivery'] }) {
  const token = order.delivery?.token;
  const phone = order.shippingAddress?.phone;
  if (!token || !phone) return false;
  if (!isWhatsAppConfigured()) {
    // No credentials (e.g. local dev): nothing is sent, the code is still on the owner's order page.
    await Order.updateOne({ orderId: order.orderId }, { $set: { 'delivery.otpStatus': 'skipped' } });
    return false;
  }
  const otp = deliveryOtp(order.orderId, token);
  let messageId: string | undefined;
  let sent = false;
  try {
    sent = (await sendDeliveryOtpWhatsApp(phone, otp, order.orderId, (id) => { messageId = id; })) || (await sendWhatsAppOtp(phone, otp));
  } catch (err) {
    console.error('[delivery] WhatsApp send threw', order.orderId, err instanceof Error ? err.message : err);
  }
  await Order.updateOne(
    { orderId: order.orderId },
    sent
      ? { $set: { 'delivery.otpSentAt': new Date(), 'delivery.otpStatus': 'accepted', ...(messageId ? { 'delivery.otpMessageId': messageId } : {}) } }
      : { $set: { 'delivery.otpStatus': 'failed' } },
  );
  return sent;
}

/** Order statuses in which the customer's doorstep code is live and shown. */
export const OUT_FOR_DELIVERY = new Set(['shipped', 'out_for_delivery']);

/**
 * Makes sure a shipped order has a delivery code, however it became "shipped" (Orders Dashboard hand-off,
 * a status change in Sanity Studio, or a webhook that never reached this server, e.g. in local dev).
 * The token is created atomically, so concurrent callers create — and WhatsApp — exactly one code. The code
 * itself is HMAC-derived from the token, never stored. WhatsApp failure never undoes the code.
 */
export async function ensureDeliveryCode(orderId: string): Promise<IOrder['delivery'] | undefined> {
  await connectDB();
  const now = new Date();
  const created = await Order.findOneAndUpdate(
    { orderId, 'delivery.token': { $exists: false }, 'delivery.verifiedAt': { $exists: false } },
    { $set: { 'delivery.token': newDeliveryToken(), 'delivery.assignedAt': now, 'delivery.attempts': 0 } },
    { new: true },
  );
  if (!created) {
    const existing = await Order.findOne({ orderId }).select('delivery').lean<Pick<IOrder, 'delivery'>>();
    return existing?.delivery;
  }

  if (process.env.SANITY_API_TOKEN) {
    await writeClient
      .patch(sanityOrderId(orderId))
      .setIfMissing({ delivery: {} })
      .set({ 'delivery.assignedAt': now.toISOString(), 'delivery.otpRequired': true, 'delivery.attempts': 0 })
      .commit()
      .catch((err: unknown) => console.error('[delivery] sanity sync failed', orderId, err instanceof Error ? err.message : err));
  }

  const sent = await sendDeliveryCode(created).catch(() => false);
  if (sent && process.env.SANITY_API_TOKEN) {
    await writeClient.patch(sanityOrderId(orderId)).set({ 'delivery.otpSentAt': new Date().toISOString() }).commit().catch(() => undefined);
  }
  const fresh = await Order.findOne({ orderId }).select('delivery').lean<Pick<IOrder, 'delivery'>>();
  return fresh?.delivery ?? created.delivery;
}

/** Delivery PINs stop working (and stop being shown) this long after the delivery was assigned. */
export const pinTtlMs = () => Math.max(1, Number(process.env.DELIVERY_PIN_TTL_HOURS) || 72) * 3_600_000;
export const pinExpired = (d?: { assignedAt?: Date }, now = Date.now()) =>
  Boolean(d?.assignedAt && now - new Date(d.assignedAt).getTime() > pinTtlMs());

export async function findOrderByDeliveryToken(token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  await connectDB();
  return Order.findOne({ 'delivery.token': token });
}

/**
 * Doorstep-code status for the customer (Track Order / My Account). The code itself is included only for
 * the signed-in owner — someone who merely knows the order ID and phone number gets it on WhatsApp only.
 */
export function deliveryView(order: Pick<IOrder, 'orderId' | 'delivery'>, status: string, showCode: boolean) {
  const d = order.delivery;
  if (!d?.token) return null;
  if (d.verifiedAt) return { otpRequired: true, verifiedAt: new Date(d.verifiedAt).toISOString() };
  if (!OUT_FOR_DELIVERY.has(status)) return null;
  const expired = pinExpired(d);
  return {
    otpRequired: true,
    otpSentAt: d.otpSentAt ? new Date(d.otpSentAt).toISOString() : null,
    otpStatus: d.otpStatus ?? null,
    ...(expired ? { expired: true } : {}),
    ...(showCode && !expired ? { code: deliveryOtp(order.orderId, d.token) } : {}),
  };
}

export type AssignResult =
  | { ok: true; link: string; otpSent: boolean; otp?: string; partnerName?: string }
  | { ok: false; status: number; message: string };

/** Create (or reuse) the delivery link for an order, mark it out for delivery, and send the customer their code. */
export async function assignDelivery(orderId: string, opts: { partnerName?: string; regenerate?: boolean } = {}): Promise<AssignResult> {
  await connectDB();
  const order = await Order.findOne({ orderId });
  if (!order) return { ok: false, status: 404, message: 'Order not found on the website.' };
  const managed = await getSanityOrder(orderId);
  const status = managed?.status ?? order.status;
  if (order.delivery?.verifiedAt || status === 'delivered') return { ok: false, status: 409, message: 'This order is already delivered.' };
  if (!DELIVERABLE.has(status)) return { ok: false, status: 409, message: `Orders that are "${status}" can't be sent for delivery.` };

  const now = new Date();
  const reuse = Boolean(order.delivery?.token) && !opts.regenerate && (order.delivery?.attempts ?? 0) < MAX_ATTEMPTS;
  if (!reuse) {
    order.set('delivery', {
      token: newDeliveryToken(),
      partnerName: opts.partnerName || order.delivery?.partnerName,
      assignedAt: now,
      attempts: 0,
    });
  } else if (opts.partnerName) {
    order.set('delivery.partnerName', opts.partnerName);
  }
  if (order.status !== 'delivered') order.status = 'shipped';
  await order.save();
  const token = order.delivery!.token!;

  if (process.env.SANITY_API_TOKEN && managed) {
    const partner = order.delivery?.partnerName;
    const outForDelivery = status !== 'shipped';
    const tx = writeClient
      .patch(sanityOrderId(orderId))
      .setIfMissing({ statusHistory: [], tracking: {}, delivery: {} })
      .set({
        'delivery.assignedAt': (reuse ? order.delivery?.assignedAt : now)?.toISOString(),
        'delivery.otpRequired': true,
        'delivery.attempts': order.delivery?.attempts ?? 0,
        ...(partner ? { 'delivery.partnerName': partner } : {}),
        ...(outForDelivery ? { status: 'shipped', 'tracking.handedOverAt': now.toISOString() } : {}),
        ...(partner && !managed.tracking?.courier ? { 'tracking.courier': partner } : {}),
      });
    if (outForDelivery || !reuse) {
      tx.append('statusHistory', [
        historyEntry('shipped', `${reuse ? 'Out for delivery' : 'Out for delivery — new delivery link'}${partner ? ` with ${partner}` : ''} · customer OTP required`),
      ]);
    }
    await tx.commit({ autoGenerateArrayKeys: true });
  }

  const otpSent = await sendDeliveryCode(order);
  if (otpSent && process.env.SANITY_API_TOKEN && managed) {
    await writeClient.patch(sanityOrderId(orderId)).set({ 'delivery.otpSentAt': new Date().toISOString() }).commit().catch(() => undefined);
  }
  return {
    ok: true,
    link: deliveryLink(token),
    otpSent,
    // Only when WhatsApp couldn't deliver it, so the owner can send it to the customer themselves.
    ...(otpSent ? {} : { otp: deliveryOtp(orderId, token) }),
    partnerName: order.delivery?.partnerName,
  };
}

/** "Resend code" from the partner's page — only while the link is live; never changes the order. */
export async function resendDeliveryCode(token: string): Promise<{ ok: boolean; status: number; message: string }> {
  const order = await findOrderByDeliveryToken(token);
  if (!order?.delivery?.token) return { ok: false, status: 404, message: 'This delivery link is not valid.' };
  if (order.delivery.verifiedAt) return { ok: false, status: 409, message: 'This order is already delivered.' };
  if ((order.delivery.attempts ?? 0) >= MAX_ATTEMPTS) return { ok: false, status: 423, message: 'This link is locked. Please call the shop.' };
  const last = order.delivery.otpSentAt?.getTime() ?? 0;
  if (Date.now() - last < 60_000) return { ok: false, status: 429, message: 'A code was sent less than a minute ago. Please ask the customer to check WhatsApp.' };
  const sent = await sendDeliveryCode(order);
  return sent
    ? { ok: true, status: 200, message: 'Code sent again to the customer on WhatsApp.' }
    : { ok: false, status: 503, message: 'Could not send the code. Please ask the shop to share it with the customer.' };
}

export type VerifyResult =
  | { ok: true; orderId: string; codCollected: number }
  | { ok: false; status: number; message: string; attemptsLeft?: number };

/** Partner submits the code the customer shared. Marks the order delivered on success. */
export async function verifyDelivery(token: string, otp: string): Promise<VerifyResult> {
  const order = await findOrderByDeliveryToken(token);
  if (!order?.delivery?.token) return { ok: false, status: 404, message: 'This delivery link is not valid. Please ask the shop for a new one.' };
  if (order.delivery.verifiedAt) return { ok: false, status: 409, message: 'This order is already marked delivered.' };
  if (pinExpired(order.delivery)) return { ok: false, status: 410, message: 'This delivery code has expired. Please ask the shop to send a new one.' };
  const attempts = order.delivery.attempts ?? 0;
  if (attempts >= MAX_ATTEMPTS) {
    return { ok: false, status: 423, message: 'Too many wrong codes. This link is locked — please call the shop to get a new one.', attemptsLeft: 0 };
  }
  const managed = await getSanityOrder(order.orderId);
  const status = managed?.status ?? order.status;
  if (!DELIVERABLE.has(status)) {
    return { ok: false, status: 409, message: status === 'cancelled' ? 'This order was cancelled — please do not deliver it. Contact the shop.' : 'This order can no longer be delivered with this link.' };
  }

  if (!/^\d{6}$/.test(otp) || !otpEquals(deliveryOtp(order.orderId, order.delivery.token), otp)) {
    // Atomic increment so parallel guesses can't exceed the limit.
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, 'delivery.token': token, 'delivery.attempts': { $lt: MAX_ATTEMPTS } },
      { $inc: { 'delivery.attempts': 1 } },
      { new: true },
    );
    const left = Math.max(0, MAX_ATTEMPTS - (updated?.delivery?.attempts ?? MAX_ATTEMPTS));
    if (process.env.SANITY_API_TOKEN && managed) {
      await writeClient.patch(sanityOrderId(order.orderId)).set({ 'delivery.attempts': MAX_ATTEMPTS - left }).commit().catch(() => undefined);
    }
    return {
      ok: false,
      status: left ? 400 : 423,
      message: left ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong codes. This link is now locked — please call the shop.',
      attemptsLeft: left,
    };
  }

  const now = new Date();
  // Claim the verification first, so a double-tap can't deliver twice.
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, 'delivery.token': token, 'delivery.verifiedAt': { $exists: false } },
    { $set: { 'delivery.verifiedAt': now, status: 'delivered', ...(order.paymentMethod === 'cod' ? { paymentStatus: 'paid' } : {}) } },
    { new: true },
  );
  if (!claimed) return { ok: false, status: 409, message: 'This order is already marked delivered.' };

  const cod = order.paymentMethod === 'cod' && (managed?.paymentStatus ?? order.paymentStatus) !== 'paid';
  if (process.env.SANITY_API_TOKEN && managed) {
    try {
      await writeClient
        .patch(sanityOrderId(order.orderId))
        .setIfMissing({ statusHistory: [], delivery: {} })
        .set({
          status: 'delivered',
          'delivery.verifiedAt': now.toISOString(),
          ...(cod ? { paymentStatus: 'paid' } : {}),
        })
        .append('statusHistory', [historyEntry('delivered', `Delivered — customer OTP verified${order.delivery.partnerName ? ` by ${order.delivery.partnerName}` : ''}${cod ? ` · COD ₹${order.total} collected` : ''}`)])
        .commit({ autoGenerateArrayKeys: true });
    } catch (error) {
      // Website record is updated; the owner can still mark it delivered in the Studio.
      console.error('[delivery] Sanity update failed', order.orderId, error instanceof Error ? error.message : error);
    }
  }
  return { ok: true, orderId: order.orderId, codCollected: cod ? order.total : 0 };
}
