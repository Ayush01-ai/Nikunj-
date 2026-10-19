import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGuestPaymentProof, verifyGuestPaymentProof } from '@/backend/lib/guestPaymentProof';

describe('guestPaymentProof', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips: a proof minted for an orderId+phone verifies for that exact pair', () => {
    const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
    expect(verifyGuestPaymentProof(proof, 'NS-AAAAAAAA', '9876543210')).toBe(true);
  });

  it('normalizes phone formatting the same way on mint and verify', () => {
    const proof = createGuestPaymentProof('NS-AAAAAAAA', '+91 98765 43210');
    expect(verifyGuestPaymentProof(proof, 'NS-AAAAAAAA', '9876543210')).toBe(true);
  });

  it('rejects a proof checked against a different order id', () => {
    const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
    expect(verifyGuestPaymentProof(proof, 'NS-BBBBBBBB', '9876543210')).toBe(false);
  });

  it('rejects a proof checked against a different phone number', () => {
    const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
    expect(verifyGuestPaymentProof(proof, 'NS-AAAAAAAA', '9111111111')).toBe(false);
  });

  it('rejects a tampered token', () => {
    const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
    expect(verifyGuestPaymentProof(`${proof}x`, 'NS-AAAAAAAA', '9876543210')).toBe(false);
  });

  it('rejects missing, empty, or non-string tokens without throwing', () => {
    expect(verifyGuestPaymentProof(undefined, 'NS-AAAAAAAA', '9876543210')).toBe(false);
    expect(verifyGuestPaymentProof('', 'NS-AAAAAAAA', '9876543210')).toBe(false);
    expect(verifyGuestPaymentProof(12345, 'NS-AAAAAAAA', '9876543210')).toBe(false);
    expect(verifyGuestPaymentProof({ orderId: 'NS-AAAAAAAA' }, 'NS-AAAAAAAA', '9876543210')).toBe(false);
  });

  it('rejects an expired proof (TTL is 15 minutes)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
    vi.setSystemTime(new Date('2024-01-01T00:16:00Z')); // 16 minutes later
    expect(verifyGuestPaymentProof(proof, 'NS-AAAAAAAA', '9876543210')).toBe(false);
  });

  it('accepts a proof that is still within the TTL window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
    vi.setSystemTime(new Date('2024-01-01T00:14:00Z')); // 14 minutes later — still valid
    expect(verifyGuestPaymentProof(proof, 'NS-AAAAAAAA', '9876543210')).toBe(true);
  });
});
