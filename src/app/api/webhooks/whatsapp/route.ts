import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';

export const dynamic = 'force-dynamic';

/**
 * Meta WhatsApp Cloud API webhook (graph.facebook.com transport) — delivery receipts for the delivery-OTP message.
 * GET  = subscription handshake (hub.verify_token).
 * POST = status events, authenticated with X-Hub-Signature-256 (HMAC-SHA256 of the raw body, keyed by the Meta app secret).
 */
const RANK = { accepted: 0, sent: 1, delivered: 2, read: 3 } as const;
type Rank = keyof typeof RANK;

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function validSignature(rawBody: string, header: string | null, secret: string) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEq(header.slice(7), expected);
}

export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const p = req.nextUrl.searchParams;
  if (verifyToken && p.get('hub.mode') === 'subscribe' && safeEq(p.get('hub.verify_token') ?? '', verifyToken)) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

interface StatusEvent { id?: string; status?: string }
interface Payload { entry?: { changes?: { value?: { statuses?: StatusEvent[] } }[] }[] }

export async function POST(req: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  const events = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []));
  if (events.length) await connectDB();
  for (const ev of events) {
    if (!ev.id || !ev.status) continue;
    if (ev.status === 'failed') {
      await Order.updateOne({ 'delivery.otpMessageId': ev.id }, { $set: { 'delivery.otpStatus': 'failed' } });
    } else if (ev.status in RANK) {
      // Receipts can arrive out of order or twice: only ever move forward (never regress delivered -> sent).
      const rank = RANK[ev.status as Rank];
      const lower = (Object.keys(RANK) as Rank[]).filter((s) => RANK[s] < rank);
      await Order.updateOne(
        { 'delivery.otpMessageId': ev.id, 'delivery.otpStatus': { $in: lower } },
        { $set: { 'delivery.otpStatus': ev.status } },
      );
    }
  }
  return NextResponse.json({ success: true });
}
