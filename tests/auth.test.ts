import { describe, expect, it } from 'vitest';
import { safeEqual, isValidPhone, sanitizePhone } from '@/backend/lib/auth';

describe('safeEqual', () => {
  it('returns true only for an exact match', () => {
    expect(safeEqual('123456', '123456')).toBe(true);
    expect(safeEqual('123456', '654321')).toBe(false);
  });

  it('returns false (not throws) for different-length inputs', () => {
    expect(safeEqual('123456', '1234567')).toBe(false);
    expect(safeEqual('', '123456')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts a 10-digit Indian mobile number starting 6-9', () => {
    expect(isValidPhone('9876543210')).toBe(true);
    expect(isValidPhone('6000000000')).toBe(true);
  });

  it('rejects numbers with wrong length or leading digit', () => {
    expect(isValidPhone('1234567890')).toBe(false); // leading 1
    expect(isValidPhone('98765432')).toBe(false); // too short
    expect(isValidPhone('987654321099')).toBe(false); // too long
  });
});

describe('sanitizePhone', () => {
  it('strips non-digits and keeps only the last 10 digits', () => {
    expect(sanitizePhone('+91 98765 43210')).toBe('9876543210');
    expect(sanitizePhone('09876543210')).toBe('9876543210');
  });
});
