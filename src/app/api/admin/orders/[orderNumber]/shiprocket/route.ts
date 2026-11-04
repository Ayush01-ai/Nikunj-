import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ORDER_ID_PATTERN } from '@/backend/lib/orderAccess';
import { isStudioOrSiteAdmin } from '@/backend/lib/studioAuth';
import { cancelShiprocketForOrder, ensureShiprocketOrder } from '@/backend/lib/shiprocketFulfilment';
import { isShiprocketEnabled } from '@/backend/lib/shiprocket';

function validSecret(given: string | null) {
  const expected = process.env.SANITY_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Books (default) or cancels the Shiprocket order for one order. Idempotent.
 * Auth: Studio / site admin session, or the `x-webhook-secret` header (SANITY_WEBHOOK_SECRET).
 * Body: { action?: "create" | "cancel" }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderNumber: string }> }) {
  if (!validSecret(req.headers.get('x-webhook-secret')) && !(await isStudioOrSiteAdmin(req))) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { orderNumber } = await params;
  if (!ORDER_ID_PATTERN.test(orderNumber)) {
    return NextResponse.json({ success: false, message: 'Invalid order number' }, { status: 400 });
  }
  if (!isShiprocketEnabled()) {
    return NextResponse.json({ success: false, message: 'Shiprocket is not configured or is disabled' }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as { action?: string } | null;

  if (body?.action === 'cancel') {
    const result = await cancelShiprocketForOrder(orderNumber);
    return NextResponse.json({ success: result.cancelled, ...result }, { status: result.cancelled ? 200 : 409 });
  }
  const result = await ensureShiprocketOrder(orderNumber);
  if (!result.ok) return NextResponse.json({ success: false, message: result.error }, { status: 502 });
  if (!result.created) {
    const status = result.reason === 'not_found' ? 404 : result.reason === 'exists' ? 200 : 409;
    return NextResponse.json({ success: result.reason === 'exists', reason: result.reason }, { status });
  }
  return NextResponse.json({
    success: true,
    shiprocketOrderId: result.shiprocketOrderId,
    shiprocketShipmentId: result.shiprocketShipmentId,
    ...(result.awbCode ? { awbCode: result.awbCode } : {}),
  });
}
