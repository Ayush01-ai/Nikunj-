import { Order, type IOrder } from '@/backend/models/Order';
import { User } from '@/backend/models/User';
import { connectDB } from '@/backend/lib/mongodb';
import { sanitizePhone, type LoginMethod } from '@/backend/lib/auth';
import { isEmailConfigured, orderConfirmationEmail, orderStatusEmail, sendEmail, type OrderEmailInput } from '@/backend/lib/email';
import { sendOrderWhatsApp } from '@/backend/lib/whatsapp';
import { ORDER_STATUS_LABEL, orderStatusMessage, trackOrderUrl, type OrderMessageInput } from '@/cms/lib/orderMessages';

/**
 * Order notifications (confirmation + status updates) follow the verified login method used when the order
 * was placed. This is separate from the delivery OTP, which always goes to the order's delivery phone
 * (see delivery.ts).
 *
 *   Google / email+password session -> Resend email to the account's VERIFIED email
 *   WhatsApp OTP session            -> WhatsApp to the account's VERIFIED phone
 *   Guest checkout                  -> WhatsApp to the phone entered on the order (guest policy)
 *
 * The destination is resolved once, from trusted server-side session + account data, and snapshotted on the
 * order so later account edits never redirect messages for an existing order.
 */
export type NotificationChannel = 'email' | 'whatsapp' | 'none';

export interface NotificationSnapshot {
  channel: NotificationChannel;
  method: LoginMethod | 'guest' | 'unknown';
  email?: string;
  phone?: string;
  /** Why no channel was chosen (never contains contact details). */
  reason?: 'email_unverified' | 'phone_unverified' | 'method_unknown' | 'no_contact';
  capturedAt: Date;
}

type AccountContact = {
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  authProviders?: string[];
};

const hasVerifiedEmail = (u: AccountContact) => Boolean(u.email && u.emailVerified);
// A phone is verified only if the account proved it with an OTP (WhatsApp, or the retired SMS flow).
const hasVerifiedPhone = (u: AccountContact) =>
  Boolean(u.phone && (u.authProviders ?? []).some((p) => p === 'whatsapp' || p === 'phone'));

const emailSnapshot = (u: AccountContact, method: NotificationSnapshot['method'], now: Date): NotificationSnapshot =>
  hasVerifiedEmail(u)
    ? { channel: 'email', method, email: u.email!.toLowerCase(), capturedAt: now }
    : { channel: 'none', method, reason: 'email_unverified', capturedAt: now };

const whatsappSnapshot = (u: AccountContact, method: NotificationSnapshot['method'], now: Date): NotificationSnapshot =>
  hasVerifiedPhone(u)
    ? { channel: 'whatsapp', method, phone: sanitizePhone(u.phone!), capturedAt: now }
    : { channel: 'none', method, reason: 'phone_unverified', capturedAt: now };

/**
 * Pure policy. `method` must come from the server-verified session, never from the request body. If the
 * method could not be established we do not guess between channels: only when the account has exactly one
 * verified contact is that contact used.
 */
export function buildNotificationSnapshot(
  account: AccountContact | null,
  method: LoginMethod | undefined,
  guestPhone: string | undefined,
  now = new Date(),
): NotificationSnapshot {
  if (!account) {
    const phone = guestPhone ? sanitizePhone(guestPhone) : '';
    return phone
      ? { channel: 'whatsapp', method: 'guest', phone, capturedAt: now }
      : { channel: 'none', method: 'guest', reason: 'no_contact', capturedAt: now };
  }
  if (method === 'google' || method === 'email') return emailSnapshot(account, method, now);
  if (method === 'whatsapp') return whatsappSnapshot(account, method, now);

  const email = hasVerifiedEmail(account);
  const phone = hasVerifiedPhone(account);
  if (email && !phone) return emailSnapshot(account, 'unknown', now);
  if (phone && !email) return whatsappSnapshot(account, 'unknown', now);
  return { channel: 'none', method: 'unknown', reason: email && phone ? 'method_unknown' : 'no_contact', capturedAt: now };
}

/** Loads the account by id and applies the policy. Failures degrade to "no channel", never to a guess. */
export async function snapshotForOrder(
  userId: string | undefined,
  method: LoginMethod | undefined,
  guestPhone: string | undefined,
): Promise<NotificationSnapshot> {
  if (!userId) return buildNotificationSnapshot(null, undefined, guestPhone);
  try {
    await connectDB();
    const user = await User.findById(userId).select('email emailVerified phone authProviders').lean<AccountContact>();
    if (!user) return { channel: 'none', method: method ?? 'unknown', reason: 'no_contact', capturedAt: new Date() };
    return buildNotificationSnapshot(user, method, undefined);
  } catch {
    return { channel: 'none', method: method ?? 'unknown', reason: 'no_contact', capturedAt: new Date() };
  }
}

export interface OrderEvent extends OrderMessageInput {
  /** Order id (e.g. NS-AB12CD34). */
  orderNumber?: string;
  status?: string;
  /** Present for the order-confirmation email, which carries the full summary. */
  confirmation?: OrderEmailInput;
}

export type NotifyResult =
  | { sent: true; channel: 'email' | 'whatsapp' }
  | { sent: false; reason: 'order_not_found' | 'no_channel' | 'duplicate' | 'not_configured' | 'send_failed' };

const origin = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * Sends one notification for `key` (normally the order status) to the destination snapshotted on the order.
 * Idempotent: the key is claimed atomically before sending, so webhook retries / double calls send once; if
 * the provider fails the claim is released so a later retry can still deliver.
 */
export async function notifyOrder(orderId: string, event: OrderEvent, key = event.status ?? 'update'): Promise<NotifyResult> {
  await connectDB();
  const order = await Order.findOne({ orderId }).select('userId guestPhone shippingAddress notification').lean<Pick<IOrder, 'userId' | 'guestPhone' | 'shippingAddress' | 'notification'>>();
  if (!order) return { sent: false, reason: 'order_not_found' };

  // Orders placed before snapshots existed: guests keep the old behaviour (WhatsApp to the order phone);
  // registered orders are not guessed at.
  const snap: Pick<NotificationSnapshot, 'channel' | 'email' | 'phone'> =
    order.notification ??
    (order.userId ? { channel: 'none' } : { channel: 'whatsapp', phone: order.shippingAddress?.phone });
  if (snap.channel === 'none') return { sent: false, reason: 'no_channel' };
  if (snap.channel === 'email' && !isEmailConfigured()) return { sent: false, reason: 'not_configured' };

  const claim = await Order.updateOne(
    { orderId, 'notificationLog.key': { $ne: key } },
    { $push: { notificationLog: { key, channel: snap.channel, at: new Date() } } },
  );
  if (!claim.modifiedCount) return { sent: false, reason: 'duplicate' };

  let ok = false;
  try {
    if (snap.channel === 'whatsapp') {
      ok = await sendOrderWhatsApp({ ...event, orderNumber: event.orderNumber ?? orderId, phone: snap.phone });
    } else if (snap.email) {
      const url = trackOrderUrl(origin(), orderId);
      const email = event.confirmation
        ? { subject: `Order confirmed – ${orderId} | Nikunj Sakhi`, html: orderConfirmationEmail({ ...event.confirmation, trackUrl: url }) }
        : {
            subject: `${ORDER_STATUS_LABEL[event.status ?? ''] ?? 'Order update'} – ${orderId} | Nikunj Sakhi`,
            html: orderStatusEmail(event.customerName, orderStatusMessage({ ...event, orderNumber: orderId }, origin()), url),
          };
      ok = await sendEmail(snap.email, email.subject, email.html);
    }
  } catch {
    ok = false;
  }
  if (!ok) {
    await Order.updateOne({ orderId }, { $pull: { notificationLog: { key } } }).catch(() => undefined);
    return { sent: false, reason: 'send_failed' };
  }
  return { sent: true, channel: snap.channel };
}
