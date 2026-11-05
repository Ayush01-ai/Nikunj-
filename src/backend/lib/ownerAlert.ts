import { Order } from '@/backend/models/Order';
import { connectDB } from '@/backend/lib/mongodb';
import { isEmailConfigured, sendEmail } from '@/backend/lib/email';
import { sendOwnerWhatsApp } from '@/backend/lib/whatsapp';
import { writeClient } from '@/cms/lib/client';

export interface OwnerAlertInput {
  orderNumber: string;
  reason: string;
  stage: string;
  customerName?: string;
  phone?: string;
  total?: number;
}

export type OwnerAlertResult = 'sent' | 'duplicate' | 'not_configured' | 'failed';

const DEFAULT_OWNER_EMAIL = 'Nikunj.sakhi14@gmail.com';

const normalizeReason = (reason: string) => reason.toLowerCase().replace(/\s+/g, ' ').trim();

/** Small stable non-cryptographic hash (FNV-1a); only used to keep dedupe keys short. */
export function shortHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const alertDedupeKey = (stage: string, reason: string) => `alert:${stage}:${shortHash(normalizeReason(reason))}`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function ownerPhone(): Promise<string | undefined> {
  const fromEnv = process.env.OWNER_ALERT_PHONE?.trim();
  if (fromEnv) return fromEnv;
  if (!process.env.SANITY_API_TOKEN) return undefined;
  try {
    const s = await writeClient.fetch<{ ownerWhatsApp?: string; adminPhones?: string[] } | null>(
      `*[_id == "settings.admin"][0]{ownerWhatsApp, adminPhones}`,
    );
    return s?.ownerWhatsApp?.trim() || s?.adminPhones?.find((p) => p?.trim())?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function buildText(a: OwnerAlertInput): string {
  const lines = [
    `Nikunj Sakhi - order needs attention`,
    `Order: ${a.orderNumber}`,
    `Stage: ${a.stage}`,
    `Issue: ${a.reason}`,
  ];
  if (a.customerName) lines.push(`Customer: ${a.customerName}`);
  if (a.phone) lines.push(`Phone: ${a.phone}`);
  if (typeof a.total === 'number') lines.push(`Total: Rs ${a.total}`);
  return lines.join('\n');
}

/**
 * Tells the owner (email + WhatsApp, whichever are configured) that an order needs manual action.
 * Deduplicated per order/stage/reason with the same atomic notificationLog claim as notifyOrder, so webhook
 * retries never spam. Never throws, so it is safe to call from checkout and webhook paths.
 */
export async function alertOwnerOrderIssue(input: OwnerAlertInput): Promise<OwnerAlertResult> {
  const key = alertDedupeKey(input.stage, input.reason);
  let claimed = false;
  try {
    try {
      await connectDB();
      const claim = await Order.updateOne(
        { orderId: input.orderNumber, 'notificationLog.key': { $ne: key } },
        { $push: { notificationLog: { key, channel: 'owner', at: new Date() } } },
      );
      if (claim.modifiedCount) claimed = true;
      else if (await Order.exists({ orderId: input.orderNumber })) return 'duplicate';
    } catch (e) {
      console.error('[owner-alert] dedupe unavailable', input.orderNumber, e instanceof Error ? e.message : e);
    }

    const release = async () => {
      if (claimed) await Order.updateOne({ orderId: input.orderNumber }, { $pull: { notificationLog: { key } } }).catch(() => undefined);
    };

    const text = buildText(input);
    const emailTo = process.env.OWNER_ALERT_EMAIL?.trim() || DEFAULT_OWNER_EMAIL;
    const emailOn = isEmailConfigured();
    const phone = await ownerPhone();
    if (!emailOn && !phone) {
      await release();
      return 'not_configured';
    }

    const attempts: Promise<boolean>[] = [];
    if (emailOn) {
      const html = `<div style="font-family:Arial,sans-serif;max-width:520px"><h3>Order needs attention</h3><p>${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>`;
      attempts.push(sendEmail(emailTo, `Action needed - ${input.orderNumber} (${input.stage})`, html).catch(() => false));
    }
    if (phone) attempts.push(sendOwnerWhatsApp(phone, text).catch(() => false));

    const results = await Promise.all(attempts);
    if (results.some(Boolean)) return 'sent';
    await release();
    return 'failed';
  } catch (e) {
    console.error('[owner-alert]', input.orderNumber, e instanceof Error ? e.message : e);
    return 'failed';
  }
}

/** Fire-and-forget wrapper: resolves immediately-safe, never rejects. */
export function alertOwnerSafely(input: OwnerAlertInput): Promise<OwnerAlertResult> {
  return alertOwnerOrderIssue(input).catch(() => 'failed' as const);
}
