import { describe, expect, it } from 'vitest';
import { getWhatsAppHref, normalizeWhatsAppNumber } from '@/frontend/lib/whatsapp';

describe('WhatsApp links', () => {
  it('normalizes an international number with punctuation', () => {
    expect(normalizeWhatsAppNumber('+91 (911) 869-8641')).toBe('919118698641');
  });

  it('adds India country code to a local number', () => {
    expect(normalizeWhatsAppNumber('91186 98641')).toBe('919118698641');
  });

  it('removes the international dialing prefix', () => {
    expect(normalizeWhatsAppNumber('0091 91186 98641')).toBe('919118698641');
  });

  it('uses the store support number when the configured number is invalid', () => {
    expect(normalizeWhatsAppNumber('not a phone number')).toBe('919118698641');
  });

  it('builds a WhatsApp URL with a properly encoded message', () => {
    expect(getWhatsAppHref('+91 91186 98641', 'Namaste! I need help.')).toBe(
      'https://wa.me/919118698641?text=Namaste!%20I%20need%20help.',
    );
  });
});
