// Customer cancellation / return request rules shared by the website, API and Studio (no server-only imports).
import { daysSinceDelivered, isReturnStatus } from './orderMessages';

export const CANCEL_REASONS = [
  'Ordered by mistake',
  'Want to change size / colour',
  'Found a better price elsewhere',
  'Delivery is taking too long',
  'Changed my mind',
  'Other',
] as const;

export const RETURN_REASONS = [
  'Item arrived damaged',
  'Defective / not working properly',
  'Wrong item received',
  'Wrong size or colour received',
  'Item missing from package',
  'Quality not as described',
  'Other',
] as const;

/** Reasons where the customer must attach photos so the defect can be verified. */
export const PHOTO_REQUIRED_REASONS: readonly string[] = [
  'Item arrived damaged',
  'Defective / not working properly',
  'Wrong item received',
  'Wrong size or colour received',
  'Quality not as described',
];

/** Orders can be cancelled until they are handed to the courier. */
export const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing'] as const;

export const MAX_REQUEST_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type RequestState = 'pending' | 'approved' | 'rejected';

export interface CancelRequestInfo {
  reasonCategory?: string;
  details?: string;
  requestedAt?: string;
  state?: RequestState;
  decidedAt?: string;
  decisionNote?: string;
}

export interface RequestEligibility {
  canCancel: boolean;
  canReturn: boolean;
  /** Days left in the return window (delivered orders only). */
  returnDaysLeft: number | null;
  returnWindowDays: number;
}

export function requestEligibility(
  order: { status?: string; statusHistory?: { status?: string; at?: string }[]; cancelRequest?: CancelRequestInfo | null; returnInfo?: { requestedAt?: string } | null },
  returnWindowDays = 7,
): RequestEligibility {
  const status = order.status ?? '';
  const cancelOpen = order.cancelRequest?.state === 'pending' || order.cancelRequest?.state === 'rejected';
  const canCancel = (CANCELLABLE_STATUSES as readonly string[]).includes(status) && !cancelOpen;
  const days = status === 'delivered' ? daysSinceDelivered(order.statusHistory) : null;
  const returnDaysLeft = days === null ? null : Math.max(0, returnWindowDays - days);
  // A rejected return puts the order back to "delivered" — one request per order.
  const alreadyRequested = Boolean(order.returnInfo?.requestedAt) || isReturnStatus(status);
  const canReturn = status === 'delivered' && days !== null && days <= returnWindowDays && !alreadyRequested;
  return { canCancel, canReturn, returnDaysLeft, returnWindowDays };
}
