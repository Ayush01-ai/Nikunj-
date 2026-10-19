import { createHash } from 'crypto';
import { writeClient } from '@/cms/lib/client';
import {
  ANALYTICS_DAY_TYPE,
  BREAKDOWNS,
  COUNTERS,
  LEAD_TYPE,
  analyticsDayId,
  istDay,
  type DayUpdate,
} from '@/cms/lib/analytics';

const hasToken = () => Boolean(process.env.SANITY_API_TOKEN);

/** Local dev traffic would pollute the shop's numbers, so it is only recorded when opted in. */
export const analyticsEnabled = () =>
  hasToken() && (process.env.NODE_ENV === 'production' || process.env.ANALYTICS_IN_DEV === '1');

export const leadId = (phone: string) => `leads.${createHash('sha256').update(`lead:${phone}`).digest('hex').slice(0, 24)}`;

/** Atomically increments one day's counters/breakdowns, creating the day doc on first use. */
export async function recordDayUpdate(day: string, update: DayUpdate): Promise<void> {
  const counters = Object.entries(update.inc).filter(([, v]) => typeof v === 'number' && v !== 0) as [string, number][];
  if (!counters.length && !update.bumps.length) return;
  const id = analyticsDayId(day);
  const tx = writeClient.transaction().createIfNotExists({ _id: id, _type: ANALYTICS_DAY_TYPE, date: day });
  tx.patch(id, (p) =>
    p.setIfMissing({
      labels: {},
      ...Object.fromEntries(BREAKDOWNS.map((b) => [b, {}])),
      ...Object.fromEntries(COUNTERS.map((c) => [c, 0])),
    }),
  );
  const inc: Record<string, number> = Object.fromEntries(counters);
  if (update.bumps.length) {
    const missing: Record<string, number> = {};
    const labels: Record<string, string> = {};
    for (const b of update.bumps) {
      missing[`${b.breakdown}.${b.key}`] = 0;
      labels[`labels.${b.key}`] = b.label;
      inc[`${b.breakdown}.${b.key}`] = (inc[`${b.breakdown}.${b.key}`] ?? 0) + 1;
    }
    tx.patch(id, (p) => p.setIfMissing(missing).set(labels));
  }
  tx.patch(id, (p) => p.inc(inc));
  await tx.commit({ visibility: 'async' });
}

/** Remembers a checkout phone number so unfinished checkouts can be followed up from the Studio. */
export async function recordLead(lead: { phone: string; name?: string; cartValue?: number; cartItems?: string }): Promise<void> {
  const id = leadId(lead.phone);
  const now = new Date().toISOString();
  await writeClient
    .transaction()
    .createIfNotExists({ _id: id, _type: LEAD_TYPE, phone: lead.phone, firstSeenAt: now })
    .patch(id, (p) =>
      p.set({
        lastSeenAt: now,
        converted: false,
        ...(lead.name ? { name: lead.name } : {}),
        ...(lead.cartValue !== undefined ? { cartValue: lead.cartValue } : {}),
        ...(lead.cartItems ? { cartItems: lead.cartItems } : {}),
      }),
    )
    .commit({ visibility: 'async' });
}

/** Counts a confirmed order in the day's totals and marks its phone number's lead as converted. */
export async function recordOrderPlaced(order: { orderId: string; total: number; phone?: string; name?: string; placedAt?: Date }): Promise<void> {
  if (!analyticsEnabled()) return;
  try {
    const day = istDay(order.placedAt ?? new Date());
    const tasks: Promise<unknown>[] = [recordDayUpdate(day, { inc: { ordersPlaced: 1, orderValue: Math.round(order.total) }, bumps: [] })];
    const phone = order.phone?.replace(/\D/g, '').slice(-10);
    if (phone && phone.length === 10) {
      const id = leadId(phone);
      const now = new Date().toISOString();
      tasks.push(
        writeClient
          .transaction()
          .createIfNotExists({ _id: id, _type: LEAD_TYPE, phone, firstSeenAt: now, lastSeenAt: now, ...(order.name ? { name: order.name } : {}) })
          .patch(id, (p) => p.set({ converted: true, orderId: order.orderId, convertedAt: now }))
          .commit({ visibility: 'async' }),
      );
    }
    const results = await Promise.allSettled(tasks);
    for (const r of results) if (r.status === 'rejected') console.error('[analytics] order', order.orderId, r.reason);
  } catch (error) {
    console.error('[analytics] order', order.orderId, error instanceof Error ? error.message : error);
  }
}
