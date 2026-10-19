/**
 * Footfall analytics shared by the website tracker, the /api/analytics/track route and the
 * Studio "Analytics" tool. Data is stored as one private Sanity doc per day (`analytics.YYYY-MM-DD`)
 * holding counters, plus one private doc per checkout phone number (`leads.<hash>`).
 */

export const ANALYTICS_DAY_TYPE = 'analyticsDay';
export const LEAD_TYPE = 'lead';

export const ANALYTICS_EVENTS = ['page_view', 'product_view', 'add_to_cart', 'checkout_started', 'phone_entered'] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** Counter fields on an analytics day doc. */
export const COUNTERS = [
  'pageViews',
  'visitors',
  'newVisitors',
  'sessions',
  'productViews',
  'addToCart',
  'checkoutStarted',
  'phoneEntered',
  'ordersPlaced',
  'orderValue',
] as const;
export type Counter = (typeof COUNTERS)[number];

/** Breakdown maps on an analytics day doc: `{ [key]: count }`, with readable labels in `labels`. */
export const BREAKDOWNS = ['pages', 'products', 'sources', 'devices'] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];

export interface AnalyticsDay {
  _id: string;
  date: string;
  labels?: Record<string, string>;
  pages?: Record<string, number>;
  products?: Record<string, number>;
  sources?: Record<string, number>;
  devices?: Record<string, number>;
  [counter: string]: unknown;
}

export interface LeadDoc {
  _id: string;
  phone: string;
  name?: string;
  cartValue?: number;
  cartItems?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  converted?: boolean;
  orderId?: string;
  convertedAt?: string;
}

/** Calendar day in India (the shop's timezone), e.g. "2025-01-31". */
export function istDay(at: Date | number = Date.now()): string {
  const ms = typeof at === 'number' ? at : at.getTime();
  return new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
}

export const analyticsDayId = (day: string) => `analytics.${day}`;

/** Sanity object keys must be identifiers, so free text becomes `k_<safe>`. */
export function breakdownKey(value: string): string {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `k_${safe || 'none'}`;
}

/** Path without query/hash/trailing slash; ids and order numbers are collapsed so pages group. */
export function normalizePath(raw: string): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  let path = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path.length > 120) path = path.slice(0, 120);
  if (/^\/(studio|api|_next)(\/|$)/.test(path)) return null;
  path = path.replace(/\bNS-[A-Z0-9]{6,}\b/gi, ':order');
  return path;
}

/** Where a session came from: utm_source, else the referrer's site, else "direct". */
export function classifySource(referrer: string | undefined, utmSource: string | undefined, ownHost?: string): string {
  const utm = (utmSource ?? '').trim().toLowerCase().slice(0, 40);
  if (utm) return utm;
  if (!referrer) return 'direct';
  let host: string;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'direct';
  }
  if (!host || (ownHost && host === ownHost.replace(/^www\./, '').toLowerCase())) return 'direct';
  if (/(^|\.)google\./.test(host)) return 'google';
  if (/instagram\.com$/.test(host)) return 'instagram';
  if (/(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'facebook';
  if (/(whatsapp\.com|wa\.me)$/.test(host)) return 'whatsapp';
  if (/(youtube\.com|youtu\.be)$/.test(host)) return 'youtube';
  if (/bing\.com$/.test(host)) return 'bing';
  return host.slice(0, 40);
}

export function classifyDevice(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android/.test(ua)) return 'mobile';
  return 'desktop';
}

export const isBot = (userAgent: string) =>
  !userAgent || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor/i.test(userAgent);

export const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export interface TrackPayload {
  event: AnalyticsEvent;
  path?: string;
  /** First event of this visitor today / ever / this browser session (set by the tracker). */
  newDay?: boolean;
  newVisitor?: boolean;
  newSession?: boolean;
  referrer?: string;
  utmSource?: string;
  productId?: string;
  productName?: string;
  phone?: string;
  name?: string;
  cartValue?: number;
  cartItems?: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

/** Validates an untrusted request body; returns null when it isn't a known event. */
export function parseTrackPayload(body: unknown): TrackPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!ANALYTICS_EVENTS.includes(b.event as AnalyticsEvent)) return null;
  const phone = str(b.phone, 20)?.replace(/\D/g, '').slice(-10);
  const cartValue = typeof b.cartValue === 'number' && Number.isFinite(b.cartValue) ? Math.max(0, Math.min(10_000_000, Math.round(b.cartValue))) : undefined;
  return {
    event: b.event as AnalyticsEvent,
    path: str(b.path, 300),
    newDay: b.newDay === true,
    newVisitor: b.newVisitor === true,
    newSession: b.newSession === true,
    referrer: str(b.referrer, 300),
    utmSource: str(b.utmSource, 60),
    productId: str(b.productId, 80),
    productName: str(b.productName, 120),
    phone: phone && INDIAN_MOBILE.test(phone) ? phone : undefined,
    name: str(b.name, 80),
    cartValue,
    cartItems: str(b.cartItems, 300),
  };
}

export interface DayUpdate {
  inc: Partial<Record<Counter, number>>;
  /** breakdown → key → label */
  bumps: { breakdown: Breakdown; key: string; label: string }[];
}

/** Turns one tracked event into the counters/breakdowns it should increment. */
export function dayUpdateFor(p: TrackPayload, ctx: { userAgent: string; ownHost?: string }): DayUpdate {
  const inc: DayUpdate['inc'] = {};
  const bumps: DayUpdate['bumps'] = [];
  if (p.newDay) {
    inc.visitors = 1;
    const device = classifyDevice(ctx.userAgent);
    bumps.push({ breakdown: 'devices', key: breakdownKey(device), label: device });
  }
  if (p.newVisitor) inc.newVisitors = 1;
  if (p.newSession) {
    inc.sessions = 1;
    const source = classifySource(p.referrer, p.utmSource, ctx.ownHost);
    bumps.push({ breakdown: 'sources', key: breakdownKey(source), label: source });
  }
  switch (p.event) {
    case 'page_view': {
      const path = p.path ? normalizePath(p.path) : null;
      if (path) {
        inc.pageViews = 1;
        bumps.push({ breakdown: 'pages', key: breakdownKey(path), label: path });
      }
      break;
    }
    case 'product_view':
      inc.productViews = 1;
      if (p.productId) bumps.push({ breakdown: 'products', key: breakdownKey(p.productId), label: p.productName || p.productId });
      break;
    case 'add_to_cart':
      inc.addToCart = 1;
      break;
    case 'checkout_started':
      inc.checkoutStarted = 1;
      break;
    case 'phone_entered':
      if (p.phone) inc.phoneEntered = 1;
      break;
  }
  return { inc, bumps };
}

/** Sums day docs into totals plus merged breakdowns (sorted, biggest first). */
export function summariseDays(days: AnalyticsDay[]) {
  const totals = Object.fromEntries(COUNTERS.map((c) => [c, 0])) as Record<Counter, number>;
  const merged = Object.fromEntries(BREAKDOWNS.map((b) => [b, new Map<string, { label: string; count: number }>()])) as Record<
    Breakdown,
    Map<string, { label: string; count: number }>
  >;
  for (const d of days) {
    for (const c of COUNTERS) totals[c] += typeof d[c] === 'number' ? (d[c] as number) : 0;
    for (const b of BREAKDOWNS) {
      for (const [key, count] of Object.entries(d[b] ?? {})) {
        if (typeof count !== 'number') continue;
        const row = merged[b].get(key) ?? { label: d.labels?.[key] ?? key.replace(/^k_/, ''), count: 0 };
        row.count += count;
        merged[b].set(key, row);
      }
    }
  }
  const lists = Object.fromEntries(
    BREAKDOWNS.map((b) => [b, [...merged[b].values()].sort((x, y) => y.count - x.count)]),
  ) as Record<Breakdown, { label: string; count: number }[]>;
  return { totals, ...lists };
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
