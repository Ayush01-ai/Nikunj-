import { NextRequest, NextResponse } from 'next/server';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { TOKEN_PATTERN, verifyDelivery } from '@/backend/lib/delivery';

export const runtime = 'nodejs';

const isIpLimited = createRateLimiter(20, 10 * 60 * 1000, 'api/delivery/verify:ip');

/** Delivery partner submits the customer's code from the /deliver/<token> page. */
export async function POST(req: NextRequest) {
  const reply = (body: Record<string, unknown>, status = 200) =>
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (await isIpLimited(`delivery-verify:${clientIp(req)}`)) {
    return reply({ success: false, error: 'Too many attempts. Please wait a few minutes.' }, 429);
  }
  const body = (await req.json().catch(() => null)) as { token?: unknown; otp?: unknown } | null;
  const token = String(body?.token ?? '');
  const otp = String(body?.otp ?? '').replace(/\D/g, '');
  if (!TOKEN_PATTERN.test(token)) return reply({ success: false, error: 'This delivery link is not valid.' }, 404);
  if (otp.length !== 6) return reply({ success: false, error: 'Enter the 6-digit code the customer received on WhatsApp.' }, 400);

  try {
    const result = await verifyDelivery(token, otp);
    if (!result.ok) return reply({ success: false, error: result.message, attemptsLeft: result.attemptsLeft }, result.status);
    return reply({ success: true, orderId: result.orderId, codCollected: result.codCollected });
  } catch (error) {
    console.error('[delivery/verify]', error instanceof Error ? error.message : error);
    return reply({ success: false, error: 'Something went wrong. Please try again.' }, 500);
  }
}
