import type { NextRequest } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { isValidPhone, sanitizePhone } from '@/backend/lib/auth';
import { requireAuthHybrid } from '@/backend/lib/clerk';

export const ORDER_ID_PATTERN = /^NS-[A-Z0-9_-]{8}$/;
export const ORDER_NOT_FOUND = 'We could not find an order with those details. Please check the order ID and phone number.';

type AccessResult =
  | { ok: true; orderId: string; order: NonNullable<Awaited<ReturnType<typeof findOrder>>> }
  | { ok: false; status: number; error: string };

const findOrder = (orderId: string) => Order.findOne({ orderId }).lean();

/** A customer may see / act on an order if they own it (logged in) or know the phone number used for it. */
export async function verifyOrderAccess(req: NextRequest, rawOrderId: unknown, rawPhone: unknown): Promise<AccessResult> {
  const orderId = String(rawOrderId ?? '').trim().toUpperCase();
  const phone = rawPhone ? sanitizePhone(String(rawPhone)) : '';
  if (!ORDER_ID_PATTERN.test(orderId)) return { ok: false, status: 400, error: 'Enter a valid order ID, e.g. NS-AB12CD34.' };

  let viewer: { userId: string } | null = null;
  try {
    viewer = await requireAuthHybrid(req);
  } catch {
    // Guests verify with phone number instead.
  }
  if (!viewer && !isValidPhone(phone)) return { ok: false, status: 400, error: 'Enter the 10-digit mobile number used for the order.' };

  let order;
  try {
    await connectDB();
    order = await findOrder(orderId);
  } catch (error) {
    console.error('[order-access]', error instanceof Error ? error.message : error);
    return { ok: false, status: 503, error: 'Order service is temporarily unavailable. Please try again shortly.' };
  }
  if (!order) return { ok: false, status: 404, error: ORDER_NOT_FOUND };

  const phoneMatches = phone && [order.shippingAddress?.phone, order.guestPhone].some((p) => p && sanitizePhone(p) === phone);
  const isOwner = viewer && order.userId?.toString() === viewer.userId;
  if (!phoneMatches && !isOwner) return { ok: false, status: 404, error: ORDER_NOT_FOUND };
  return { ok: true, orderId, order };
}
