import { NextRequest, NextResponse } from 'next/server';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { analyticsEnabled, recordDayUpdate, recordLead } from '@/backend/lib/analytics';
import { dayUpdateFor, istDay, isBot, parseTrackPayload } from '@/cms/lib/analytics';

export const runtime = 'nodejs';

const isRateLimited = createRateLimiter(120, 60 * 1000, 'api/analytics/track:isRateLimited');
const isLeadRateLimited = createRateLimiter(10, 60 * 1000, 'api/analytics/track:isLeadRateLimited');
const MAX_BODY = 4096;

const done = () => new NextResponse(null, { status: 204 });

/** Receives footfall events from the site's tracker (sendBeacon/fetch). Always answers 204 so it never affects the page. */
export async function POST(req: NextRequest) {
  const userAgent = req.headers.get('user-agent') ?? '';
  if (!analyticsEnabled() || isBot(userAgent)) return done();

  // Only count events sent by our own pages.
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  if (origin) {
    try {
      if (new URL(origin).host !== host) return done();
    } catch {
      return done();
    }
  }

  const ip = clientIp(req);
  if (await isRateLimited(`analytics:${ip}`)) return done();

  const raw = await req.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY) return done();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return done();
  }
  const payload = parseTrackPayload(body);
  if (!payload) return done();

  try {
    const tasks: Promise<void>[] = [recordDayUpdate(istDay(), dayUpdateFor(payload, { userAgent, ownHost: host.split(':')[0] }))];
    if (payload.event === 'phone_entered' && payload.phone && !(await isLeadRateLimited(`lead:${ip}`))) {
      tasks.push(recordLead({ phone: payload.phone, name: payload.name, cartValue: payload.cartValue, cartItems: payload.cartItems }));
    }
    const results = await Promise.allSettled(tasks);
    for (const r of results) if (r.status === 'rejected') console.error('[analytics/track]', r.reason instanceof Error ? r.reason.message : r.reason);
  } catch (error) {
    console.error('[analytics/track]', error instanceof Error ? error.message : error);
  }
  return done();
}
