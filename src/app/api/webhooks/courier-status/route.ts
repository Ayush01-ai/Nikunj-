import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ORDER_ID_PATTERN } from '@/backend/lib/orderAccess';
import { applyShiprocketStatusUpdate, type ShiprocketWebhookPayload } from '@/backend/lib/shiprocketFulfilment';

/**
 * Shiprocket tracking webhook. Configure in Shiprocket → Settings → API → Webhooks:
 *   URL: {SITE_URL}/api/webhooks/courier-status   Token: the value of SHIPROCKET_WEBHOOK_SECRET (sent as `x-api-key`).
 * Fails closed: without a configured secret nobody can move orders to Delivered.
 */
function validKey(given: string | null) {
  const expected = process.env.SHIPROCKET_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PING = { status: 'ok', success: true } as const;

/** Reachability probes (Shiprocket "Test Webhook"/"Save") use GET/HEAD; they touch nothing. */
export async function GET() {
  return NextResponse.json(PING);
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

const asId = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

export async function POST(req: NextRequest) {
  const rawText = await req.text().catch(() => '');
  let parsed: unknown = null;
  try {
    parsed = rawText.trim() ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }
  const payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ShiprocketWebhookPayload & Record<string, unknown>) : null;
  const authorised = validKey(req.headers.get('x-api-key'));

  if (!authorised) {
    // Only a request that targets one of our real order numbers is an attack; anything else is Shiprocket's URL test.
    const targetsOurOrder = [payload?.order_id, payload?.channel_order_id].some((v) => ORDER_ID_PATTERN.test(asId(v)));
    if (targetsOurOrder) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ ...PING, handled: false, reason: 'test_ping' });
  }

  const hasIdentifier = payload && [payload.order_id, payload.channel_order_id, payload.awb, payload.shipment_id].some((v) => asId(v));
  if (!payload || !hasIdentifier) {
    return NextResponse.json({ ...PING, handled: false, reason: 'ping_or_test_payload' });
  }
  if (!payload.order_id && payload.channel_order_id) payload.order_id = asId(payload.channel_order_id);
  try {
    const outcome = await applyShiprocketStatusUpdate(payload);
    // Always 200 for well-formed events so Shiprocket does not retry unknown/ignored statuses forever.
    return NextResponse.json({ success: true, ...outcome });
  } catch (err) {
    console.error('[shiprocket-webhook]', err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, message: 'Processing failed' }, { status: 500 });
  }
}