/* eslint-disable @next/next/no-img-element -- Studio tool runs inside Sanity, not next/image; thumbnails come from the Sanity CDN with size params. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { daysSinceDelivered, deliveryCodeMessage, deliveryPartnerMessage, isReturnStatus, orderStatusMessage, trackOrderUrl } from '../lib/orderMessages';
import { setOrderStatus, type OrderItemLine } from '../lib/orderOps';
import {
  REFUND_SOURCE_LABEL,
  clampRefundAmount,
  describePayout,
  refundBreakdown,
  refundExpected,
  refundLocked,
  refundSource,
  type RefundBreakdown,
  type RefundInfo,
} from '../lib/refunds';
import { siteOrigin } from '../actions/productActions';

/** The signed-in Studio user's Sanity token (token login), used to authorise owner-only site APIs. */
function studioToken(config: { token?: string; projectId?: string }): string | undefined {
  if (config.token) return config.token;
  try {
    const raw = window.localStorage.getItem(`__studio_auth_token_${config.projectId}`);
    return raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
  } catch {
    return undefined;
  }
}

interface DashOrder {
  _id: string;
  orderNumber?: string;
  status?: string;
  customerName?: string;
  phone?: string;
  total?: number;
  deliveryCharge?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentGateway?: string;
  cashfreeOrderId?: string;
  cashfreePaymentId?: string;
  razorpayPaymentId?: string;
  placedAt?: string;
  stockAdjusted?: boolean;
  tracking?: { courier?: string; trackingNumber?: string; trackingUrl?: string; handedOverAt?: string };
  delivery?: { partnerName?: string; assignedAt?: string; otpRequired?: boolean; otpSentAt?: string; attempts?: number; verifiedAt?: string };
  items?: (OrderItemLine & { image?: string })[];
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
  refund?: RefundInfo | null;
}

interface AdminCfg {
  deliveryPartnerName?: string;
  deliveryPartnerWhatsApp?: string;
  returnWindowDays?: number;
  refundDeliveryCharge?: boolean;
}

const ORDERS_QUERY = `*[_type == "order" && !(_id in path("drafts.**"))] | order(coalesce(placedAt, _createdAt) desc)[0...2000]{
  _id, orderNumber, status, customerName, phone, total, deliveryCharge, paymentMethod, paymentStatus, placedAt, stockAdjusted,
  paymentGateway, cashfreeOrderId, cashfreePaymentId, razorpayPaymentId, refund,
  tracking, delivery, items, shippingAddress, statusHistory, cancelRequest,
  returnInfo{reasonCategory, reason, requestedAt, requestedBy, withinWindow, refundAmount, "photos": photos[].asset->url}
}`;

/** Delivery / COD charge not returned by a refund of mount (0 when the delivery charge is refunded too). */
const keptCharges = (o: DashOrder, amount: number) =>
  Math.max(0, Math.min(o.deliveryCharge ?? 0, Math.round(((o.total ?? 0) - amount) * 100) / 100));

const cancelPending = (o: DashOrder) => o.cancelRequest?.state === 'pending' && o.status !== 'cancelled';
/** A refund the owner has to act on (approve, retry, or finish manually). */
const refundNeedsAction = (o: DashOrder) =>
  (refundExpected(o) && !refundLocked(o.refund)) || o.refund?.state === 'manual' || o.refund?.state === 'failed';
const refundOpen = (o: DashOrder) => refundExpected(o) || ['approved', 'processing', 'manual', 'failed'].includes(o.refund?.state ?? '');

const FILTERS: { id: string; title: string; match: (o: DashOrder) => boolean }[] = [
  {
    id: 'action',
    title: '⚡ Needs action',
    match: (o) =>
      ['confirmed', 'processing', 'return_requested', 'return_approved', 'returned'].includes(o.status ?? '') || refundNeedsAction(o) || cancelPending(o),
  },
  { id: 'cancelRequests', title: '🛑 Cancel requests', match: cancelPending },
  { id: 'confirmed', title: '🆕 To pack', match: (o) => o.status === 'confirmed' },
  { id: 'processing', title: '📦 Packing', match: (o) => o.status === 'processing' },
  { id: 'shipped', title: '🚚 Shipped', match: (o) => o.status === 'shipped' },
  { id: 'delivered', title: '✅ Delivered', match: (o) => o.status === 'delivered' },
  { id: 'returns', title: '🔁 Returns & refunds', match: (o) => isReturnStatus(o.status) || refundOpen(o) },
  { id: 'cancelled', title: '❌ Cancelled', match: (o) => o.status === 'cancelled' },
  { id: 'pending', title: '⏳ Awaiting payment', match: (o) => o.status === 'pending' },
  { id: 'all', title: 'All', match: () => true },
];

type RangeId = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all';
const RANGES: { id: RangeId; title: string }[] = [
  { id: 'today', title: 'Today' },
  { id: 'yesterday', title: 'Yesterday' },
  { id: '7d', title: 'Last 7 days' },
  { id: '30d', title: 'Last 30 days' },
  { id: 'month', title: 'This month' },
  { id: 'all', title: 'All time' },
];

/** [start, end) in ms for a date range, in the browser's local time. */
function rangeBounds(range: RangeId): [number, number] {
  const now = new Date();
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime();
  switch (range) {
    case 'today':
      return [day(0), Infinity];
    case 'yesterday':
      return [day(-1), day(0)];
    case '7d':
      return [day(-6), Infinity];
    case '30d':
      return [day(-29), Infinity];
    case 'month':
      return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Infinity];
    default:
      return [-Infinity, Infinity];
  }
}

const placedMs = (o: DashOrder) => (o.placedAt ? new Date(o.placedAt).getTime() : 0);
const inRange = (o: DashOrder, [from, to]: [number, number]) => {
  const t = placedMs(o);
  return t >= from && t < to;
};

interface ProductRow {
  key: string;
  name: string;
  option?: string;
  image?: string;
  qty: number;
  revenue: number;
  orders: number;
}

/** Quantity / revenue per product (and size) across the given orders. */
function summariseProducts(list: DashOrder[]): ProductRow[] {
  const rows = new Map<string, ProductRow>();
  for (const o of list) {
    const seen = new Set<string>();
    for (const i of o.items ?? []) {
      const key = `${i.productId ?? i.productName ?? 'item'}|${i.option ?? ''}`;
      const row = rows.get(key) ?? { key, name: i.productName ?? 'Item', option: i.option, image: i.image, qty: 0, revenue: 0, orders: 0 };
      const qty = i.quantity ?? 1;
      row.qty += qty;
      row.revenue += (i.price ?? 0) * qty;
      row.image ??= i.image;
      if (!seen.has(key)) row.orders += 1;
      seen.add(key);
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
}

const thumb = (src?: string, size = 40) =>
  src?.includes('cdn.sanity.io') ? `${src}${src.includes('?') ? '&' : '?'}w=${size * 2}&h=${size * 2}&fit=crop&auto=format` : src;

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

type DialogKind = 'ship' | 'return' | 'refund' | 'approveRefund' | 'cancel' | 'reject' | 'rejectCancel';
type Tone = 'primary' | 'positive' | 'critical' | 'caution' | 'default';
type DialogValues = { courier: string; awb: string; url: string; reason: string; amount: string };

export function OrdersDashboard() {
  const client = useClient({ apiVersion: '2024-01-01' });
  const [orders, setOrders] = useState<DashOrder[] | null>(null);
  const [cfg, setCfg] = useState<AdminCfg>({});
  const [filter, setFilter] = useState('action');
  const [range, setRange] = useState<RangeId>('all');
  const [view, setView] = useState<'orders' | 'products'>('orders');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<{ kind: DialogKind; order: DashOrder } | null>(null);
  const [handover, setHandover] = useState<DeliveryHandover | null>(null);
  const synced = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const [list, admin] = await Promise.all([
        client.fetch<DashOrder[]>(ORDERS_QUERY),
        client.fetch<AdminCfg | null>(`*[_id == "settings.admin"][0]{deliveryPartnerName, deliveryPartnerWhatsApp, returnWindowDays, refundDeliveryCharge}`),
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
    const placed = placedMs;
    const by = (s: string) => list.filter((o) => o.status === s).length;
    return {
      toPack: by('confirmed'),
      packing: by('processing'),
      shipped: by('shipped'),
      delivered: by('delivered'),
      returns: list.filter((o) => isReturnStatus(o.status) && o.status !== 'refunded').length,
      cancelled: by('cancelled'),
      cancelRequests: list.filter(cancelPending).length,
      refundDue: list.filter(refundNeedsAction).length,
      codToCollect: sum(list.filter((o) => o.paymentMethod === 'cod' && o.paymentStatus !== 'paid' && ['confirmed', 'processing', 'shipped'].includes(o.status ?? ''))),
      revenueToday: sum(counted.filter((o) => placed(o) >= startToday)),
      revenueMonth: sum(counted.filter((o) => placed(o) >= startMonth)),
      revenueAll: sum(counted),
      ordersToday: list.filter((o) => placed(o) >= startToday).length,
    };
  }, [orders]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    const bounds = rangeBounds(range);
    const q = query.trim().toLowerCase();
    return (orders ?? []).filter(
      (o) =>
        f.match(o) &&
        inRange(o, bounds) &&
        (!q ||
          [o.orderNumber, o.customerName, o.phone, o.shippingAddress?.city, o.shippingAddress?.pincode, o.tracking?.trackingNumber]
            .concat((o.items ?? []).map((i) => i.productName))
            .some((v) => v?.toLowerCase().includes(q))),
    );
  }, [orders, filter, range, query]);

  // Products view counts real orders only, unless you're explicitly looking at cancelled / unpaid ones.
  const products = useMemo(
    () => summariseProducts(filter === 'cancelled' || filter === 'pending' ? visible : visible.filter((o) => o.status !== 'pending' && o.status !== 'cancelled')),
    [visible, filter],
  );
  const visibleSales = useMemo(() => visible.filter((o) => COUNTED.has(o.status ?? '')).reduce((n, o) => n + (o.total ?? 0), 0), [visible]);
  const rangeCount = useCallback((r: RangeId) => (orders ?? []).filter((o) => inRange(o, rangeBounds(r))).length, [orders]);

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

  const askRefundDetails = (o: DashOrder) => {
    const phone = tenDigits(o.phone);
    if (!phone) return;
    const name = o.customerName?.split(' ')[0] || 'Devotee';
    const text = `Namaste ${name} 🙏\nWe'd like to send the refund of *${inr(o.refund?.amount ?? refundBreakdown(o, cfg.refundDeliveryCharge).expected)}* for order *${o.orderNumber}*. Please share the UPI ID or bank account where you'd like to receive it, securely here:\n${trackOrderUrl(siteOrigin(), o.orderNumber)}`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  /** Runs (or re-checks) an approved refund on the server, which holds the gateway keys. */
  const callRefundApi = useCallback(async (o: DashOrder, quiet = false) => {
    const token = studioToken(client.config());
    let res: Response | null = null;
    let json: { success?: boolean; message?: string } = {};
    try {
      res = await fetch(`${siteOrigin()}/api/refunds/process`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ orderId: o.orderNumber }),
      });
      json = (await res.json().catch(() => ({}))) as typeof json;
    } catch (e) {
      json = { message: `Could not reach the website server (${e instanceof Error ? e.message : 'network error'}).` };
    }
    if (!res?.ok || !json.success) {
      const message = json.message || `Refund request failed (${res?.status ?? 'network'})`;
      // If the server never picked the refund up (unreachable, not authorised, crashed), don't leave it on "Approved — sending".
      const fresh = await client.fetch<{ _rev: string; refund?: RefundInfo | null } | null>(`*[_id == $id][0]{_rev, refund}`, { id: o._id }).catch(() => null);
      if (fresh?.refund?.state === 'approved') {
        await client
          .patch(o._id)
          .ifRevisionId(fresh._rev)
          .set({ 'refund.state': 'failed', 'refund.failureReason': message.slice(0, 300), 'refund.completedAt': new Date().toISOString() })
          .commit()
          .catch(() => undefined);
      }
      if (quiet) return;
      throw new Error(`${o.orderNumber}: ${message}`);
    }
    if (!quiet) setNotice(`${o.orderNumber}: ${json.message ?? 'Done'}`);
  }, [client]);

  const approveRefund = (o: DashOrder, amountInput: string) =>
    void run(o._id, async () => {
      const fresh = await client.fetch<{ refund?: RefundInfo | null; paymentStatus?: string; status?: string } | null>(
        `*[_id == $id][0]{refund, paymentStatus, status}`,
        { id: o._id },
      );
      if (!fresh || refundLocked(fresh.refund)) throw new Error(`${o.orderNumber}: this refund is already approved or in progress.`);
      if (!refundExpected({ ...o, ...fresh })) throw new Error(`${o.orderNumber}: no refund is due on this order any more.`);
      const source = refundSource(o);
      const dest = fresh.refund?.payoutDetails;
      if (source === 'payout') {
        if (!dest?.mode) throw new Error(`${o.orderNumber}: the customer hasn't shared UPI / bank details yet.`);
        if (describePayout(dest, true) !== describePayout(o.refund?.payoutDetails, true)) {
          throw new Error(`${o.orderNumber}: the customer just changed their refund details — please review them again.`);
        }
      }
      const amount = clampRefundAmount(Number(amountInput), o.total ?? 0);
      await client
        .patch(o._id)
        .setIfMissing({ refund: {} })
        .set({
          'refund.state': 'approved',
          'refund.source': source,
          'refund.amount': amount,
          'refund.deductedCharges': keptCharges(o, amount),
          'refund.approvedAt': new Date().toISOString(),
          ...(source === 'payout' && dest ? { 'refund.approvedDestination': dest } : {}),
        })
        .commit();
      await callRefundApi(o);
    });

  // Refunds still on their way: ask the gateway for the latest status once per session.
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const o of orders ?? []) {
        const r = o.refund;
        if (r?.state !== 'processing' || synced.current.has(o._id)) continue;
        if (r.initiatedAt && Date.now() - new Date(r.initiatedAt).getTime() < 60_000) continue;
        synced.current.add(o._id);
        void callRefundApi(o, true).catch(() => undefined);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [orders, callRefundApi]);

  /**
   * Creates (or reuses) the partner's secret delivery link on the server, marks the order out for delivery
   * and WhatsApps the customer their doorstep code. The partner is then sent the link from the handover panel.
   */
  const sendToPartner = (o: DashOrder, regenerate = false) =>
    void run(o._id, async () => {
      const token = studioToken(client.config());
      const res = await fetch(`${siteOrigin()}/api/delivery/assign`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ orderId: o.orderNumber, partnerName: o.delivery?.partnerName || cfg.deliveryPartnerName || undefined, regenerate }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; link?: string; otpSent?: boolean; otp?: string };
      if (!res.ok || !json.success || !json.link) throw new Error(`${o.orderNumber}: ${json.message || `Could not create the delivery link (${res.status})`}`);
      setHandover({ order: o, link: json.link, otpSent: Boolean(json.otpSent), otp: json.otp, regenerated: regenerate });
    });

  const shareWithPartner = (h: DeliveryHandover) => {
    const partner = tenDigits(cfg.deliveryPartnerWhatsApp);
    const text = encodeURIComponent(deliveryPartnerMessage(h.order, h.link));
    window.open(partner ? `https://wa.me/91${partner}?text=${text}` : `https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const shareCodeWithCustomer = (h: DeliveryHandover) => {
    const phone = tenDigits(h.order.phone);
    if (!phone || !h.otp) return;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(deliveryCodeMessage(h.order, h.otp))}`, '_blank', 'noopener,noreferrer');
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

  const refundActions = (o: DashOrder, btn: (text: string, onClick: () => void, tone?: Tone, mode?: 'default' | 'ghost') => ReactNode) => {
    const out: ReactNode[] = [];
    const r = o.refund;
    const source = r?.source ?? refundSource(o);
    if (r?.state === 'approved' || r?.state === 'processing') {
      out.push(btn(r.state === 'approved' ? 'Send refund now' : 'Check refund status', () => void run(o._id, () => callRefundApi(o)), 'primary'));
      return out;
    }
    if (r?.state === 'manual') {
      out.push(btn('Mark refunded (enter UTR)', () => setDialog({ kind: 'refund', order: o }), 'primary'));
      return out;
    }
    if (!refundExpected(o)) return out;
    // Only offer the online refund once a return is physically back (or the order was cancelled).
    const ready = o.paymentStatus === 'refund_due' || o.status === 'returned';
    if (source === 'payout' && !r?.payoutDetails?.mode) {
      if (tenDigits(o.phone)) out.push(btn('Ask customer for UPI / bank', () => askRefundDetails(o), 'caution'));
    } else if (ready) {
      out.push(btn(r?.state === 'failed' ? 'Retry refund' : 'Approve & send refund', () => setDialog({ kind: 'approveRefund', order: o }), 'primary'));
    }
    if (ready) out.push(btn('Mark refunded manually', () => setDialog({ kind: 'refund', order: o }), 'default', 'ghost'));
    return out;
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
        out.push(btn('Send to delivery partner (OTP)', () => sendToPartner(o), 'primary'));
        out.push(btn('Mark packing', () => void run(o._id, () => setOrderStatus(client, o._id, 'processing'))));
        break;
      case 'processing':
        out.push(btn('Send to delivery partner (OTP)', () => sendToPartner(o), 'primary'));
        out.push(btn('Ship via courier (add tracking)', () => setDialog({ kind: 'ship', order: o })));
        break;
      case 'shipped': {
        const awaitingOtp = Boolean(o.delivery?.otpRequired && !o.delivery.verifiedAt);
        if (awaitingOtp) out.push(btn('Delivery link & code', () => sendToPartner(o), 'primary'));
        out.push(
          btn(
            awaitingOtp ? 'Mark delivered without OTP' : 'Mark delivered',
            () => {
              if (awaitingOtp && !window.confirm(`Mark ${o.orderNumber} delivered without the customer's code? Only do this if you are sure it was received.`)) return;
              void run(o._id, () =>
                setOrderStatus(client, o._id, 'delivered', {
                  ...(o.paymentMethod === 'cod' ? { set: { paymentStatus: 'paid' } } : {}),
                  note: [awaitingOtp && 'Marked delivered from dashboard without OTP', o.paymentMethod === 'cod' && 'COD collected'].filter(Boolean).join(' · ') || undefined,
                }),
              );
            },
            awaitingOtp ? 'default' : 'positive',
            awaitingOtp ? 'ghost' : 'default',
          ),
        );
        if (!awaitingOtp && !o.tracking?.trackingNumber) out.push(btn('Send to delivery partner (OTP)', () => sendToPartner(o), 'default', 'ghost'));
        break;
      }
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
        break;
    }
    out.push(...refundActions(o, btn));
    if (o.paymentMethod === 'cod' && o.paymentStatus !== 'paid' && o.status === 'delivered') {
      out.push(btn('COD received', () => void run(o._id, () => client.patch(o._id).set({ paymentStatus: 'paid' }).commit())));
    }
    if (['pending', 'confirmed', 'processing', 'shipped'].includes(o.status ?? '') && !cancelPending(o)) {
      out.push(btn('Cancel', () => setDialog({ kind: 'cancel', order: o }), 'critical', 'ghost'));
    }
    if (tenDigits(o.phone)) out.push(btn('WhatsApp customer', () => whatsappCustomer(o), 'default', 'ghost'));
    return out;
  };

  const submitDialog = (values: DialogValues) => {
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
      const amount = clampRefundAmount(Number(values.amount), o.total ?? 0);
      const reference = values.reason.trim();
      const source = o.refund?.source ?? refundSource(o);
      void run(o._id, async () => {
        await setOrderStatus(client, o._id, o.status === 'cancelled' ? 'cancelled' : 'refunded', {
          note: `Refunded ${inr(amount)} manually${reference ? ` · Ref ${reference}` : ''}`,
          setIfMissing: { returnInfo: {}, refund: {} },
          set: {
            paymentStatus: 'refunded',
            'returnInfo.refundAmount': amount,
            'returnInfo.refundedAt': now,
            'refund.state': 'success',
            'refund.source': source,
            'refund.amount': amount,
            'refund.deductedCharges': keptCharges(o, amount),
            'refund.completedAt': now,
            ...(reference ? { 'refund.bankReference': reference } : {}),
          },
        });
        // Cancelled orders keep their status, so the order-status webhook won't message the customer.
        if (o.status === 'cancelled') whatsappCustomer({ ...o, paymentStatus: 'refunded' }, 'refunded');
      });
    } else if (kind === 'approveRefund') {
      approveRefund(o, values.amount);
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

  const cards: { label: string; value: string; filter: string; range?: RangeId; tone?: 'caution' | 'critical' | 'positive' }[] = [
    { label: '🗓️ Orders today', value: String(stats.ordersToday), filter: 'all', range: 'today', tone: stats.ordersToday ? 'positive' : undefined },
    { label: '🆕 To pack', value: String(stats.toPack), filter: 'confirmed', tone: stats.toPack ? 'caution' : undefined },
    { label: '📦 Packing', value: String(stats.packing), filter: 'processing' },
    { label: '🚚 In transit', value: String(stats.shipped), filter: 'shipped' },
    { label: '✅ Delivered', value: String(stats.delivered), filter: 'delivered' },
    { label: '🔁 Open returns', value: String(stats.returns), filter: 'returns', tone: stats.returns ? 'caution' : undefined },
    { label: '🛑 Cancel requests', value: String(stats.cancelRequests), filter: 'cancelRequests', tone: stats.cancelRequests ? 'critical' : undefined },
    { label: '❌ Cancelled', value: String(stats.cancelled), filter: 'cancelled' },
    { label: '💸 Refunds to action', value: String(stats.refundDue), filter: 'returns', tone: stats.refundDue ? 'critical' : undefined },
    { label: 'COD to collect', value: inr(stats.codToCollect), filter: 'shipped' },
    { label: 'Sales today', value: inr(stats.revenueToday), filter: 'all', range: 'today' },
    { label: 'Sales this month', value: inr(stats.revenueMonth), filter: 'all', range: 'month' },
    { label: 'Total sales', value: inr(stats.revenueAll), filter: 'all', range: 'all', tone: 'positive' },
  ];
  const rangeTitle = RANGES.find((r) => r.id === range)?.title ?? '';
  const filterTitle = FILTERS.find((f) => f.id === filter)?.title ?? '';

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
            <Flex justify="space-between" align="center" gap={2}>
              <Text size={1}>{error}</Text>
              <Button text="Dismiss" mode="bleed" fontSize={1} padding={2} onClick={() => setError('')} />
            </Flex>
          </Card>
        )}
        {notice && (
          <Card padding={3} tone="positive" radius={2} border>
            <Flex justify="space-between" align="center" gap={2}>
              <Text size={1}>{notice}</Text>
              <Button text="Dismiss" mode="bleed" fontSize={1} padding={2} onClick={() => setNotice('')} />
            </Flex>
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
                  selected={view === 'orders' && filter === s.filter && range === (s.range ?? 'all')}
                  onClick={() => {
                    setFilter(s.filter);
                    setRange(s.range ?? 'all');
                    setView('orders');
                  }}
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

            <Card padding={3} radius={3} border tone="transparent">
              <Stack gap={3}>
                <Flex gap={2} wrap="wrap" align="center">
                  <Text size={1} weight="semibold">
                    📅 Placed:
                  </Text>
                  {RANGES.map((r) => (
                    <Button
                      key={r.id}
                      text={`${r.title} (${rangeCount(r.id)})`}
                      mode={range === r.id ? 'default' : 'ghost'}
                      tone={range === r.id ? 'primary' : 'default'}
                      fontSize={1}
                      padding={2}
                      onClick={() => setRange(r.id)}
                    />
                  ))}
                  <Box flex={1} />
                  <Flex gap={1}>
                    <Button
                      text="🧾 Orders"
                      mode={view === 'orders' ? 'default' : 'ghost'}
                      tone={view === 'orders' ? 'primary' : 'default'}
                      fontSize={1}
                      padding={2}
                      onClick={() => setView('orders')}
                    />
                    <Button
                      text="🛍️ Products ordered"
                      mode={view === 'products' ? 'default' : 'ghost'}
                      tone={view === 'products' ? 'primary' : 'default'}
                      fontSize={1}
                      padding={2}
                      onClick={() => setView('products')}
                    />
                  </Flex>
                </Flex>
                <Flex gap={2} wrap="wrap" align="center">
                  {FILTERS.map((f) => {
                    const bounds = rangeBounds(range);
                    return (
                      <Button
                        key={f.id}
                        text={`${f.title} (${orders.filter((o) => f.match(o) && inRange(o, bounds)).length})`}
                        mode={filter === f.id ? 'default' : 'ghost'}
                        tone={filter === f.id ? 'primary' : 'default'}
                        fontSize={1}
                        padding={2}
                        onClick={() => setFilter(f.id)}
                      />
                    );
                  })}
                  <Box flex={1} style={{ minWidth: 220 }}>
                    <TextInput
                      icon={SearchIcon}
                      placeholder="Search order ID, name, phone, city, pincode, AWB, product…"
                      value={query}
                      onChange={(e) => setQuery(e.currentTarget.value)}
                      fontSize={1}
                    />
                  </Box>
                </Flex>
                <Text size={1} muted>
                  Showing <b>{visible.length}</b> order{visible.length === 1 ? '' : 's'} · {filterTitle} · {rangeTitle}
                  {visibleSales ? ` · Sales ${inr(visibleSales)}` : ''}
                  {view === 'products' ? ` · ${products.reduce((n, p) => n + p.qty, 0)} pcs across ${products.length} product${products.length === 1 ? '' : 's'}` : ''}
                </Text>
              </Stack>
            </Card>

            {view === 'products' ? (
              <ProductsSummary rows={products} />
            ) : visible.length === 0 ? (
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
                            <Flex gap={2} align="center" wrap="wrap">
                              {(o.items ?? []).slice(0, 6).map((i, idx) =>
                                i.image ? (
                                  <img
                                    key={`${i.productId ?? i.productName}-${idx}`}
                                    src={thumb(i.image)}
                                    alt={i.productName ?? 'Item'}
                                    title={`${i.quantity ?? 1}× ${i.productName ?? 'Item'}`}
                                    width={40}
                                    height={40}
                                    loading="lazy"
                                    style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid var(--card-border-color)' }}
                                  />
                                ) : null,
                              )}
                              <Text size={1}>
                                {pieces} pc — {(o.items ?? []).map((i) => `${i.quantity ?? 1}× ${i.productName ?? 'Item'}${i.option ? ` (${i.option})` : ''}`).join(', ')}
                              </Text>
                            </Flex>
                            {o.tracking?.trackingNumber && (
                              <Text size={1} muted>
                                🚚 {o.tracking.courier ?? 'Courier'} · AWB {o.tracking.trackingNumber}
                              </Text>
                            )}
                            {o.delivery?.otpRequired && <DeliveryLine d={o.delivery} />}
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
                            {(refundOpen(o) || o.refund?.state) && <RefundSummary order={o} />}
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
          refundDeliveryCharge={Boolean(cfg.refundDeliveryCharge)}
          defaultCourier={dialog.order.tracking?.courier ?? cfg.deliveryPartnerName ?? ''}
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
        />
      )}

      {handover && (
        <DeliveryHandoverDialog
          handover={handover}
          partnerName={cfg.deliveryPartnerName}
          hasPartnerWhatsApp={Boolean(tenDigits(cfg.deliveryPartnerWhatsApp))}
          busy={busyId === handover.order._id}
          onSharePartner={() => shareWithPartner(handover)}
          onShareCustomer={() => shareCodeWithCustomer(handover)}
          onRegenerate={() => {
            if (window.confirm('Create a new delivery link? The old link and code stop working, and the customer gets a new code.')) sendToPartner(handover.order, true);
          }}
          onClose={() => setHandover(null)}
        />
      )}
    </Box>
  );
}

interface DeliveryHandover {
  order: DashOrder;
  link: string;
  otpSent: boolean;
  /** Present only when WhatsApp could not send the code automatically. */
  otp?: string;
  regenerated: boolean;
}

function DeliveryLine({ d }: { d: NonNullable<DashOrder['delivery']> }) {
  const attempts = d.attempts ?? 0;
  const text = d.verifiedAt
    ? `🔐 Delivered with customer code · ${shortDate(d.verifiedAt)}`
    : attempts >= 5
      ? '🔒 Delivery link locked after 5 wrong codes — create a new link'
      : `🔐 Out for delivery${d.partnerName ? ` with ${d.partnerName}` : ''} · code ${d.otpSentAt ? `sent ${shortDate(d.otpSentAt)}` : 'not sent yet'}${attempts ? ` · ${attempts} wrong attempt${attempts === 1 ? '' : 's'}` : ''}`;
  return (
    <Text size={1} muted={!(attempts >= 5 && !d.verifiedAt)} style={attempts >= 5 && !d.verifiedAt ? { color: 'var(--card-badge-critical-fg-color, #c00)' } : undefined}>
      {text}
    </Text>
  );
}

function DeliveryHandoverDialog(props: {
  handover: DeliveryHandover;
  partnerName?: string;
  hasPartnerWhatsApp: boolean;
  busy: boolean;
  onSharePartner: () => void;
  onShareCustomer: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const { handover: h } = props;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(h.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog id="delivery-handover" header={`Out for delivery — ${h.order.orderNumber}`} onClose={props.onClose} width={1}>
      <Box padding={4}>
        <Stack gap={4}>
          <Text size={1}>
            {h.regenerated ? 'A new delivery link was created — the old link no longer works. ' : ''}
            The order is marked <b>Shipped</b>. The delivery partner opens this link at the door, enters the customer&apos;s 6-digit code, and the order becomes{' '}
            <b>Delivered</b> automatically{h.order.paymentMethod === 'cod' ? ' (COD marked paid)' : ''}.
          </Text>

          <Stack gap={2}>
            <Label size={1}>1 · Send the link to {props.partnerName || 'the delivery partner'}</Label>
            <Card padding={2} radius={2} border tone="transparent">
              <Text size={1} style={{ wordBreak: 'break-all' }}>
                {h.link}
              </Text>
            </Card>
            <Flex gap={2} wrap="wrap">
              <Button text={props.hasPartnerWhatsApp ? 'WhatsApp the partner' : 'Share on WhatsApp'} tone="primary" fontSize={1} padding={2} onClick={props.onSharePartner} />
              <Button text={copied ? 'Copied ✓' : 'Copy link'} mode="ghost" fontSize={1} padding={2} onClick={() => void copy()} />
            </Flex>
            {!props.hasPartnerWhatsApp && (
              <Text size={1} muted>
                Tip: add the partner&apos;s WhatsApp number in Admin Settings to message them in one click.
              </Text>
            )}
          </Stack>

          <Stack gap={2}>
            <Label size={1}>2 · Customer&apos;s delivery code</Label>
            {h.otpSent ? (
              <Card padding={2} radius={2} tone="positive" border>
                <Text size={1}>✅ The code was sent to the customer on WhatsApp. They share it with the partner only after receiving the parcel.</Text>
              </Card>
            ) : (
              <Card padding={3} radius={2} tone="caution" border>
                <Stack gap={3}>
                  <Text size={1}>
                    WhatsApp could not send the code automatically. Send it to the customer yourself: <b style={{ letterSpacing: 2 }}>{h.otp}</b>
                  </Text>
                  <Flex>
                    <Button text="WhatsApp the code to customer" tone="caution" fontSize={1} padding={2} disabled={!h.otp || !tenDigits(h.order.phone)} onClick={props.onShareCustomer} />
                  </Flex>
                </Stack>
              </Card>
            )}
          </Stack>

          <Flex justify="space-between" gap={2} wrap="wrap">
            <Button text="New link (revoke old)" mode="ghost" tone="critical" fontSize={1} padding={2} disabled={props.busy} onClick={props.onRegenerate} />
            <Button text="Done" mode="ghost" fontSize={1} padding={2} onClick={props.onClose} />
          </Flex>
        </Stack>
      </Box>
    </Dialog>
  );
}

/** Refund amount with one-click "Full" / "Items only" presets (delivery / COD charges kept back). */
function RefundAmountPicker(props: { breakdown: RefundBreakdown; amount: string; onChange: (v: string) => void; valid: boolean }) {
  const { breakdown: b, amount, onChange, valid } = props;
  const current = Number(amount);
  const preset = (value: number, text: string) => (
    <Button
      key={text}
      text={text}
      fontSize={1}
      padding={2}
      mode={current === value ? 'default' : 'ghost'}
      tone={current === value ? 'primary' : 'default'}
      onClick={() => onChange(String(value))}
    />
  );
  return (
    <Stack gap={2}>
      <Label size={1}>Refund amount (₹) — max {inr(b.total)}</Label>
      {b.deliveryCharge > 0 && b.itemsOnly > 0 && (
        <Flex gap={2} wrap="wrap">
          {preset(b.itemsOnly, `Items only ${inr(b.itemsOnly)} (keep delivery ${inr(b.deliveryCharge)})`)}
          {preset(b.total, `Full amount ${inr(b.total)}`)}
        </Flex>
      )}
      <TextInput type="number" value={amount} onChange={(e) => onChange(e.currentTarget.value)} customValidity={valid ? undefined : `Enter 1 – ${b.total}`} />
      {b.deliveryCharge > 0 && (
        <Text size={1} muted>
          {current < b.total
            ? `Delivery / COD charge of ${inr(Math.min(b.deliveryCharge, b.total - (current || 0)))} is kept — the customer was told this is non-refundable.`
            : 'Full refund — the delivery / COD charge is refunded too.'}
        </Text>
      )}
    </Stack>
  );
}

function OrderDialog(props: {
  kind: DialogKind;
  order: DashOrder;
  windowDays: number;
  refundDeliveryCharge: boolean;
  defaultCourier: string;
  onClose: () => void;
  onSubmit: (v: DialogValues) => void;
}) {
  const { kind, order, windowDays } = props;
  const [courier, setCourier] = useState(props.defaultCourier);
  const [awb, setAwb] = useState(order.tracking?.trackingNumber ?? '');
  const [url, setUrl] = useState(order.tracking?.trackingUrl ?? '');
  const [reason, setReason] = useState('');
  const breakdown = refundBreakdown(order, props.refundDeliveryCharge);
  const [amount, setAmount] = useState(String(order.refund?.amount ?? order.returnInfo?.refundAmount ?? breakdown.expected));
  const days = daysSinceDelivered(order.statusHistory);
  const urlValid = !url || /^https:\/\//.test(url);
  const source = order.refund?.source ?? refundSource(order);
  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum >= 1 && amountNum <= (order.total ?? 0);

  const titles: Record<DialogKind, string> = {
    ship: `Ship ${order.orderNumber}`,
    return: `Return request — ${order.orderNumber}`,
    reject: `Reject return — ${order.orderNumber}`,
    rejectCancel: `Reject cancellation request — ${order.orderNumber}`,
    refund: `Record manual refund — ${order.orderNumber}`,
    approveRefund: `Approve refund — ${order.orderNumber}`,
    cancel: `Cancel ${order.orderNumber}?`,
  };
  const canSubmit =
    kind === 'ship'
      ? Boolean(courier.trim() && awb.trim() && urlValid)
      : kind === 'return'
        ? Boolean(reason.trim())
        : kind === 'refund' || kind === 'approveRefund'
          ? amountValid
          : true;
  const submitText =
    kind === 'cancel' ? 'Cancel order' : kind === 'rejectCancel' ? 'Reject request' : kind === 'approveRefund' ? `Approve & send ${amountValid ? inr(amountNum) : ''}` : 'Save';

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
            text={submitText}
            tone={kind === 'cancel' || kind === 'reject' || kind === 'rejectCancel' ? 'critical' : kind === 'approveRefund' ? 'positive' : 'primary'}
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
                  Items go back into stock.
                  {order.paymentStatus === 'paid'
                    ? ' Payment will be marked "Refund due" — then use "Approve & send refund" to return the money (back to the original payment, or to the UPI / bank account the customer shares for Cash on Delivery).'
                    : ''}
                </Text>
              )}
            </Stack>
          )}
          {kind === 'approveRefund' && (
            <Stack gap={3}>
              <Card padding={3} radius={2} tone={source === 'payout' ? 'caution' : 'primary'} border>
                <Stack gap={2}>
                  <Text size={1} weight="semibold">
                    {REFUND_SOURCE_LABEL[source]}
                  </Text>
                  {source === 'payout' ? (
                    <Text size={1}>
                      Send to: <b>{describePayout(order.refund?.payoutDetails, true)}</b>
                      {order.refund?.payoutDetails?.submittedAt ? ` (shared ${shortDate(order.refund.payoutDetails.submittedAt)})` : ''}
                    </Text>
                  ) : (
                    <Text size={1} muted>
                      Paid online ({(order.paymentMethod ?? '').toUpperCase()}) — the money goes back to the same card / UPI / bank automatically.
                    </Text>
                  )}
                </Stack>
              </Card>
              <RefundAmountPicker breakdown={breakdown} amount={amount} onChange={setAmount} valid={amountValid} />
              <Text size={1} muted>
                {source === 'payout'
                  ? 'The amount is transferred instantly through Cashfree Payouts. If Payouts isn’t set up yet, the refund is marked "Manual transfer" so you can pay from your UPI / bank app and record the UTR.'
                  : 'Card refunds usually reach the customer in 5–7 working days; UPI refunds are often faster. The customer is notified on WhatsApp when it completes.'}
              </Text>
            </Stack>
          )}
          {kind === 'refund' && (
            <Stack gap={2}>
              <RefundAmountPicker breakdown={breakdown} amount={amount} onChange={setAmount} valid={amountValid} />
              <Label size={1}>UTR / transaction reference (optional)</Label>
              <TextInput value={reason} onChange={(e) => setReason(e.currentTarget.value)} placeholder="e.g. 412345678901" />
              {source === 'payout' && order.refund?.payoutDetails?.mode && (
                <Card padding={2} radius={2} tone="caution" border>
                  <Text size={1}>
                    Customer’s refund account: <b>{describePayout(order.refund.approvedDestination ?? order.refund.payoutDetails, true)}</b>
                  </Text>
                </Card>
              )}
              <Text size={1} muted>
                Use this only when you sent the money yourself (UPI app, bank transfer, or the gateway dashboard). It records the refund without moving any money.
              </Text>
            </Stack>
          )}
        </Stack>
      </Box>
    </Dialog>
  );
}

const REFUND_TONE: Record<string, BadgeTone> = {
  awaiting_details: 'caution',
  details_submitted: 'primary',
  approved: 'primary',
  processing: 'primary',
  manual: 'caution',
  success: 'positive',
  failed: 'critical',
};

const ADMIN_REFUND_STATE: Record<string, string> = {
  awaiting_details: 'Waiting for customer UPI / bank details',
  details_submitted: 'Customer shared details — review & approve',
  approved: 'Approved — sending',
  processing: 'Sent — waiting for bank confirmation',
  manual: 'Payouts not set up — transfer manually and record the UTR',
  success: 'Refunded',
  failed: 'Failed',
};

function RefundSummary({ order: o }: { order: DashOrder }) {
  const r = o.refund ?? {};
  const source = r.source ?? refundSource(o);
  const state = r.state ?? (source === 'payout' ? 'awaiting_details' : refundExpected(o) ? 'details_submitted' : 'success');
  const label = source !== 'payout' && state === 'details_submitted' ? 'Ready to refund — approve to send it back' : ADMIN_REFUND_STATE[state];
  const dest = r.approvedDestination ?? r.payoutDetails;
  return (
    <Card padding={2} radius={2} tone={state === 'failed' ? 'critical' : state === 'success' ? 'positive' : 'caution'} border>
      <Stack gap={2}>
        <Flex gap={2} align="center" wrap="wrap">
          <Text size={1} weight="semibold">
            💸 Refund {inr(r.amount ?? o.returnInfo?.refundAmount ?? o.total)}
            {r.deductedCharges ? ` (delivery ${inr(r.deductedCharges)} kept)` : ''}
          </Text>
          <Badge tone={REFUND_TONE[state] ?? 'default'} fontSize={0}>
            {label}
          </Badge>
          <Text size={1} muted>
            {REFUND_SOURCE_LABEL[source]}
          </Text>
        </Flex>
        {dest?.mode && (
          <Text size={1}>
            To: <b>{describePayout(dest, true)}</b>
            {dest.submittedAt ? ` · shared ${shortDate(dest.submittedAt)}` : ''}
          </Text>
        )}
        {(r.bankReference || r.gatewayRefundId || r.referenceId) && (
          <Text size={1} muted>
            {[r.bankReference && `UTR/ARN ${r.bankReference}`, r.gatewayRefundId && `Gateway ID ${r.gatewayRefundId}`, r.referenceId && `Ref ${r.referenceId}`]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
        {state === 'failed' && r.failureReason && <Text size={1}>⚠️ {r.failureReason}</Text>}
      </Stack>
    </Card>
  );
}

function ProductsSummary({ rows }: { rows: ProductRow[] }) {
  if (!rows.length) {
    return (
      <Card padding={5} radius={2} border tone="transparent">
        <Text align="center" muted>
          No products ordered in this view.
        </Text>
      </Card>
    );
  }
  const maxQty = rows[0]?.qty || 1;
  return (
    <Card radius={2} border shadow={1} overflow="auto">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--card-border-color)' }}>
            {['#', 'Product', 'Size / option', 'Pieces', 'Orders', 'Revenue'].map((h) => (
              <th key={h} style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, idx) => (
            <tr key={p.key} style={{ borderBottom: '1px solid var(--card-border-color)' }}>
              <td style={{ padding: '8px 12px', opacity: 0.6 }}>{idx + 1}</td>
              <td style={{ padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {p.image ? (
                    <img src={thumb(p.image, 44)} alt="" width={44} height={44} loading="lazy" style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 4, background: 'var(--card-muted-bg-color, #eee)', flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: '#e9d9a8', width: 140 }}>
                      <div style={{ height: 4, borderRadius: 2, background: '#b8860b', width: `${Math.max(4, (p.qty / maxQty) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </td>
              <td style={{ padding: '8px 12px' }}>{p.option || '—'}</td>
              <td style={{ padding: '8px 12px', fontWeight: 700 }}>{p.qty}</td>
              <td style={{ padding: '8px 12px' }}>{p.orders}</td>
              <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{inr(p.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
