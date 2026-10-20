import { describe, expect, it } from 'vitest';
import {
  breakdownKey,
  classifyDevice,
  classifySource,
  dayUpdateFor,
  istDay,
  isBot,
  normalizePath,
  parseTrackPayload,
  summariseDays,
} from '@/cms/lib/analytics';
import { pickDiverse, seedFrom } from '@/cms/lib/suggestions';

const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';

describe('analytics helpers', () => {
  it('buckets days in India time', () => {
    expect(istDay(new Date('2025-01-31T19:00:00Z'))).toBe('2025-02-01');
    expect(istDay(new Date('2025-01-31T18:00:00Z'))).toBe('2025-01-31');
  });

  it('normalises paths and ignores admin/api pages', () => {
    expect(normalizePath('/products/mukut?x=1#top')).toBe('/products/mukut');
    expect(normalizePath('/collections/')).toBe('/collections');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/track-order/NS-AB12CD34')).toBe('/track-order/:order');
    expect(normalizePath('/studio/orders')).toBeNull();
    expect(normalizePath('/api/x')).toBeNull();
    expect(normalizePath('https://evil.test/')).toBeNull();
  });

  it('makes Sanity-safe breakdown keys', () => {
    expect(breakdownKey('/products/radha-mukut')).toBe('k_products_radha_mukut');
    expect(breakdownKey('/')).toBe('k_none');
    expect(breakdownKey('a'.repeat(200)).length).toBeLessThanOrEqual(62);
  });

  it('classifies traffic sources and devices', () => {
    expect(classifySource(undefined, undefined)).toBe('direct');
    expect(classifySource('https://www.google.co.in/', undefined)).toBe('google');
    expect(classifySource('https://l.instagram.com/', undefined)).toBe('instagram');
    expect(classifySource('https://nikunjsakhi.com/x', undefined, 'nikunjsakhi.com')).toBe('direct');
    expect(classifySource('https://google.com', 'WhatsApp_Campaign')).toBe('whatsapp_campaign');
    expect(classifyDevice(PHONE_UA)).toBe('mobile');
    expect(classifyDevice('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet');
    expect(classifyDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
    expect(isBot('Googlebot/2.1')).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot(PHONE_UA)).toBe(false);
  });

  it('validates untrusted payloads', () => {
    expect(parseTrackPayload(null)).toBeNull();
    expect(parseTrackPayload({ event: 'hack' })).toBeNull();
    const p = parseTrackPayload({ event: 'phone_entered', phone: '+91 98765-43210', cartValue: 1499.4, name: 'x'.repeat(500) });
    expect(p?.phone).toBe('9876543210');
    expect(p?.cartValue).toBe(1499);
    expect(p?.name).toHaveLength(80);
    expect(parseTrackPayload({ event: 'phone_entered', phone: '12345' })?.phone).toBeUndefined();
  });

  it('turns events into counters', () => {
    const first = dayUpdateFor(
      { event: 'page_view', path: '/collections', newDay: true, newVisitor: true, newSession: true, referrer: 'https://www.instagram.com/' },
      { userAgent: PHONE_UA },
    );
    expect(first.inc).toEqual({ visitors: 1, newVisitors: 1, sessions: 1, pageViews: 1 });
    expect(first.bumps.map((b) => `${b.breakdown}:${b.label}`)).toEqual(['devices:mobile', 'sources:instagram', 'pages:/collections']);

    expect(dayUpdateFor({ event: 'product_view', productId: 'p1', productName: 'Mukut' }, { userAgent: PHONE_UA })).toEqual({
      inc: { productViews: 1 },
      bumps: [{ breakdown: 'products', key: 'k_p1', label: 'Mukut' }],
    });
    expect(dayUpdateFor({ event: 'phone_entered' }, { userAgent: PHONE_UA }).inc).toEqual({});
    expect(dayUpdateFor({ event: 'phone_entered', phone: '9876543210' }, { userAgent: PHONE_UA }).inc).toEqual({ phoneEntered: 1 });
  });

  it('sums day docs into totals and sorted breakdowns', () => {
    const s = summariseDays([
      { _id: 'a', date: '2025-01-01', visitors: 3, ordersPlaced: 1, orderValue: 500, pages: { k_home: 4, k_shop: 1 }, labels: { k_home: '/', k_shop: '/collections' } },
      { _id: 'b', date: '2025-01-02', visitors: 2, pages: { k_shop: 6 }, labels: { k_shop: '/collections' } },
    ]);
    expect(s.totals.visitors).toBe(5);
    expect(s.totals.orderValue).toBe(500);
    expect(s.totals.addToCart).toBe(0);
    expect(s.pages).toEqual([
      { label: '/collections', count: 7 },
      { label: '/', count: 4 },
    ]);
  });
});

describe('product suggestions', () => {
  const p = (id: string, category: string) => ({ _id: id, category });
  const pool = [p('a1', 'A'), p('a2', 'A'), p('a3', 'A'), p('b1', 'B'), p('b2', 'B'), p('c1', 'C')];

  it('spreads picks across categories and excludes given ids', () => {
    const picked = pickDiverse(pool, 3, 0, ['b1']);
    expect(new Set(picked.map((x) => x.category)).size).toBe(3);
    expect(picked.map((x) => x._id)).not.toContain('b1');
  });

  it('is deterministic per seed, de-duplicates and never over-fills', () => {
    const seed = seedFrom('radha-mukut');
    expect(pickDiverse(pool, 4, seed)).toEqual(pickDiverse(pool, 4, seed));
    expect(pickDiverse([...pool, ...pool], 10, seed)).toHaveLength(6);
    expect(pickDiverse([], 4, seed)).toEqual([]);
  });
});
