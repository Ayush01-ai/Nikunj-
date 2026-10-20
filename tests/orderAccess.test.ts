import { describe, expect, it, vi } from 'vitest';

// authorizeOrderForPayment is a pure function, but orderAccess.ts also imports connectDB
// (used by verifyOrderAccess) at module scope, which throws if MONGODB_URI is unset.
// Mock it out so this file can exercise the pure logic without a real database.
vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn() }));

const { authorizeOrderForPayment } = await import('@/backend/lib/orderAccess');
const { createGuestPaymentProof } = await import('@/backend/lib/guestPaymentProof');

describe('authorizeOrderForPayment', () => {
  describe('registered (userId) orders', () => {
    it('allows the owning customer', () => {
      const order = { userId: 'user-1' };
      expect(authorizeOrderForPayment(order, 'user-1', undefined)).toEqual({ ok: true });
    });

    it('denies a different authenticated customer', () => {
      const order = { userId: 'user-1' };
      expect(authorizeOrderForPayment(order, 'user-2', undefined)).toEqual({
        ok: false,
        status: 403,
        error: 'Access denied.',
      });
    });

    it('denies an unauthenticated caller (guest) even if they guess the order id', () => {
      const order = { userId: 'user-1' };
      expect(authorizeOrderForPayment(order, undefined, undefined).ok).toBe(false);
    });

    it('is not satisfied by supplying a bare phone number — ownership is session-based for registered orders', () => {
      const order = { userId: 'user-1', shippingAddress: { phone: '9876543210' } };
      expect(authorizeOrderForPayment(order, undefined, '9876543210').ok).toBe(false);
    });

    it('is not satisfied by a guestPaymentProof — registered orders never accept the guest proof path', () => {
      const order = { userId: 'user-1', orderId: 'NS-AAAAAAAA', shippingAddress: { phone: '9876543210' } };
      const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
      expect(authorizeOrderForPayment(order, undefined, proof).ok).toBe(false);
    });
  });

  describe('guest orders (no userId)', () => {
    it('denies a bare phone number — a phone claim alone is no longer sufficient proof', () => {
      const order = { orderId: 'NS-AAAAAAAA', shippingAddress: { phone: '9876543210' } };
      expect(authorizeOrderForPayment(order, undefined, '9876543210')).toEqual({
        ok: false,
        status: 403,
        error: 'Access denied.',
      });
    });

    it('allows a valid guestPaymentProof for the shippingAddress phone used on the order', () => {
      const order = { orderId: 'NS-AAAAAAAA', shippingAddress: { phone: '9876543210' } };
      const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
      expect(authorizeOrderForPayment(order, undefined, proof)).toEqual({ ok: true });
    });

    it('allows a valid guestPaymentProof for the guestPhone used on the order', () => {
      const order = { orderId: 'NS-AAAAAAAA', guestPhone: '9876543210', shippingAddress: { phone: '9000000000' } };
      const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
      expect(authorizeOrderForPayment(order, undefined, proof)).toEqual({ ok: true });
    });

    it('tolerates formatting differences (spaces, +91 prefix) via sanitizePhone when the proof was minted for the sanitized number', () => {
      const order = { orderId: 'NS-AAAAAAAA', shippingAddress: { phone: '9876543210' } };
      const proof = createGuestPaymentProof('NS-AAAAAAAA', '+91 98765 43210');
      expect(authorizeOrderForPayment(order, undefined, proof)).toEqual({ ok: true });
    });

    it('denies when no proof is supplied', () => {
      const order = { orderId: 'NS-AAAAAAAA', shippingAddress: { phone: '9876543210' } };
      expect(authorizeOrderForPayment(order, undefined, undefined)).toEqual({
        ok: false,
        status: 403,
        error: 'Access denied.',
      });
    });

    it('denies a proof minted for a different phone number', () => {
      const order = { orderId: 'NS-AAAAAAAA', shippingAddress: { phone: '9876543210' } };
      const proof = createGuestPaymentProof('NS-AAAAAAAA', '9111111111');
      expect(authorizeOrderForPayment(order, undefined, proof).ok).toBe(false);
    });

    it('denies a proof minted for a different order id', () => {
      const order = { orderId: 'NS-AAAAAAAA', shippingAddress: { phone: '9876543210' } };
      const proof = createGuestPaymentProof('NS-BBBBBBBB', '9876543210');
      expect(authorizeOrderForPayment(order, undefined, proof).ok).toBe(false);
    });

    it('denies a tampered proof', () => {
      const order = { orderId: 'NS-AAAAAAAA', shippingAddress: { phone: '9876543210' } };
      const proof = createGuestPaymentProof('NS-AAAAAAAA', '9876543210');
      expect(authorizeOrderForPayment(order, undefined, `${proof}tampered`).ok).toBe(false);
    });

    it("never trusts an arbitrary userId claim for a guest order — authorization is proof-only", () => {
      const order = { orderId: 'NS-AAAAAAAA', shippingAddress: { phone: '9876543210' } };
      expect(authorizeOrderForPayment(order, 'some-other-user', undefined).ok).toBe(false);
    });
  });
});
