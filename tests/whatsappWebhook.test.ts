import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ updateOne: vi.fn() }));
vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/backend/models/Order', () => ({ Order: { updateOne: mocks.updateOne } }));

import { GET, POST } from '@/app/api/webhooks/whatsapp/route';

const SECRET = 'meta-app-secret';
const sign = (body: string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
const body = (status: string, id = 'wamid.1') =>
  JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id, status }] } }] }] });
const post = (raw: string, sig?: string) =>
  new NextRequest('http://localhost/api/webhooks/whatsapp', { method: 'POST', body: raw, headers: sig ? { 'x-hub-signature-256': sig } : {} });

describe('Meta WhatsApp webhook', () => {
  beforeEach(() => {
    mocks.updateOne.mockReset().mockResolvedValue({});
    process.env.WHATSAPP_APP_SECRET = SECRET;
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify-me';
  });

  it('completes the subscription handshake only with the right verify token', async () => {
    const ok = await GET(new NextRequest('http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1234'));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('1234');
    const bad = await GET(new NextRequest('http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1234'));
    expect(bad.status).toBe(403);
  });

  it('rejects missing, malformed and wrongly-signed requests without touching the database', async () => {
    const raw = body('delivered');
    expect((await POST(post(raw))).status).toBe(401);
    expect((await POST(post(raw, 'sha256=abc'))).status).toBe(401);
    expect((await POST(post(raw, sign(raw, 'other-secret')))).status).toBe(401);
    expect((await POST(post(raw + ' ', sign(raw)))).status).toBe(401); // body tampered after signing
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('fails closed when the app secret is not configured', async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const raw = body('delivered');
    expect((await POST(post(raw, sign(raw)))).status).toBe(503);
  });

  it('updates the order matched by provider message id, moving status forward only', async () => {
    const raw = body('delivered', 'wamid.XYZ');
    expect((await POST(post(raw, sign(raw)))).status).toBe(200);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { 'delivery.otpMessageId': 'wamid.XYZ', 'delivery.otpStatus': { $in: ['accepted', 'sent'] } },
      { $set: { 'delivery.otpStatus': 'delivered' } },
    );
  });

  it('records a failed receipt as failed', async () => {
    const raw = body('failed');
    await POST(post(raw, sign(raw)));
    expect(mocks.updateOne).toHaveBeenCalledWith({ 'delivery.otpMessageId': 'wamid.1' }, { $set: { 'delivery.otpStatus': 'failed' } });
  });

  it('ignores unknown statuses and payloads without statuses', async () => {
    for (const raw of [body('typing'), JSON.stringify({ entry: [] }), '{}']) {
      expect((await POST(post(raw, sign(raw)))).status).toBe(200);
    }
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a validly-signed but non-JSON body', async () => {
    expect((await POST(post('not json', sign('not json')))).status).toBe(400);
  });
});
