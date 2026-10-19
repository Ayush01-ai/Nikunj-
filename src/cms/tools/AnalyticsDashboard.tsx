import { useEffect, useMemo, useState } from 'react';
import { useClient } from 'sanity';
import { Badge, Box, Button, Card, Flex, Grid, Heading, Spinner, Stack, Text } from '@sanity/ui';
import {
  ANALYTICS_DAY_TYPE,
  LEAD_TYPE,
  istDay,
  pct,
  summariseDays,
  type AnalyticsDay,
  type Counter,
  type LeadDoc,
} from '../lib/analytics';

const RANGES = [
  { id: 'today', label: 'Today', days: 1 },
  { id: 'yesterday', label: 'Yesterday', days: 1, offset: 1 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const DAY_MS = 86_400_000;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const num = (n: number) => n.toLocaleString('en-IN');

/** [from, to] IST day strings for a range, plus the equally long period before it. */
function bounds(range: RangeId) {
  const r = RANGES.find((x) => x.id === range)!;
  const offset = 'offset' in r ? r.offset : 0;
  const now = Date.now();
  const to = istDay(now - offset * DAY_MS);
  const from = istDay(now - (offset + r.days - 1) * DAY_MS);
  const prevTo = istDay(now - (offset + r.days) * DAY_MS);
  const prevFrom = istDay(now - (offset + 2 * r.days - 1) * DAY_MS);
  return { from, to, prevFrom, prevTo, days: r.days };
}

const KPIS: { key: Counter | 'conversion'; label: string; hint: string; money?: boolean }[] = [
  { key: 'visitors', label: 'Visitors', hint: 'Unique visitors per day, added up' },
  { key: 'newVisitors', label: 'New visitors', hint: 'First visit ever' },
  { key: 'sessions', label: 'Visits (sessions)', hint: 'Browser sessions started' },
  { key: 'pageViews', label: 'Page views', hint: 'Pages opened' },
  { key: 'productViews', label: 'Product views', hint: 'Product pages opened' },
  { key: 'addToCart', label: 'Added to cart', hint: 'Add-to-cart clicks' },
  { key: 'checkoutStarted', label: 'Checkouts started', hint: 'Continued from cart to address' },
  { key: 'phoneEntered', label: 'Phone numbers entered', hint: 'Valid mobile typed at checkout' },
  { key: 'ordersPlaced', label: 'Orders placed', hint: 'Confirmed orders' },
  { key: 'orderValue', label: 'Order value', hint: 'Total of confirmed orders', money: true },
  { key: 'conversion', label: 'Conversion rate', hint: 'Orders ÷ visitors' },
];

const FUNNEL: { key: Counter; label: string }[] = [
  { key: 'visitors', label: 'Visited the website' },
  { key: 'productViews', label: 'Viewed a product' },
  { key: 'addToCart', label: 'Added to cart' },
  { key: 'checkoutStarted', label: 'Started checkout' },
  { key: 'phoneEntered', label: 'Entered phone number' },
  { key: 'ordersPlaced', label: 'Placed an order' },
];

function Delta({ now, before }: { now: number; before: number }) {
  if (!before && !now) return null;
  if (!before) return <Badge tone="positive">new</Badge>;
  const change = Math.round(((now - before) / before) * 100);
  return <Badge tone={change > 0 ? 'positive' : change < 0 ? 'critical' : 'default'}>{`${change > 0 ? '+' : ''}${change}%`}</Badge>;
}

function Bar({ value, max, tone = 'var(--card-focus-ring-color, #2276fc)' }: { value: number; max: number; tone?: string }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div style={{ background: 'var(--card-border-color, #e3e4e8)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${width}%`, height: '100%', background: tone, borderRadius: 4 }} />
    </div>
  );
}

function TopList({ title, rows, empty }: { title: string; rows: { label: string; count: number }[]; empty: string }) {
  const max = rows[0]?.count ?? 0;
  return (
    <Card padding={4} radius={3} shadow={1}>
      <Stack gap={3}>
        <Heading size={1}>{title}</Heading>
        {rows.length === 0 ? (
          <Text size={1} muted>
            {empty}
          </Text>
        ) : (
          rows.slice(0, 10).map((r) => (
            <Stack key={r.label} gap={2}>
              <Flex justify="space-between" gap={3}>
                <Text size={1} textOverflow="ellipsis">
                  {r.label}
                </Text>
                <Text size={1} weight="semibold">
                  {num(r.count)}
                </Text>
              </Flex>
              <Bar value={r.count} max={max} />
            </Stack>
          ))
        )}
      </Stack>
    </Card>
  );
}

export function AnalyticsDashboard() {
  const client = useClient({ apiVersion: '2024-01-01' });
  const [range, setRange] = useState<RangeId>('7d');
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; days: AnalyticsDay[]; prev: AnalyticsDay[]; leads: LeadDoc[]; error: string } | null>(null);
  const [leadFilter, setLeadFilter] = useState<'open' | 'converted' | 'all'>('open');
  const b = useMemo(() => bounds(range), [range]);
  const loadKey = `${range}:${nonce}`;

  useEffect(() => {
    let alive = true;
    const fromIso = new Date(`${b.from}T00:00:00+05:30`).toISOString();
    Promise.all([
      client.fetch<AnalyticsDay[]>(`*[_type == $type && date >= $from && date <= $to] | order(date asc)`, {
        type: ANALYTICS_DAY_TYPE,
        from: b.prevFrom,
        to: b.to,
      }),
      client.fetch<LeadDoc[]>(
        `*[_type == $type && lastSeenAt >= $from] | order(lastSeenAt desc)[0...300]{_id, phone, name, cartValue, cartItems, firstSeenAt, lastSeenAt, converted, orderId, convertedAt}`,
        { type: LEAD_TYPE, from: fromIso },
      ),
    ])
      .then(([all, leads]) => {
        if (!alive) return;
        setData({ key: loadKey, days: all.filter((d) => d.date >= b.from), prev: all.filter((d) => d.date <= b.prevTo), leads, error: '' });
      })
      .catch((e) => {
        if (!alive) return;
        setData({ key: loadKey, days: [], prev: [], leads: [], error: e instanceof Error ? e.message : 'Could not load analytics.' });
      });
    return () => {
      alive = false;
    };
  }, [client, b, loadKey]);

  const loading = data?.key !== loadKey;
  const days = loading ? null : data!.days;
  const prev = useMemo(() => (data && !loading ? data.prev : []), [data, loading]);
  const leads = useMemo(() => (data && !loading ? data.leads : []), [data, loading]);
  const error = loading ? '' : data!.error;
  const load = () => setNonce((n) => n + 1);

  const summary = useMemo(() => summariseDays(days ?? []), [days]);
  const before = useMemo(() => summariseDays(prev), [prev]);

  const valueOf = (s: typeof summary, key: Counter | 'conversion') =>
    key === 'conversion' ? pct(s.totals.ordersPlaced, s.totals.visitors) : s.totals[key];

  const trend = useMemo(() => {
    const byDate = new Map((days ?? []).map((d) => [d.date, d]));
    const out: { date: string; visitors: number; orders: number }[] = [];
    for (let i = b.days - 1; i >= 0; i--) {
      const date = istDay(new Date(`${b.to}T12:00:00+05:30`).getTime() - i * DAY_MS);
      const d = byDate.get(date);
      out.push({ date, visitors: Number(d?.visitors ?? 0), orders: Number(d?.ordersPlaced ?? 0) });
    }
    return out;
  }, [days, b]);
  const trendMax = Math.max(1, ...trend.map((t) => t.visitors));

  const shownLeads = leads.filter((l) => (leadFilter === 'all' ? true : leadFilter === 'converted' ? l.converted : !l.converted));
  const followUp = (l: LeadDoc) => {
    const text =
      `🙏 Radhe Radhe${l.name ? ` ${l.name}` : ''}! This is Nikunj Sakhi. We noticed you were checking out` +
      `${l.cartItems ? ` (${l.cartItems})` : ''} but the order wasn't completed. Can we help you place it?`;
    window.open(`https://wa.me/91${l.phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Box padding={[3, 4, 5]} style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Stack gap={4}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
          <Stack gap={2}>
            <Heading size={3}>Website Analytics</Heading>
            <Text size={1} muted>
              Footfall on the website — visitors, what they look at, phone numbers entered at checkout and orders placed.
              {b.from === b.to ? ` ${b.from}` : ` ${b.from} → ${b.to}`} (India time).
            </Text>
          </Stack>
          <Flex gap={2} wrap="wrap">
            {RANGES.map((r) => (
              <Button key={r.id} text={r.label} mode={range === r.id ? 'default' : 'ghost'} tone={range === r.id ? 'primary' : 'default'} onClick={() => setRange(r.id)} />
            ))}
            <Button text="Refresh" mode="bleed" onClick={load} />
          </Flex>
        </Flex>

        {error && (
          <Card padding={3} radius={2} tone="critical">
            <Text size={1}>{error}</Text>
          </Card>
        )}

        {days === null ? (
          <Flex justify="center" padding={6}>
            <Spinner muted />
          </Flex>
        ) : (
          <>
            {days.length === 0 && !error && (
              <Card padding={4} radius={3} tone="caution">
                <Text size={1}>
                  No visits recorded for this period yet. Visits are counted on the live website (production) once visitors arrive;
                  shoppers who chose “Essential only” cookies are not counted.
                </Text>
              </Card>
            )}

            <Grid gridTemplateColumns={[2, 3, 4, 6]} gap={3}>
              {KPIS.map((k) => {
                const now = valueOf(summary, k.key);
                const was = valueOf(before, k.key);
                return (
                  <Card key={k.key} padding={3} radius={3} shadow={1} title={k.hint}>
                    <Stack gap={3}>
                      <Text size={0} muted>
                        {k.label}
                      </Text>
                      <Heading size={2}>{k.key === 'conversion' ? `${now}%` : k.money ? inr(now) : num(now)}</Heading>
                      <Flex gap={2} align="center">
                        <Delta now={now} before={was} />
                        <Text size={0} muted>
                          vs previous
                        </Text>
                      </Flex>
                    </Stack>
                  </Card>
                );
              })}
            </Grid>

            <Grid gridTemplateColumns={[1, 1, 2]} gap={3}>
              <Card padding={4} radius={3} shadow={1}>
                <Stack gap={4}>
                  <Heading size={1}>Shopper funnel</Heading>
                  {FUNNEL.map((f, i) => {
                    const v = summary.totals[f.key];
                    const top = summary.totals.visitors;
                    const prevStep = i > 0 ? summary.totals[FUNNEL[i - 1].key] : 0;
                    return (
                      <Stack key={f.key} gap={2}>
                        <Flex justify="space-between" gap={3}>
                          <Text size={1}>{f.label}</Text>
                          <Text size={1} weight="semibold">
                            {num(v)}
                            {i > 0 && prevStep > 0 ? ` · ${pct(v, prevStep)}% of previous step` : ''}
                          </Text>
                        </Flex>
                        <Bar value={v} max={Math.max(top, v)} tone={i === FUNNEL.length - 1 ? '#43a047' : undefined} />
                      </Stack>
                    );
                  })}
                </Stack>
              </Card>

              <Card padding={4} radius={3} shadow={1}>
                <Stack gap={4}>
                  <Heading size={1}>Daily visitors &amp; orders</Heading>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 160 }}>
                    {trend.map((t) => (
                      <div
                        key={t.date}
                        title={`${t.date}: ${t.visitors} visitors, ${t.orders} orders`}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', minWidth: 2 }}
                      >
                        <div
                          style={{
                            height: `${(t.visitors / trendMax) * 100}%`,
                            minHeight: t.visitors ? 2 : 0,
                            background: 'var(--card-focus-ring-color, #2276fc)',
                            borderRadius: '3px 3px 0 0',
                            position: 'relative',
                          }}
                        >
                          {t.orders > 0 && (
                            <div style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: 4, background: '#43a047' }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Flex justify="space-between">
                    <Text size={0} muted>
                      {trend[0]?.date}
                    </Text>
                    <Text size={0} muted>
                      Bars = visitors · green dot = day with orders
                    </Text>
                    <Text size={0} muted>
                      {trend[trend.length - 1]?.date}
                    </Text>
                  </Flex>
                </Stack>
              </Card>
            </Grid>

            <Grid gridTemplateColumns={[1, 2, 2, 4]} gap={3}>
              <TopList title="Top pages" rows={summary.pages} empty="No page views yet." />
              <TopList title="Most viewed products" rows={summary.products} empty="No product views yet." />
              <TopList title="Where visitors came from" rows={summary.sources} empty="No visits yet." />
              <TopList title="Devices" rows={summary.devices} empty="No visits yet." />
            </Grid>

            <Card padding={4} radius={3} shadow={1}>
              <Stack gap={4}>
                <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
                  <Stack gap={2}>
                    <Heading size={1}>Phone numbers entered at checkout</Heading>
                    <Text size={1} muted>
                      {leads.filter((l) => !l.converted).length} did not order · {leads.filter((l) => l.converted).length} ordered — in this
                      period. Follow up on WhatsApp to recover abandoned carts.
                    </Text>
                  </Stack>
                  <Flex gap={2}>
                    {(
                      [
                        ['open', 'Did not order'],
                        ['converted', 'Ordered'],
                        ['all', 'All'],
                      ] as const
                    ).map(([id, label]) => (
                      <Button key={id} text={label} fontSize={1} mode={leadFilter === id ? 'default' : 'ghost'} onClick={() => setLeadFilter(id)} />
                    ))}
                  </Flex>
                </Flex>
                {shownLeads.length === 0 ? (
                  <Text size={1} muted>
                    Nobody in this list for the selected period.
                  </Text>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: 'left' }}>
                          {['Customer', 'Phone', 'Cart', 'Last seen', 'Status', ''].map((h) => (
                            <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid var(--card-border-color, #ddd)' }}>
                              <Text size={1} weight="semibold">
                                {h}
                              </Text>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {shownLeads.map((l) => (
                          <tr key={l._id}>
                            <td style={{ padding: '6px 8px' }}>
                              <Text size={1}>{l.name || '—'}</Text>
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <Text size={1}>+91 {l.phone}</Text>
                            </td>
                            <td style={{ padding: '6px 8px', maxWidth: 360 }}>
                              <Text size={1} textOverflow="ellipsis" title={l.cartItems}>
                                {l.cartValue ? `${inr(l.cartValue)} · ` : ''}
                                {l.cartItems || ''}
                              </Text>
                            </td>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                              <Text size={1}>{l.lastSeenAt ? new Date(l.lastSeenAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</Text>
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              {l.converted ? <Badge tone="positive">Ordered {l.orderId}</Badge> : <Badge tone="caution">Did not order</Badge>}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                              {!l.converted && <Button text="WhatsApp" fontSize={1} mode="ghost" tone="positive" onClick={() => followUp(l)} />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Stack>
            </Card>
          </>
        )}
      </Stack>
    </Box>
  );
}
