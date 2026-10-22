import { describe, expect, it } from 'vitest';
import {
  canSubmitPayoutDetails,
  clampRefundAmount,
  describePayout,
  maskAccount,
  maskUpi,
  refundExpected,
  refundLocked,
  refundSource,
  validatePayoutDetails,
} from '@/cms/lib/refunds';

describe('refundSource', () => {
  it('sends COD refunds to the customer account', () => {
    expect(refundSource({ paymentMethod: 'cod', cashfreeOrderId: 'x', cashfreePaymentId: 'y' })).toBe('payout');
  });
  it('refunds Cashfree payments back to source', () => {
    expect(refundSource({ paymentMethod: 'upi', cashfreeOrderId: 'cf', cashfreePaymentId: 'p' })).toBe('cashfree');
    expect(refundSource({ paymentMethod: 'card', paymentGateway: 'cashfree', cashfreeOrderId: 'cf', cashfreePaymentId: 'p' })).toBe('cashfree');
  });
  it('refunds Razorpay payments back to source', () => {
    expect(refundSource({ paymentMethod: 'upi', paymentGateway: 'razorpay', razorpayPaymentId: 'pay_1' })).toBe('razorpay');
  });
  it('falls back to a payout when no gateway payment is on record', () => {
    expect(refundSource({ paymentMethod: 'upi' })).toBe('payout');
    expect(refundSource({ paymentMethod: 'upi', cashfreeOrderId: 'cf' })).toBe('payout');
  });
});

describe('refundExpected', () => {
  it('is true for refund_due and approved returns of paid orders', () => {
    expect(refundExpected({ paymentStatus: 'refund_due', status: 'cancelled' })).toBe(true);
    expect(refundExpected({ paymentStatus: 'paid', status: 'return_approved' })).toBe(true);
    expect(refundExpected({ paymentStatus: 'paid', status: 'returned' })).toBe(true);
  });
  it('is false for unpaid, delivered or already refunded orders', () => {
    expect(refundExpected({ paymentStatus: 'pending', status: 'cancelled' })).toBe(false);
    expect(refundExpected({ paymentStatus: 'paid', status: 'delivered' })).toBe(false);
    expect(refundExpected({ paymentStatus: 'refunded', status: 'returned' })).toBe(false);
  });
});

describe('canSubmitPayoutDetails', () => {
  const cod = { paymentMethod: 'cod', paymentStatus: 'refund_due', status: 'cancelled' };
  it('allows COD customers to share details until the owner approves', () => {
    expect(canSubmitPayoutDetails(cod)).toBe(true);
    expect(canSubmitPayoutDetails({ ...cod, refund: { state: 'details_submitted' } })).toBe(true);
    expect(canSubmitPayoutDetails({ ...cod, refund: { state: 'failed' } })).toBe(true);
    for (const state of ['approved', 'processing', 'manual', 'success'] as const) {
      expect(refundLocked({ state })).toBe(true);
      expect(canSubmitPayoutDetails({ ...cod, refund: { state } })).toBe(false);
    }
  });
  it('is not offered for back-to-source refunds', () => {
    expect(canSubmitPayoutDetails({ ...cod, paymentMethod: 'upi', cashfreeOrderId: 'a', cashfreePaymentId: 'b' })).toBe(false);
  });
});

describe('validatePayoutDetails', () => {
  it('accepts and normalises a UPI ID', () => {
    expect(validatePayoutDetails({ mode: 'upi', upiId: '  Ram.Das@OkAxis ' })).toEqual({ ok: true, details: { mode: 'upi', upiId: 'ram.das@okaxis' } });
  });
  it('rejects malformed UPI IDs', () => {
    expect(validatePayoutDetails({ mode: 'upi', upiId: 'ramdas' }).ok).toBe(false);
    expect(validatePayoutDetails({ mode: 'upi', upiId: 'a@1bank' }).ok).toBe(false);
  });
  it('accepts a bank account and uppercases IFSC', () => {
    expect(
      validatePayoutDetails({ mode: 'bank', accountHolder: 'Ram  Das', accountNumber: '1234 5678 9012', confirmAccountNumber: '123456789012', ifsc: 'sbin0001234' }),
    ).toEqual({ ok: true, details: { mode: 'bank', accountHolder: 'Ram Das', accountNumber: '123456789012', ifsc: 'SBIN0001234' } });
  });
  it('rejects mismatched account numbers, bad IFSC and bad names', () => {
    const base = { mode: 'bank', accountHolder: 'Ram Das', accountNumber: '123456789012', confirmAccountNumber: '123456789012', ifsc: 'SBIN0001234' };
    expect(validatePayoutDetails({ ...base, confirmAccountNumber: '123456789013' })).toMatchObject({ ok: false, error: expect.stringMatching(/match/) });
    expect(validatePayoutDetails({ ...base, ifsc: 'SBIN1001234' }).ok).toBe(false);
    expect(validatePayoutDetails({ ...base, accountNumber: '12345', confirmAccountNumber: '12345' }).ok).toBe(false);
    expect(validatePayoutDetails({ ...base, accountHolder: 'R4m' }).ok).toBe(false);
    expect(validatePayoutDetails({ mode: 'cash' }).ok).toBe(false);
  });
});

describe('masking', () => {
  it('hides most of the account / UPI ID', () => {
    expect(maskAccount('123456789012')).toBe('••••••••9012');
    expect(maskUpi('ramdas@okaxis')).toBe('ra••••@okaxis');
    expect(describePayout({ mode: 'bank', accountNumber: '123456789012', ifsc: 'SBIN0001234', accountHolder: 'Ram' })).not.toContain('123456789012');
    expect(describePayout({ mode: 'upi', upiId: 'ramdas@okaxis' }, true)).toContain('ramdas@okaxis');
  });
});

describe('clampRefundAmount', () => {
  it('defaults to the order total and never exceeds it', () => {
    expect(clampRefundAmount(undefined, 399)).toBe(399);
    expect(clampRefundAmount(0, 399)).toBe(399);
    expect(clampRefundAmount(-5, 399)).toBe(399);
    expect(clampRefundAmount(5000, 399)).toBe(399);
    expect(clampRefundAmount('450.555', 999)).toBe(450.56);
  });
});

import { deliveryChargeNotice, refundBreakdown } from '@/cms/lib/refunds';

describe('refundBreakdown (delivery / COD charge)', () => {
  it('keeps the delivery charge back by default and refunds the item value', () => {
    const b = refundBreakdown({ total: 1049, deliveryCharge: 99 });
    expect(b).toEqual({ total: 1049, deliveryCharge: 99, itemsOnly: 950, expected: 950, deducted: 99 });
    expect(deliveryChargeNotice(b)).toMatch(/₹99 is non-refundable[\s\S]*₹950/);
  });

  it('refunds everything when the owner chooses to refund delivery too', () => {
    const b = refundBreakdown({ total: 1049, deliveryCharge: 99 }, true);
    expect(b.expected).toBe(1049);
    expect(b.deducted).toBe(0);
    expect(deliveryChargeNotice(b)).toBe('');
  });

  it('refunds in full when there was no delivery charge, and never goes negative', () => {
    expect(refundBreakdown({ total: 500, deliveryCharge: 0 }).expected).toBe(500);
    expect(refundBreakdown({ total: 50, deliveryCharge: 99 })).toMatchObject({ deliveryCharge: 50, itemsOnly: 0, expected: 50, deducted: 0 });
  });
});