import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { applyShiprocketStatusUpdate, type ShiprocketWebhookPayload } from '@/backend/lib/shiprocketFulfilment';

/**
 * Shiprocket tracking webhook. Configure in Shiprocket → Settings → API → Webhooks:
 *   URL: {SITE_URL}/api/webhooks/shiprocket   Token: the value of SHIPROCKET_WEBHOOK_SECRET (sent as `x-api-key`).
 * Fails closed: without a configured secret nobody can move orders to Delivered.
 */
function validKey(given: string | null) {
  const expected = process.env.SHIPROCKET_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!validKey(req.headers.get('x-api-key'))) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const payload = (await req.json().catch(() => null)) as ShiprocketWebhookPayload | null;
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
  }
  try {
    const outcome = await applyShiprocketStatusUpdate(payload);
    // Always 200 for well-formed events so Shiprocket does not retry unknown/ignored statuses forever.
    return NextResponse.json({ success: true, ...outcome });
  } catch (err) {
    console.error('[shiprocket-webhook]', err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, message: 'Processing failed' }, { status: 500 });
  }
}
