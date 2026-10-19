import { NextRequest, NextResponse } from 'next/server';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';
import { TOKEN_PATTERN, resendDeliveryCode } from '@/backend/lib/delivery';

export const runtime = 'nodejs';

const isIpLimited = createRateLimiter(6, 10 * 60 * 1000, 'api/delivery/resend:ip');
const isTokenLimited = createRateLimiter(3, 60 * 60 * 1000, 'api/delivery/resend:token');

/** Delivery partner asks for the customer's code to be WhatsApped again. */
export async function POST(req: NextRequest) {
  const reply = (body: Record<string, unknown>, status = 200) =>
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = String(body?.token ?? '');
  if (!TOKEN_PATTERN.test(token)) return reply({ success: false, error: 'This delivery link is not valid.' }, 404);
  if ((await isIpLimited(`delivery-resend:${clientIp(req)}`)) || (await isTokenLimited(`delivery-resend:${token}`))) {
    return reply({ success: false, error: 'The code was already re-sent a few times. Please call the shop.' }, 429);
  }
  try {
    const result = await resendDeliveryCode(token);
    return reply(result.ok ? { success: true, message: result.message } : { success: false, error: result.message }, result.status);
  } catch (error) {
    console.error('[delivery/resend]', error instanceof Error ? error.message : error);
    return reply({ success: false, error: 'Something went wrong. Please try again.' }, 500);
  }
}
