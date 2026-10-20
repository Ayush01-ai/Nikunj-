import { NextRequest, NextResponse } from 'next/server';
import { ORDER_ID_PATTERN } from '@/backend/lib/orderAccess';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { assignDelivery } from '@/backend/lib/delivery';
import { isStudioOrSiteAdmin, studioCorsHeaders } from '@/backend/lib/studioAuth';

export const runtime = 'nodejs';

const isRateLimited = createRateLimiter(40, 60 * 1000, 'api/delivery/assign:isRateLimited');

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: studioCorsHeaders(req) });
}

/**
 * Orders Dashboard → "Send to delivery partner" / "Delivery link". Owner-only (Sanity Studio login or
 * website admin). Creates or reuses the partner's delivery link, marks the order out for delivery and
 * WhatsApps the customer their delivery code.
 */
export async function POST(req: NextRequest) {
  const cors = studioCorsHeaders(req);
  const reply = (body: Record<string, unknown>, status = 200) =>
    NextResponse.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });

  if (await isRateLimited(`delivery-assign:${clientIp(req)}`)) {
    return reply({ success: false, message: 'Too many requests. Wait a minute and try again.' }, 429);
  }
  if (!(await isStudioOrSiteAdmin(req))) {
    return reply({ success: false, message: 'Not authorised. Log in to Sanity Studio again and retry.' }, 401);
  }
  const body = (await req.json().catch(() => null)) as { orderId?: unknown; partnerName?: unknown; regenerate?: unknown } | null;
  const orderId = String(body?.orderId ?? '').trim().toUpperCase();
  if (!ORDER_ID_PATTERN.test(orderId)) return reply({ success: false, message: 'Invalid order ID.' }, 400);
  const partnerName = typeof body?.partnerName === 'string' ? body.partnerName.trim().slice(0, 80) : undefined;

  try {
    const result = await assignDelivery(orderId, { partnerName: partnerName || undefined, regenerate: body?.regenerate === true });
    if (!result.ok) return reply({ success: false, message: result.message }, result.status);
    return reply({ success: true, ...result });
  } catch (error) {
    console.error('[delivery/assign]', orderId, error instanceof Error ? error.message : error);
    return reply({ success: false, message: 'Could not create the delivery link. Please try again.' }, 500);
  }
}
