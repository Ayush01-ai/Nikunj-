import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useClient } from 'sanity';
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Grid,
  Heading,
  Label,
  Spinner,
  Stack,
  Text,
  TextArea,
  TextInput,
  type BadgeTone,
} from '@sanity/ui';
import { SearchIcon } from '@sanity/icons/Search';
import { ORDER_STATUS_LIST } from '../schemas/order';
import { daysSinceDelivered, deliveryPartnerMessage, isReturnStatus, orderStatusMessage } from '../lib/orderMessages';
import { setOrderStatus, type OrderItemLine } from '../lib/orderOps';
import { siteOrigin } from '../actions/productActions';

interface DashOrder {
  _id: string;
  orderNumber?: string;
  status?: string;
  customerName?: string;
  phone?: string;
  total?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  placedAt?: string;
  stockAdjusted?: boolean;
  tracking?: { courier?: string; trackingNumber?: string; trackingUrl?: string; handedOverAt?: string };
  items?: OrderItemLine[];
  shippingAddress?: { line1?: string; line2?: string; landmark?: string; city?: string; state?: string; pincode?: string };
  statusHistory?: { status?: string; at?: string; note?: string }[];
  returnInfo?: {
    reasonCategory?: string;
    reason?: string;
    requestedAt?: string;
    requestedBy?: string;
    withinWindow?: boolean;
    refundAmount?: number;
    photos?: string[];
  };
  cancelRequest?: { state?: string; reasonCategory?: string; details?: string; requestedAt?: string };
}

interface AdminCfg {
  deliveryPartnerName?: string;
  deliveryPartnerWhatsApp?: string;
  returnWindowDays?: number;
}

const ORDERS_QUERY = `*[_type == "order" && !(_id in path("drafts.**"))] | order(coalesce(placedAt, _createdAt) desc)[0...1000]{
  _id, orderNumber, status, customerName, phone, total, paymentMethod, paymentStatus, placedAt, stockAdjusted,
  tracking, items, shippingAddress, statusHistory, cancelRequest,
  returnInfo{reasonCategory, reason, requestedAt, requestedBy, withinWindow, refundAmount, "photos": photos[].asset->url}
}`;

const cancelPending = (o: DashOrder) => o.cancelRequest?.state === 'pending' && o.status !== 'cancelled';

const FILTERS: { id: string; title: string; match: (o: DashOrder) => boolean }[] = [
  {
    id: 'action',
    title: '⚡ Needs action',
    match: (o) =>
      ['confirmed', 'processing', 'return_requested', 'return_approved', 'returned'].includes(o.status ?? '') || o.paymentStatus === 'refund_due' || cancelPending(o),
  },
  { id: 'cancelRequests', title: '🛑 Cancel requests', match: cancelPending },
  { id: 'confirmed', title: '🆕 To pack', match: (o) => o.status === 'confirmed' },
  { id: 'processing', title: '📦 Packing', match: (o) => o.status === 'processing' },
  { id: 'shipped', title: '🚚 Shipped', match: (o) => o.status === 'shipped' },
  { id: 'delivered', title: '✅ Delivered', match: (o) => o.status === 'delivered' },
  { id: 'returns', title: '🔁 Returns & refunds', match: (o) => isReturnStatus(o.status) || o.paymentStatus === 'refund_due' },
  { id: 'cancelled', title: '❌ Cancelled', match: (o) => o.status === 'cancelled' },
  { id: 'pending', title: '⏳ Awaiting payment', match: (o) => o.status === 'pending' },
  { id: 'all', title: 'All', match: () => true },
];

const COUNTED = new Set(['confirmed', 'processing', 'shipped', 'delivered', 'return_requested']);
const inr = (n?: number) => `₹${Math.round(n ?? 0).toLocaleString('en-IN')}`;
const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
const statusTitle = (s?: string) => ORDER_STATUS_LIST.find((x) => x.value === s)?.title ?? s ?? '—';
const tenDigits = (p?: string) => p?.replace(/\D/g, '').slice(-10);

function statusTone(s?: string): BadgeTone {
  if (s === 'delivered') return 'positive';
  if (s === 'cancelled' || s === 'refunded') return 'critical';
  if (s === 'pending' || isReturnStatus(s)) return 'caution';
  if (s === 'shipped') return 'primary';
  return 'default';
}

type DialogKind = 'ship' | 'return' | 'refund' | 'cancel' | 'reject' | 'rejectCancel';
type Tone = 'primary' | 'positive' | 'critical' | 'caution' | 'default';

export function OrdersDashboard() {
  const client = useClient({ apiVersion: '2024-01-01' });
  const [orders, setOrders] = useState<DashOrder[] | null>(null);
  const [cfg, setCfg] = useState<AdminCfg>({});
  const [filter, setFilter] = useState('action');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ kind: DialogKind; order: DashOrder } | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, admin] = await Promise.all([
        client.fetch<DashOrder[]>(ORDERS_QUERY),
        client.fetch<AdminCfg | null>(`*[_id == "settings.admin"][0]{deliveryPartnerName, deliveryPartnerWhatsApp, returnWindowDays}`),
      ]);
      setOrders(list);
      setCfg(admin ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders');
      setOrders((prev) => prev ?? []);
    }
  }, [client]);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = client.listen('*[_type == "order"]', {}, { visibility: 'query' }).subscribe({
      next: () => {
        clearTimeout(timer);
        timer = setTimeout(() => void load(), 600);
      },
      error: () => undefined,
    });
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [client, load]);

  const windowDays = cfg.returnWindowDays ?? 7;

  const stats = useMemo(() => {
    const list = orders ?? [];
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const counted = list.filter((o) => COUNTED.has(o.status ?? ''));
    const sum = (arr: DashOrder[]) => arr.reduce((n, o) => n + (o.total ?? 0), 0);
    const placed = (o: DashOrder) => (o.placedAt ? new Date(o.placedAt).getTime() : 0);
    const by = (s: string) => list.filter((o) => o.status === s).length;
    return {
      toPack: by('confirmed'),
      packing: by('processing'),
      shipped: by('shipped'),
      delivered: by('delivered'),
      returns: list.filter((o) => isReturnStatus(o.status) && o.status !== 'refunded').length,
      cancelled: by('cancelled'),
      cancelRequests: list.filter(cancelPending).length,
      refundDue: list.filter((o) => o.paymentStatus === 'refund_due').length,
      codToCollect: sum(list.filter((o) => o.paymentMethod === 'cod' && o.paymentStatus !== 'paid' && ['confirmed', 'processing', 'shipped'].includes(o.status ?? ''))),
      revenueToday: sum(counted.filter((o) => placed(o) >= startToday)),
      revenueMonth: sum(counted.filter((o) => placed(o) >= startMonth)),
      revenueAll: sum(counted),
      ordersToday: list.filter((o) => placed(o) >= startToday).length,
    };
  }, [orders]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    const q = query.trim().toLowerCase();
    return (orders ?? []).filter(
      (o) =>
        f.match(o) &&
        (!q ||
          [o.orderNumber, o.customerName, o.phone, o.shippingAddress?.city, o.shippingAddress?.pincode, o.tracking?.trackingNumber].some((v) =>
            v?.toLowerCase().includes(q),
          )),
    );
  }, [orders, filter, query]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const whatsappCustomer = (o: DashOrder, status = o.status) => {
    const phone = tenDigits(o.phone);
    if (!phone) return;
    const text = orderStatusMessage({ ...o, status }, siteOrigin());
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const sendToPartner = (o: DashOrder) => {
    // Open the tab synchronously so the popup blocker allows it.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const partner = tenDigits(cfg.deliveryPartnerWhatsApp);
    const text = encodeURIComponent(deliveryPartnerMessage(o));
    const url = partner ? `https://wa.me/91${partner}?text=${text}` : `https://wa.me/?text=${text}`;
    if (tab) tab.location.href = url;
    else window.location.href = url;
    const note = `Sent to delivery partner${cfg.deliveryPartnerName ? ` (${cfg.deliveryPartnerName})` : ''}`;
    void run(o._id, () =>
      setOrderStatus(client, o._id, 'processing', {
        note,
        setIfMissing: { tracking: {} },
        set: {
          'tracking.handedOverAt': new Date().toISOString(),
          ...(!o.tracking?.courier && cfg.deliveryPartnerName ? { 'tracking.courier': cfg.deliveryPartnerName } : {}),
        },
      }),
    );
  };

  const returnWindowBadge = (o: DashOrder) => {
    const days = daysSinceDelivered(o.statusHistory);
    if (days === null) return null;
    const open = days <= windowDays;
    return (
      <Badge tone={open ? 'positive' : 'critical'} fontSize={0}>
        {open ? `Return window: day ${days} of ${windowDays}` : `Return window closed (${days}d)`}
      </Badge>
    );
  };

  const actionsFor = (o: DashOrder) => {
    const busy = busyId === o._id;
    const btn = (text: string, onClick: () => void, tone: Tone = 'default', mode: 'default' | 'ghost' = 'default') => (
      <Button key={text} text={text} tone={tone} mode={mode} fontSize={1} padding={2} disabled={busy} onClick={onClick} />
    );
    const out: ReactNode[] = [];
    if (cancelPending(o)) {
      out.push(btn('Approve cancellation', () => setDialog({ kind: 'cancel', order: o }), 'critical'));
      out.push(btn('Reject cancellation', () => setDialog({ kind: 'rejectCancel', order: o }), 'default', 'ghost'));
    }
    switch (o.status) {
      case 'pending':
        out.push(btn('Confirm order', () => void run(o._id, () => setOrderStatus(client, o._id, 'confirmed', { note: 'Confirmed from dashboard' })), 'primary'));
        break;
      case 'confirmed':
        out.push(btn('Send to delivery partner', () => sendToPartner(o), 'primary'));
        out.push(btn('Mark packing', () => void run(o._id, () => setOrderStatus(client, o._id, 'processing'))));
        break;
      case 'processing':
        out.push(btn('Ship (add tracking)', () => setDialog({ kind: 'ship', order: o }), 'primary'));
        if (!o.tracking?.handedOverAt) out.push(btn('Send to delivery partner', () => sendToPartner(o)));
        break;
      case 'shipped':
        out.push(
          btn(
            'Mark delivered',
            () =>
              void run(o._id, () =>
                setOrderStatus(client, o._id, 'delivered', o.paymentMethod === 'cod' ? { set: { paymentStatus: 'paid' }, note: 'COD collected' } : {}),
              ),
            'positive',
          ),
        );
        break;
      case 'delivered':
        out.push(btn('Record return request', () => setDialog({ kind: 'return', order: o }), 'caution'));
        break;
      case 'return_requested':
        out.push(
          btn(
            'Approve return',
            () =>
              void run(o._id, () =>
                setOrderStatus(client, o._id, 'return_approved', { setIfMissing: { returnInfo: {} }, set: { 'returnInfo.approvedAt': new Date().toISOString() } }),
              ),
            'positive',
          ),
        );
        out.push(btn('Reject return', () => setDialog({ kind: 'reject', order: o }), 'critical', 'ghost'));
        break;
      case 'return_approved':
        out.push(
          btn(
            'Item received back',
            () =>
              void run(o._id, () =>
                setOrderStatus(client, o._id, 'returned', {
                  setIfMissing: { returnInfo: {} },
                  set: {
                    'returnInfo.receivedAt': new Date().toISOString(),
                    stockAdjusted: false,
                    ...(o.paymentStatus === 'paid' ? { paymentStatus: 'refund_due' } : {}),
                  },
                  note: o.stockAdjusted ? 'Returned item received — stock restored' : 'Returned item received',
                  restockItems: o.stockAdjusted ? o.items : undefined,
                }),
              ),
            'primary',
          ),
        );
        break;
      case 'returned':
        out.push(btn('Mark refunded', () => setDialog({ kind: 'refund', order: o }), 'primary'));
        break;
    }
    if (o.status === 'cancelled' && o.paymentStatus === 'refund_due') out.push(btn('Mark refunded', () => setDialog({ kind: 'refund', order: o }), 'primary'));
    if (o.paymentMethod === 'cod' && o.paymentStatus !== 'paid' && o.status === 'delivered') {
      out.push(btn('COD received', () => void run(o._id, () => client.patch(o._id).set({ paymentStatus: 'paid' }).commit())));
    }
    if (['pending', 'confirmed', 'processing', 'shipped'].includes(o.status ?? '') && !cancelPending(o)) {
      out.push(btn('Cancel', () => setDialog({ kind: 'cancel', order: o }), 'critical', 'ghost'));
    }
    if (tenDigits(o.phone)) out.push(btn('WhatsApp customer', () => whatsappCustomer(o), 'default', 'ghost'));
    return out;
  };

  const submitDialog = (values: { courier: string; awb: string; url: string; reason: string; amount: string }) => {
    if (!dialog) return;
    const { kind, order: o } = dialog;
    setDialog(null);
    const now = new Date().toISOString();
    if (kind === 'ship') {
      void run(o._id, async () => {
        await setOrderStatus(client, o._id, 'shipped', {
          setIfMissing: { tracking: {} },
          set: {
            'tracking.courier': values.courier,
            'tracking.trackingNumber': values.awb,
            ...(values.url ? { 'tracking.trackingUrl': values.url } : {}),
          },
        });
        whatsappCustomer({ ...o, tracking: { courier: values.courier, trackingNumber: values.awb, trackingUrl: values.url || undefined } }, 'shipped');
      });
    } else if (kind === 'return') {
      const days = daysSinceDelivered(o.statusHistory);
      const within = days !== null && days <= windowDays;
      void run(o._id, () =>
        setOrderStatus(client, o._id, 'return_requested', {
          note: within ? `Within ${windowDays}-day window (day ${days})` : `Outside return window (${days ?? '?'} days) — exception`,
          set: { returnInfo: { reason: values.reason, requestedAt: now, withinWindow: within } },
        }),
      );
    } else if (kind === 'reject') {
      void run(o._id, () =>
        setOrderStatus(client, o._id, 'delivered', {
          note: `Return rejected: ${values.reason || 'not eligible'}`,
          setIfMissing: { returnInfo: {} },
          set: { 'returnInfo.rejectedReason': values.reason || 'Not eligible for return', 'returnInfo.rejectedAt': now },
        }),
      );
    } else if (kind === 'rejectCancel') {
      void run(o._id, () =>
        setOrderStatus(client, o._id, o.status ?? 'confirmed', {
          note: `Cancellation request rejected${values.reason ? `: ${values.reason}` : ''}`,
          set: {
            'cancelRequest.state': 'rejected',
            'cancelRequest.decidedAt': now,
            ...(values.reason ? { 'cancelRequest.decisionNote': values.reason } : {}),
          },
        }),
      );
    } else if (kind === 'refund') {
      const amount = Number(values.amount) || o.total || 0;
      void run(o._id, () =>
        setOrderStatus(client, o._id, o.status === 'cancelled' ? 'cancelled' : 'refunded', {
          note: `Refunded ${inr(amount)}`,
          setIfMissing: { returnInfo: {} },
          set: { paymentStatus: 'refunded', 'returnInfo.refundAmount': amount, 'returnInfo.refundedAt': now },
        }),
      );
    } else if (kind === 'cancel') {
      const paid = o.paymentStatus === 'paid';
      void run(o._id, () =>
        setOrderStatus(client, o._id, 'cancelled', {
          note: [cancelPending(o) && 'Customer cancellation approved', values.reason, paid && 'Refund due'].filter(Boolean).join(' · ') || undefined,
          set: {
            stockAdjusted: false,
            ...(paid ? { paymentStatus: 'refund_due' } : {}),
            ...(o.cancelRequest
              ? { 'cancelRequest.state': 'approved', 'cancelRequest.decidedAt': now, ...(values.reason ? { 'cancelRequest.decisionNote': values.reason } : {}) }
              : {}),
          },
          restockItems: o.stockAdjusted ? o.items : undefined,
        }),
      );
    }
  };

  const cards: { label: string; value: string; filter: string; tone?: 'caution' | 'critical' | 'positive' }[] = [
    { label: 'Orders today', value: String(stats.ordersToday), filter: 'all' },
    { label: '🆕 To pack', value: String(stats.toPack), filter: 'confirmed', tone: stats.toPack ? 'caution' : undefined },
    { label: '📦 Packing', value: String(stats.packing), filter: 'processing' },
    { label: '🚚 In transit', value: String(stats.shipped), filter: 'shipped' },
    { label: '✅ Delivered', value: String(stats.delivered), filter: 'delivered' },
    { label: '🔁 Open returns', value: String(stats.returns), filter: 'returns', tone: stats.returns ? 'caution' : undefined },
    { label: '🛑 Cancel requests', value: String(stats.cancelRequests), filter: 'cancelRequests', tone: stats.cancelRequests ? 'critical' : undefined },
    { label: '❌ Cancelled', value: String(stats.cancelled), filter: 'cancelled' },
    { label: '💸 Refunds due', value: String(stats.refundDue), filter: 'returns', tone: stats.refundDue ? 'critical' : undefined },
    { label: 'COD to collect', value: inr(stats.codToCollect), filter: 'shipped' },
    { label: 'Sales today', value: inr(stats.revenueToday), filter: 'all' },
    { label: 'Sales this month', value: inr(stats.revenueMonth), filter: 'all' },
    { label: 'Total sales', value: inr(stats.revenueAll), filter: 'all', tone: 'positive' },
  ];

  return (
    <Box padding={[3, 4, 5]} style={{ height: '100%', overflow: 'auto' }}>
      <Stack gap={4}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
          <Stack gap={3}>
            <Heading size={3}>📦 Orders Dashboard</Heading>
            <Text size={1} muted>
              Manage every order from placement → packing → delivery partner → delivered → returns &amp; refunds. Updates live.
            </Text>
          </Stack>
          <Button text="Refresh" mode="ghost" onClick={() => void load()} />
        </Flex>

        {error && (
          <Card padding={3} tone="critical" radius={2} border>
            <Text size={1}>{error}</Text>
          </Card>
        )}

        {!orders ? (
          <Flex justify="center" padding={6}>
            <Spinner muted />
          </Flex>
        ) : (
          <>
            <Grid gridTemplateColumns={[2, 3, 4, 6]} gap={3}>
              {cards.map((s) => (
                <Card
                  key={s.label}
                  as="button"
                  padding={3}
                  radius={3}
                  border
                  shadow={1}
                  tone={s.tone ?? 'default'}
                  onClick={() => setFilter(s.filter)}
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                >
                  <Stack gap={3}>
                    <Text size={1} muted>
                      {s.label}
                    </Text>
                    <Text size={3} weight="bold">
                      {s.value}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Grid>

            <Flex gap={2} wrap="wrap" align="center">
              {FILTERS.map((f) => (
                <Button
                  key={f.id}
                  text={`${f.title} (${orders.filter(f.match).length})`}
                  mode={filter === f.id ? 'default' : 'ghost'}
                  tone={filter === f.id ? 'primary' : 'default'}
                  fontSize={1}
                  padding={2}
                  onClick={() => setFilter(f.id)}
                />
              ))}
              <Box flex={1} style={{ minWidth: 220 }}>
                <TextInput
                  icon={SearchIcon}
                  placeholder="Search order ID, name, phone, city, pincode, AWB…"
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                  fontSize={1}
                />
              </Box>
            </Flex>

            {visible.length === 0 ? (
              <Card padding={5} radius={2} border tone="transparent">
                <Text align="center" muted>
                  No orders here.
                </Text>
              </Card>
            ) : (
              <Stack gap={2}>
                {visible.map((o) => {
                  const pieces = (o.items ?? []).reduce((n, i) => n + (i.quantity ?? 1), 0);
                  return (
                    <Card key={o._id} padding={3} radius={2} border shadow={1}>
                      <Stack gap={3}>
                        <Flex justify="space-between" align="flex-start" wrap="wrap" gap={3}>
                          <Stack gap={3} flex={1}>
                            <Flex gap={2} align="center" wrap="wrap">
                              <a href={`/studio/intent/edit/id=${encodeURIComponent(o._id)};type=order/`} style={{ textDecoration: 'none' }} title="Open full order">
                                <Text weight="bold" size={2}>
                                  {o.orderNumber ?? o._id}
                                </Text>
                              </a>
                              <Badge tone={statusTone(o.status)}>{statusTitle(o.status)}</Badge>
                              <Badge tone={o.paymentStatus === 'paid' ? 'positive' : o.paymentStatus === 'refund_due' ? 'critical' : 'default'}>
                                {(o.paymentMethod ?? '').toUpperCase()} · {(o.paymentStatus ?? 'pending').replace('_', ' ')}
                              </Badge>
                              {(o.status === 'delivered' || isReturnStatus(o.status)) && returnWindowBadge(o)}
                              {cancelPending(o) && <Badge tone="critical">🛑 Cancellation requested</Badge>}
                            </Flex>
                            <Text size={1} muted>
                              {shortDate(o.placedAt)} · {o.customerName ?? '—'} · {o.phone ?? ''} ·{' '}
                              {[o.shippingAddress?.city, o.shippingAddress?.pincode].filter(Boolean).join(' ')}
                            </Text>
                            <Text size={1}>
                              {pieces} pc — {(o.items ?? []).map((i) => `${i.quantity ?? 1}× ${i.productName ?? 'Item'}${i.option ? ` (${i.option})` : ''}`).join(', ')}
                            </Text>
                            {o.tracking?.trackingNumber && (
                              <Text size={1} muted>
                                🚚 {o.tracking.courier ?? 'Courier'} · AWB {o.tracking.trackingNumber}
                              </Text>
                            )}
                            {cancelPending(o) && (
                              <Card padding={2} radius={2} tone="critical" border>
                                <Text size={1}>
                                  🛑 Customer asked to cancel on {shortDate(o.cancelRequest?.requestedAt)} — <b>{o.cancelRequest?.reasonCategory}</b>
                                  {o.cancelRequest?.details ? ` · “${o.cancelRequest.details}”` : ''}
                                </Text>
                              </Card>
                            )}
                            {(o.returnInfo?.reason || o.returnInfo?.reasonCategory) && (
                              <Stack gap={2}>
                                <Text size={1} muted>
                                  🔁 Return{o.returnInfo.requestedBy === 'customer' ? ' (requested by customer online)' : ''}:{' '}
                                  {o.returnInfo.reasonCategory && <b>{o.returnInfo.reasonCategory}</b>}
                                  {o.returnInfo.reason && o.returnInfo.reason !== o.returnInfo.reasonCategory ? ` — ${o.returnInfo.reason}` : ''}
                                </Text>
                                {!!o.returnInfo.photos?.length && (
                                  <Flex gap={2} wrap="wrap">
                                    {o.returnInfo.photos.filter(Boolean).map((src, i) => (
                                      <a key={src} href={src} target="_blank" rel="noopener noreferrer" title={`Open photo ${i + 1}`}>
                                        <img
                                          src={`${src}?w=160&h=160&fit=crop&auto=format`}
                                          alt={`Customer photo ${i + 1}`}
                                          width={72}
                                          height={72}
                                          style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid var(--card-border-color)' }}
                                        />
                                      </a>
                                    ))}
                                  </Flex>
                                )}
                              </Stack>
                            )}
                          </Stack>
                          <Text size={3} weight="bold">
                            {inr(o.total)}
                          </Text>
                        </Flex>
                        <Flex gap={2} wrap="wrap" align="center">
                          {busyId === o._id && <Spinner muted />}
                          {actionsFor(o)}
                        </Flex>
                      </Stack>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </>
        )}
      </Stack>

      {dialog && (
        <OrderDialog
          kind={dialog.kind}
          order={dialog.order}
          windowDays={windowDays}
          defaultCourier={dialog.order.tracking?.courier ?? cfg.deliveryPartnerName ?? ''}
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
        />
      )}
    </Box>
  );
}

function OrderDialog(props: {
  kind: DialogKind;
  order: DashOrder;
  windowDays: number;
  defaultCourier: string;
  onClose: () => void;
  onSubmit: (v: { courier: string; awb: string; url: string; reason: string; amount: string }) => void;
}) {
  const { kind, order, windowDays } = props;
  const [courier, setCourier] = useState(props.defaultCourier);
  const [awb, setAwb] = useState(order.tracking?.trackingNumber ?? '');
  const [url, setUrl] = useState(order.tracking?.trackingUrl ?? '');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(String(order.returnInfo?.refundAmount ?? order.total ?? ''));
  const days = daysSinceDelivered(order.statusHistory);
  const urlValid = !url || /^https:\/\//.test(url);

  const titles: Record<DialogKind, string> = {
    ship: `Ship ${order.orderNumber}`,
    return: `Return request — ${order.orderNumber}`,
    reject: `Reject return — ${order.orderNumber}`,
    rejectCancel: `Reject cancellation request — ${order.orderNumber}`,
    refund: `Record refund — ${order.orderNumber}`,
    cancel: `Cancel ${order.orderNumber}?`,
  };
  const canSubmit = kind === 'ship' ? Boolean(courier.trim() && awb.trim() && urlValid) : kind === 'return' ? Boolean(reason.trim()) : true;

  return (
    <Dialog
      id="order-dialog"
      header={titles[kind]}
      onClose={props.onClose}
      width={1}
      footer={
        <Flex justify="flex-end" gap={2} padding={3}>
          <Button text="Close" mode="ghost" onClick={props.onClose} />
          <Button
            text={kind === 'cancel' ? 'Cancel order' : kind === 'rejectCancel' ? 'Reject request' : 'Save'}
            tone={kind === 'cancel' || kind === 'reject' || kind === 'rejectCancel' ? 'critical' : 'primary'}
            disabled={!canSubmit}
            onClick={() => props.onSubmit({ courier: courier.trim(), awb: awb.trim(), url: url.trim(), reason: reason.trim(), amount })}
          />
        </Flex>
      }
    >
      <Box padding={4}>
        <Stack gap={4}>
          {kind === 'ship' && (
            <>
              <Stack gap={2}>
                <Label size={1}>Courier</Label>
                <TextInput value={courier} onChange={(e) => setCourier(e.currentTarget.value)} placeholder="Delhivery, India Post, local rider…" />
              </Stack>
              <Stack gap={2}>
                <Label size={1}>Tracking / AWB number</Label>
                <TextInput value={awb} onChange={(e) => setAwb(e.currentTarget.value)} />
              </Stack>
              <Stack gap={2}>
                <Label size={1}>Tracking link (optional, https)</Label>
                <TextInput value={url} onChange={(e) => setUrl(e.currentTarget.value)} customValidity={urlValid ? undefined : 'Must start with https://'} />
              </Stack>
              <Text size={1} muted>
                Saving marks the order Shipped and opens WhatsApp with the tracking details for the customer.
              </Text>
            </>
          )}
          {kind === 'return' && (
            <>
              <Card padding={3} radius={2} tone={days !== null && days <= windowDays ? 'positive' : 'critical'} border>
                <Text size={1}>
                  {days === null
                    ? 'No delivery date recorded for this order.'
                    : days <= windowDays
                      ? `✅ Eligible — delivered ${days} day(s) ago, within the ${windowDays}-day return window.`
                      : `⚠️ Not eligible — delivered ${days} days ago, outside the ${windowDays}-day return window. You can still record it as an exception.`}
                </Text>
              </Card>
              <Stack gap={2}>
                <Label size={1}>Reason given by the customer</Label>
                <TextArea rows={3} value={reason} onChange={(e) => setReason(e.currentTarget.value)} placeholder="Damaged in transit, wrong size…" />
              </Stack>
            </>
          )}
          {(kind === 'reject' || kind === 'cancel' || kind === 'rejectCancel') && (
            <Stack gap={2}>
              {order.cancelRequest?.state === 'pending' && (
                <Card padding={3} radius={2} tone="caution" border>
                  <Text size={1}>
                    Customer reason: <b>{order.cancelRequest.reasonCategory}</b>
                    {order.cancelRequest.details ? ` — ${order.cancelRequest.details}` : ''}
                  </Text>
                </Card>
              )}
              <Label size={1}>{kind === 'cancel' ? 'Reason (optional, kept in history)' : 'Note to customer (shown on their Track Order page)'}</Label>
              <TextArea rows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
              {kind === 'cancel' && (
                <Text size={1} muted>
                  Items go back into stock.{order.paymentStatus === 'paid' ? ' Payment will be marked "Refund due" — refund it from Razorpay.' : ''}
                </Text>
              )}
            </Stack>
          )}
          {kind === 'refund' && (
            <Stack gap={2}>
              <Label size={1}>Refund amount (₹)</Label>
              <TextInput type="number" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} />
              <Text size={1} muted>
                Refund the customer from Razorpay / UPI first, then record it here.
              </Text>
            </Stack>
          )}
        </Stack>
      </Box>
    </Dialog>
  );
}
