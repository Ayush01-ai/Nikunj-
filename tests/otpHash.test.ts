import { afterEach, describe, expect, it } from 'vitest';
import { deliveryOtp, hashOtp, isHashedOtp, otpMatches } from '@/backend/lib/otpHash';

const ORIGINAL = process.env.OTP_HASH_SECRET;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.OTP_HASH_SECRET;
  else process.env.OTP_HASH_SECRET = ORIGINAL;
});

describe('otpHash', () => {
  it('stores codes as a keyed hash, never the plain digits', () => {
    const stored = hashOtp('123456');
    expect(isHashedOtp(stored)).toBe(true);
    expect(stored).not.toContain('123456');
    expect(hashOtp(stored)).toBe(stored);
  });

  it('matches the right code and rejects a wrong one', () => {
    const stored = hashOtp('654321');
    expect(otpMatches(stored, '654321')).toBe(true);
    expect(otpMatches(stored, '654320')).toBe(false);
    expect(otpMatches(stored, '')).toBe(false);
    expect(otpMatches(undefined, '654321')).toBe(false);
  });

  it('still accepts legacy plain-text records', () => {
    expect(otpMatches('111222', '111222')).toBe(true);
    expect(otpMatches('111222', '111223')).toBe(false);
  });

  it('refuses a submitted value that is itself a stored hash', () => {
    const stored = hashOtp('399000');
    expect(otpMatches(stored, stored)).toBe(false);
  });

  it('depends on the secret key', () => {
    process.env.OTP_HASH_SECRET = 'key-a';
    const a = hashOtp('123456');
    process.env.OTP_HASH_SECRET = 'key-b';
    expect(otpMatches(a, '123456')).toBe(false);
  });

  it('derives a stable 6-digit delivery OTP that changes with the token', () => {
    const one = deliveryOtp('NS-ABC', 'token-1');
    expect(one).toMatch(/^\d{6}$/);
    expect(deliveryOtp('NS-ABC', 'token-1')).toBe(one);
    expect(deliveryOtp('NS-ABC', 'token-2')).not.toBe(one);
    expect(deliveryOtp('NS-XYZ', 'token-1')).not.toBe(one);
  });
});