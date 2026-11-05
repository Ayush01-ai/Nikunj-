import type { IOrder } from '@/backend/models/Order';

export interface TrackingView {
  courier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

type TrackingLike = { courier?: string; trackingNumber?: string; trackingUrl?: string } | null | undefined;
type MongoTrackingSource = Partial<Pick<IOrder, 'tracking' | 'courierName' | 'awbCode' | 'trackingUrl'>>;

/** Server-only fields that must never reach a customer's browser. */
const INTERNAL_FIELDS = [
  '__v',
  'notificationLog',
  'notification',
  'needsAttention',
  'attentionNote',
  'shiprocketError',
  'shiprocketClaimAt',
  'shiprocketOrderId',
  'shiprocketShipmentId',
  'labelUrl',
  'stockHeld',
  'cashfreePaymentSessionId',
  'cashfreePaymentId',
  'razorpayOrderId',
  'razorpayPaymentId',
] as const;

/** Courier details: Sanity (what the owner sees in Studio) wins, Mongo (webhook / Shiprocket mirror) fills the gaps. */
export function trackingView(sanity: TrackingLike, mongo: MongoTrackingSource): TrackingView | null {
  const courier = sanity?.courier || mongo.tracking?.courier || mongo.courierName || undefined;
  const trackingNumber = sanity?.trackingNumber || mongo.tracking?.trackingNumber || mongo.awbCode || undefined;
  const rawUrl = sanity?.trackingUrl || mongo.tracking?.trackingUrl || mongo.trackingUrl || undefined;
  // Only plain https links are ever rendered as tracking links.
  const trackingUrl = rawUrl?.startsWith('https://') ? rawUrl : undefined;
  if (!courier && !trackingNumber && !trackingUrl) return null;
  return { courier, trackingNumber, trackingUrl };
}

/** Removes internal fields and the delivery OTP token from an order before it is sent to a non-admin caller. */
export function redactOrderForCustomer<T extends object>(order: T): Omit<T, (typeof INTERNAL_FIELDS)[number]> {
  const copy = { ...order } as Record<string, unknown>;
  for (const key of INTERNAL_FIELDS) delete copy[key];
  const delivery = copy.delivery as { token?: string; verifiedAt?: Date } | undefined;
  if (delivery && typeof delivery === 'object') copy.delivery = { verifiedAt: delivery.verifiedAt };
  return copy as unknown as Omit<T, (typeof INTERNAL_FIELDS)[number]>;
}
