import type { IOrder } from '@/backend/models/Order';

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';
// Shiprocket tokens live 10 days; refresh well before that.
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

export class ShiprocketError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ShiprocketError';
  }
}

export const isShiprocketConfigured = () => Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);

/** On when credentials exist, unless explicitly switched off with SHIPROCKET_ENABLED=false. */
export const isShiprocketEnabled = () => process.env.SHIPROCKET_ENABLED !== 'false' && isShiprocketConfigured();

export const shouldAutoAssignAwb = () => process.env.AUTO_SHIP_AWB === 'true';

let cachedToken: { value: string; expiresAt: number } | null = null;

export function resetShiprocketTokenCache() {
  cachedToken = null;
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => null)) as { token?: string; message?: string } | null;
  if (!res.ok || !data?.token) throw new ShiprocketError(`Shiprocket login failed (${res.status})${data?.message ? `: ${data.message}` : ''}`, res.status);
  cachedToken = { value: data.token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return data.token;
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  return login();
}

/** Authenticated call; one automatic re-login if Shiprocket answers 401. */
export async function shiprocketRequest<T = Record<string, unknown>>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401 && attempt === 0) {
      resetShiprocketTokenCache();
      continue;
    }
    const data = (await res.json().catch(() => null)) as (T & { message?: string; errors?: unknown }) | null;
    if (!res.ok) {
      const detail = data?.errors ? ` ${JSON.stringify(data.errors).slice(0, 300)}` : '';
      throw new ShiprocketError(`Shiprocket ${path} failed (${res.status}): ${data?.message ?? 'no message'}${detail}`, res.status);
    }
    return (data ?? {}) as T;
  }
  throw new ShiprocketError(`Shiprocket ${path} unauthorised after re-login`, 401);
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Default parcel when the product has no weight/size: 0.5 kg, 10 x 10 x 5 cm (override with SHIPROCKET_DEFAULT_*). */
export const defaultParcel = () => ({
  weight: num(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG, 0.5),
  length: num(process.env.SHIPROCKET_DEFAULT_LENGTH_CM, 10),
  breadth: num(process.env.SHIPROCKET_DEFAULT_BREADTH_CM, 10),
  height: num(process.env.SHIPROCKET_DEFAULT_HEIGHT_CM, 5),
});

type OrderForShipping = Pick<IOrder, 'orderId' | 'items' | 'shippingAddress' | 'subtotal' | 'deliveryCharge' | 'discount' | 'total' | 'paymentMethod' | 'paymentStatus'> & {
  createdAt?: Date | string;
  notification?: { email?: string } | null;
};

const lastTen = (phone: string) => phone.replace(/\D/g, '').slice(-10);

function shiprocketDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Maps our canonical order onto Shiprocket's `orders/create/adhoc` body. */
export function buildShiprocketPayload(order: OrderForShipping) {
  const a = order.shippingAddress;
  const [first, ...rest] = (a.fullName || 'Customer').trim().split(/\s+/);
  const prepaid = !(order.paymentMethod === 'cod' && order.paymentStatus !== 'paid');
  const parcel = defaultParcel();
  return {
    order_id: order.orderId,
    order_date: shiprocketDate(order.createdAt ? new Date(order.createdAt) : new Date()),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    billing_customer_name: first,
    billing_last_name: rest.join(' '),
    billing_address: a.line1,
    billing_address_2: [a.line2, a.landmark].filter(Boolean).join(', '),
    billing_city: a.city,
    billing_pincode: a.pincode,
    billing_state: a.state,
    billing_country: 'India',
    billing_email: order.notification?.email || process.env.SHIPROCKET_EMAIL || '',
    billing_phone: lastTen(a.phone),
    shipping_is_billing: true,
    order_items: order.items.map((i) => ({
      name: [i.name, i.selectedSize].filter(Boolean).join(' - '),
      sku: i.productId,
      units: i.quantity,
      selling_price: i.price,
    })),
    payment_method: prepaid ? 'Prepaid' : 'COD',
    // Shiprocket collects sub_total + shipping_charges - total_discount on COD.
    sub_total: order.subtotal,
    shipping_charges: order.deliveryCharge || 0,
    total_discount: order.discount || 0,
    ...parcel,
  };
}

export interface ShiprocketCreated {
  shiprocketOrderId: string;
  shiprocketShipmentId: string;
}

export async function createShiprocketOrder(order: OrderForShipping): Promise<ShiprocketCreated> {
  const res = await shiprocketRequest<{ order_id?: number | string; shipment_id?: number | string }>('/orders/create/adhoc', {
    method: 'POST',
    body: buildShiprocketPayload(order),
  });
  if (!res.order_id) throw new ShiprocketError('Shiprocket did not return an order id');
  return { shiprocketOrderId: String(res.order_id), shiprocketShipmentId: res.shipment_id ? String(res.shipment_id) : '' };
}

export interface ShiprocketAwb {
  awbCode: string;
  courierName: string;
}

export async function assignShiprocketAWB(shipmentId: string): Promise<ShiprocketAwb> {
  const res = await shiprocketRequest<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>('/courier/assign/awb', {
    method: 'POST',
    body: { shipment_id: shipmentId },
  });
  const data = res.response?.data;
  if (!data?.awb_code) throw new ShiprocketError('Shiprocket did not assign an AWB (check courier serviceability / wallet balance)');
  return { awbCode: data.awb_code, courierName: data.courier_name ?? '' };
}

export async function generatePickup(shipmentId: string) {
  return shiprocketRequest('/courier/generate/pickup', { method: 'POST', body: { shipment_id: [shipmentId] } });
}

export async function generateShiprocketLabel(shipmentId: string): Promise<string | undefined> {
  const res = await shiprocketRequest<{ label_url?: string }>('/courier/generate/label', { method: 'POST', body: { shipment_id: [shipmentId] } });
  return res.label_url;
}

export async function cancelShiprocketOrder(shiprocketOrderId: string) {
  return shiprocketRequest('/orders/cancel', { method: 'POST', body: { ids: [Number(shiprocketOrderId) || shiprocketOrderId] } });
}

export async function getShiprocketTracking(awbOrShipmentId: string, by: 'awb' | 'shipment' = 'awb') {
  return shiprocketRequest(`/courier/track/${by === 'awb' ? 'awb' : 'shipment'}/${encodeURIComponent(awbOrShipmentId)}`);
}

export async function listShiprocketPickupLocations(): Promise<string[]> {
  const res = await shiprocketRequest<{ data?: { shipping_address?: { pickup_location?: string }[] } }>('/settings/company/pickup');
  return (res.data?.shipping_address ?? []).map((p) => p.pickup_location).filter((p): p is string => Boolean(p));
}

export const shiprocketTrackingUrl = (awb: string) => `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;

export interface MappedShiprocketStatus {
  /** New persisted order status, if this event moves the order. */
  status?: 'shipped' | 'delivered' | 'returned';
  /** Human note for the status history. */
  note: string;
  /** Events that need the owner (cancelled / RTO in progress) but must not change stock or money automatically. */
  attention?: string;
}

/** Maps a Shiprocket `current_status` string to our order lifecycle. Unknown statuses are ignored. */
export function mapShiprocketStatus(raw: unknown): MappedShiprocketStatus | null {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[_-]+/g, ' ') : '';
  if (!s) return null;
  if (s === 'RTO DELIVERED') return { status: 'returned', note: 'Shiprocket: returned to origin (RTO delivered)' };
  if (s.startsWith('RTO')) return { note: `Shiprocket: ${s}`, attention: `Shiprocket reports ${s}. The parcel is returning to you — review refund/stock manually.` };
  if (s === 'CANCELED' || s === 'CANCELLED') {
    return { note: 'Shiprocket: shipment cancelled', attention: 'Shiprocket cancelled this shipment. The customer order is unchanged — rebook or cancel it manually.' };
  }
  if (s === 'DELIVERED') return { status: 'delivered', note: 'Shiprocket: delivered' };
  if (s === 'OUT FOR DELIVERY') return { status: 'shipped', note: 'Shiprocket: out for delivery' };
  if (['SHIPPED', 'IN TRANSIT', 'PICKED UP', 'REACHED AT DESTINATION HUB'].includes(s)) return { status: 'shipped', note: `Shiprocket: ${s.toLowerCase()}` };
  return null;
}
