// Dependency-free on purpose: also imported by scripts/sync-sanity-status-to-mongo.mjs.

export const MONGO_ORDER_STATUSES = new Set([
  'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled',
  'return_requested', 'return_approved', 'returned', 'refunded',
]);
export const MONGO_PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded']);

export interface SanityStatusInput {
  status?: unknown;
  paymentStatus?: unknown;
  tracking?: { courier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown } | null;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Translates an owner decision made in Sanity Studio into a MongoDB `$set`.
 * - `out_for_delivery` is stored as `shipped` (Mongo has no separate state for it).
 * - Sanity-only values (`payment_failed`, `refund_due`) are not copied; Mongo has no equivalent.
 * - A delivered COD order means the cash was collected, so it becomes `paid`.
 */
export function buildMongoStatusUpdate(input: SanityStatusInput, current: { paymentMethod?: string }): Record<string, string> {
  const set: Record<string, string> = {};
  const status = input.status === 'out_for_delivery' ? 'shipped' : input.status;
  if (typeof status === 'string' && MONGO_ORDER_STATUSES.has(status)) set.status = status;
  if (typeof input.paymentStatus === 'string' && MONGO_PAYMENT_STATUSES.has(input.paymentStatus)) {
    set.paymentStatus = input.paymentStatus;
  }
  if (set.status === 'delivered' && current.paymentMethod === 'cod' && !set.paymentStatus) set.paymentStatus = 'paid';
  const t = input.tracking;
  if (t) {
    if (nonEmpty(t.courier)) {
      set['tracking.courier'] = t.courier;
      set.courierName = t.courier;
    }
    if (nonEmpty(t.trackingNumber)) {
      set['tracking.trackingNumber'] = t.trackingNumber;
      set.awbCode = t.trackingNumber;
    }
    if (nonEmpty(t.trackingUrl)) {
      set['tracking.trackingUrl'] = t.trackingUrl;
      set.trackingUrl = t.trackingUrl;
    }
  }
  return set;
}
