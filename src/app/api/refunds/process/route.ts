import { NextRequest, NextResponse } from 'next/server';
import { ORDER_ID_PATTERN } from '@/backend/lib/orderAccess';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { processRefund } from '@/backend/lib/refunds';
import { isStudioOrSiteAdmin, studioCorsHeaders } from '@/backend/lib/studioAuth';

export const runtime = 'nodejs';
export const maxDuration = 30;

const isRateLimited = createRateLimiter(30, 60 * 1000, 'api/refunds/process:isRateLimited');

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: studioCorsHeaders(req) });
}

/**
 * Called by the Orders Dashboard right after the owner approves a refund (and for "Check status").
 * Only Sanity project editors (Studio login token) or website admins may call it. It only ever acts
 * on a refund already marked `approved` in Sanity, sends it to the destination snapshot stored
 * there, and is idempotent — so calling it again can't move extra money.
 */
export async function POST(req: NextRequest) {
  const cors = studioCorsHeaders(req);
  const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: cors });

  if (await isRateLimited(`refund-process:${clientIp(req)}`)) {
    return reply({ success: false, message: 'Too many requests. Wait a minute and try again.' }, 429);
  }
  if (!(await isStudioOrSiteAdmin(req))) {
    return reply({ success: false, message: 'Not authorised. Log in to Sanity Studio again and retry.' }, 401);
  }
  const body = (await req.json().catch(() => null)) as { orderId?: unknown } | null;
  const orderId = String(body?.orderId ?? '').trim().toUpperCase();
  if (!ORDER_ID_PATTERN.test(orderId)) return reply({ success: false, message: 'Invalid order ID.' }, 400);

  try {
    const result = await processRefund(orderId);
    if (!result.ok) return reply({ success: false, message: result.message }, result.status);
    return reply({ success: true, state: result.state, message: result.message });
  } catch (error) {
    console.error('[refunds/process]', orderId, error instanceof Error ? error.message : error);
    return reply({ success: false, message: 'Refund could not be processed. Check the order and try again.' }, 500);
  }
}