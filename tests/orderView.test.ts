import { describe, expect, it } from 'vitest';
import { redactOrderForCustomer, trackingView } from '@/backend/lib/orderView';

describe('redactOrderForCustomer', () => {
  it('removes internal fields and the delivery token', () => {
    const verifiedAt = new Date();
    const out = redactOrderForCustomer({
      orderId: 'NS-1',
      status: 'confirmed',
      total: 100,
      attentionNote: 'secret note',
      needsAttention: true,
      shiprocketError: 'err',
      shiprocketClaimAt: new Date(),
      notificationLog: ['x'],
      delivery: { token: 'OTP123', verifiedAt },
    }) as Record<string, unknown>;
    expect(out).toMatchObject({ orderId: 'NS-1', status: 'confirmed', total: 100 });
    for (const k of ['attentionNote', 'needsAttention', 'shiprocketError', 'shiprocketClaimAt', 'notificationLog']) {
      expect(out).not.toHaveProperty(k);
    }
    expect(out.delivery).toEqual({ verifiedAt });
  });

  it('does not mutate the input', () => {
    const input = { orderId: 'NS-1', attentionNote: 'n' };
    redactOrderForCustomer(input);
    expect(input.attentionNote).toBe('n');
  });
});

describe('trackingView', () => {
  it('prefers Sanity values and falls back to Mongo', () => {
    expect(
      trackingView({ courier: 'Delhivery' }, { awbCode: 'AWB9', trackingUrl: 'https://t.example/9' }),
    ).toEqual({ courier: 'Delhivery', trackingNumber: 'AWB9', trackingUrl: 'https://t.example/9' });
  });

  it('drops non-https tracking links', () => {
    const out = trackingView({ trackingNumber: '1', trackingUrl: 'javascript:alert(1)' }, {});
    expect(out?.trackingUrl).toBeUndefined();
  });

  it('returns null when nothing is known', () => {
    expect(trackingView(undefined, {})).toBeNull();
  });
});
