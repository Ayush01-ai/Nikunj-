import type { AnalyticsEvent } from '@/cms/lib/analytics';

const CONSENT_KEY = 'ns-cookie-consent';
const VISIT_KEY = 'ns-visit-day';
const SESSION_KEY = 'ns-session';

type Extra = {
  path?: string;
  productId?: string;
  productName?: string;
  phone?: string;
  name?: string;
  cartValue?: number;
  cartItems?: string;
};

/** IST calendar day, matching the server's day buckets. */
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Sends one footfall event to /api/analytics/track. No cookies or visitor IDs are stored — only the
 * last visit date (to count unique visitors per day) — and nothing is sent if the shopper chose
 * "Essential only" in the cookie banner.
 */
export function track(event: AnalyticsEvent, extra: Extra = {}): void {
  if (typeof window === 'undefined') return;
  const local = safeStorage('local');
  const session = safeStorage('session');
  if (local?.getItem(CONSENT_KEY) === 'denied') return;

  const day = today();
  const lastDay = local?.getItem(VISIT_KEY);
  const newDay = lastDay !== day;
  const newVisitor = lastDay == null;
  const newSession = !session?.getItem(SESSION_KEY);
  local?.setItem(VISIT_KEY, day);
  session?.setItem(SESSION_KEY, '1');

  const payload: Record<string, unknown> = { event, ...extra, newDay, newVisitor, newSession };
  if (newSession) {
    payload.referrer = document.referrer || undefined;
    payload.utmSource = new URLSearchParams(window.location.search).get('utm_source') || undefined;
  }

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.('/api/analytics/track', new Blob([body], { type: 'text/plain' }))) return;
  } catch {
    // fall through to fetch
  }
  void fetch('/api/analytics/track', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
}

/** Fires an event at most once per browser session for the given key (e.g. one checkout start). */
export function trackOnce(key: string, event: AnalyticsEvent, extra: Extra = {}): void {
  const session = safeStorage('session');
  const flag = `ns-tracked:${key}`;
  if (session?.getItem(flag)) return;
  session?.setItem(flag, '1');
  track(event, extra);
}
