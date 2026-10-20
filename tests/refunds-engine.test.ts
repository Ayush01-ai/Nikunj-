import { beforeEach, describe, expect, it, vi } from 'vitest';

type Op = { id: string; ops: Record<string, unknown>[] };
const state = vi.hoisted(() => ({ committed: [] as { id: string; ops: Record<string, unknown>[] }[], currentDoc: null as Record<string, unknown> | null, failRevision: false }));
const committed: Op[] = state.committed;
const { cashfree, razorpay, payouts, whatsapp, orderModel } = vi.hoisted(() => ({
  cashfree: { createCashfreeRefund: vi.fn(), fetchCashfreeRefund: vi.fn() },
  razorpay: { createRazorpayRefund: vi.fn(), fetchRazorpayRefund: vi.fn(), findRazorpayRefundByReceipt: vi.fn() },
  payouts: { createPayoutTransfer: vi.fn(), getPayoutTransfer: vi.fn(), isPayoutsConfigured: vi.fn(() => false) },
  whatsapp: { notifyOrder: vi.fn(async () => ({ sent: true, channel: 'email' })) },
  orderModel: { updateOne: vi.fn(async () => ({})) },
}));

function patchBuilder(id: string) {
  const entry: Op = { id, ops: [] };
  const b = {
    ifRevisionId: (rev: string) => (entry.ops.push({ ifRevisionId: rev }), b),
    set: (v: Record<string, unknown>) => (entry.ops.push({ set: v }), b),
    setIfMissing: (v: Record<string, unknown>) => (entry.ops.push({ setIfMissing: v }), b),
    unset: (v: string[]) => (entry.ops.push({ unset: v }), b),
    append: (path: string, v: unknown[]) => (entry.ops.push({ append: { path, v } }), b),
    commit: async () => {
      if (state.failRevision && entry.ops.some((o) => 'ifRevisionId' in o)) throw new Error('revision mismatch');
      committed.push(entry);
      return { _rev: `rev-${committed.length}` };
    },
  };
  return b;
}

vi.mock('@/cms/lib/client', () => ({
  writeClient: {
    fetch: vi.fn(async () => state.currentDoc),
    patch: vi.fn((id: string) => patchBuilder(id)),
  },
}));
vi.mock('@/backend/lib/sanityOrders', () => ({ sanityOrderId: (id: string) => `orders.${id}` }));
vi.mock('@/backend/lib/cashfree', () => cashfree);
vi.mock('@/backend/lib/razorpay', () => razorpay);
vi.mock('@/backend/lib/cashfreePayouts', async () => {
  class PayoutRequestError extends Error {
    constructor(message: string, public uncertain: boolean) {
      super(message);
    }
  }
  return { ...payouts, PayoutRequestError };
});
vi.mock('@/backend/lib/orderNotify', () => whatsapp);
vi.mock('@/backend/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock('@/backend/models/Order', () => ({ Order: orderModel }));

const { processRefund, refundReferenceId } = await import('@/backend/lib/refunds');

const allSets = () => committed.flatMap((c) => c.ops.filter((o) => 'set' in o).map((o) => o.set as Record<string, unknown>));
const lastState = () => [...allSets()].reverse().find((s) => 'refund.state' in s)?.['refund.state'];

const baseDoc = {
  _id: 'orders.NS-AB12CD34',
  _rev: 'rev-0',
  orderNumber: 'NS-AB12CD34',
  customerName: 'Ram Das',
  phone: '9876543210',
  total: 1200,
};

beforeEach(() => {
  committed.length = 0;
  state.failRevision = false;
  vi.clearAllMocks();
  payouts.isPayoutsConfigured.mockReturnValue(false);
  process.env.SANITY_API_TOKEN = 'test';
});

describe('processRefund', () => {
  it('refuses refunds the owner has not approved', async () => {
    state.currentDoc = { ...baseDoc, status: 'cancelled', paymentMethod: 'cod', paymentStatus: 'refund_due', refund: { state: 'details_submitted' } };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: false, status: 409 });
    expect(committed).toHaveLength(0);
  });

  it('falls back to a manual transfer for COD when Cashfree Payouts is not configured', async () => {
    state.currentDoc = {
      ...baseDoc,
      status: 'returned',
      paymentMethod: 'cod',
      paymentStatus: 'refund_due',
      refund: { state: 'approved', approvedDestination: { mode: 'upi', upiId: 'ram@okaxis' } },
    };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'manual' });
    expect(lastState()).toBe('manual');
    expect(payouts.createPayoutTransfer).not.toHaveBeenCalled();
  });

  it('pays COD refunds to the approved UPI ID via Cashfree Payouts', async () => {
    payouts.isPayoutsConfigured.mockReturnValue(true);
    payouts.createPayoutTransfer.mockResolvedValue({ outcome: 'success', cfTransferId: 'cf-t-1', utr: 'UTR123' });
    state.currentDoc = {
      ...baseDoc,
      status: 'returned',
      paymentMethod: 'cod',
      paymentStatus: 'refund_due',
      refund: { state: 'approved', amount: 800, approvedDestination: { mode: 'upi', upiId: 'ram@okaxis' } },
    };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'success' });
    expect(payouts.createPayoutTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: refundReferenceId('NS-AB12CD34', 1), amount: 800, mode: 'upi', upiId: 'ram@okaxis', name: 'Ram Das' }),
    );
    expect(allSets().at(-1)).toMatchObject({ 'refund.state': 'success', paymentStatus: 'refunded', status: 'refunded', 'refund.bankReference': 'UTR123' });
    expect(orderModel.updateOne).toHaveBeenCalledWith({ orderId: 'NS-AB12CD34' }, { $set: { paymentStatus: 'refunded', status: 'refunded' } });
    expect(whatsapp.notifyOrder).not.toHaveBeenCalled();
  });

  it('refunds online Cashfree payments back to source and keeps cancelled orders cancelled', async () => {
    cashfree.createCashfreeRefund.mockResolvedValue({ cf_refund_id: 'r1', refund_status: 'SUCCESS', refund_arn: 'ARN9' });
    state.currentDoc = {
      ...baseDoc,
      status: 'cancelled',
      paymentMethod: 'upi',
      paymentStatus: 'refund_due',
      cashfreeOrderId: 'cf_order',
      cashfreePaymentId: 'cf_pay',
      refund: { state: 'approved' },
    };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'success' });
    expect(cashfree.createCashfreeRefund).toHaveBeenCalledWith('cf_order', expect.objectContaining({ refundId: 'NSAB12CD34_R1', amount: 1200 }));
    expect(allSets().at(-1)).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });
    expect(whatsapp.notifyOrder).toHaveBeenCalledTimes(1);
  });

  it('refunds Razorpay payments back to source', async () => {
    razorpay.createRazorpayRefund.mockResolvedValue({ id: 'rfnd_1', status: 'pending' });
    state.currentDoc = {
      ...baseDoc,
      status: 'returned',
      paymentMethod: 'card',
      paymentGateway: 'razorpay',
      paymentStatus: 'refund_due',
      razorpayPaymentId: 'pay_1',
      refund: { state: 'approved' },
    };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'processing' });
    expect(razorpay.createRazorpayRefund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 1200, receipt: 'NSAB12CD34_R1' }));
  });

  it('keeps the refund processing (no retry) when the gateway result is uncertain', async () => {
    // Axios network error: the request left the server but no response came back.
    cashfree.createCashfreeRefund.mockRejectedValue(Object.assign(new Error('socket hang up'), { isAxiosError: true, request: {} }));
    state.currentDoc = { ...baseDoc, status: 'cancelled', paymentMethod: 'upi', paymentStatus: 'refund_due', cashfreeOrderId: 'o', cashfreePaymentId: 'p', refund: { state: 'approved' } };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'processing' });
    expect(lastState()).toBe('processing');
  });

  it('treats a Cashfree 5xx as uncertain too', async () => {
    cashfree.createCashfreeRefund.mockRejectedValue({ isAxiosError: true, response: { status: 502, data: { message: 'bad gateway' } } });
    state.currentDoc = { ...baseDoc, status: 'cancelled', paymentMethod: 'upi', paymentStatus: 'refund_due', cashfreeOrderId: 'o', cashfreePaymentId: 'p', refund: { state: 'approved' } };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'processing' });
  });

  it('marks the refund failed (not stuck) when Cashfree says the order does not exist under the current keys', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cashfree.createCashfreeRefund.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { message: 'order not found', code: 'order_not_found', type: 'invalid_request_error' } },
    });
    state.currentDoc = { ...baseDoc, status: 'cancelled', paymentMethod: 'upi', paymentStatus: 'refund_due', cashfreeOrderId: 'old_cf_order', cashfreePaymentId: 'p', refund: { state: 'approved' } };
    const result = await processRefund('NS-AB12CD34');
    expect(result).toMatchObject({ ok: true, state: 'failed' });
    expect(result.message).toMatch(/order not found[\s\S]*different API keys|older or different API keys/);
    expect(lastState()).toBe('failed');
    expect(allSets().at(-1)?.['refund.failureReason']).toContain('order not found');
    expect(allSets().at(-1)).not.toHaveProperty('paymentStatus'); // still refund_due, so it can be retried / marked refunded
    expect(log).toHaveBeenCalledWith('[refunds] gateway error', 'NS-AB12CD34', 'cashfree', 404, expect.stringContaining('order not found'));
    log.mockRestore();
  });

  it('marks the refund failed when Cashfree rejects the API keys', async () => {
    cashfree.createCashfreeRefund.mockRejectedValue({ isAxiosError: true, response: { status: 401, data: { message: 'authentication Failed' } } });
    state.currentDoc = { ...baseDoc, status: 'cancelled', paymentMethod: 'upi', paymentStatus: 'refund_due', cashfreeOrderId: 'o', cashfreePaymentId: 'p', refund: { state: 'approved' } };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'failed', message: expect.stringContaining('API keys (401)') });
  });

  it('fails (instead of waiting forever) when the request never left the server', async () => {
    cashfree.createCashfreeRefund.mockRejectedValue(new Error('Cashfree is not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY missing).'));
    state.currentDoc = { ...baseDoc, status: 'cancelled', paymentMethod: 'upi', paymentStatus: 'refund_due', cashfreeOrderId: 'o', cashfreePaymentId: 'p', refund: { state: 'approved' } };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'failed' });
    expect(lastState()).toBe('failed');
  });

  it('records an approved refund as failed when it cannot be sent at all', async () => {
    state.currentDoc = { ...baseDoc, status: 'cancelled', paymentMethod: 'upi', paymentStatus: 'refund_due', refund: { state: 'approved' } };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: false, status: 400, message: expect.stringContaining('No approved UPI / bank details') });
    expect(cashfree.createCashfreeRefund).not.toHaveBeenCalled();
    expect(lastState()).toBe('failed');

    committed.length = 0;
    state.currentDoc = { ...baseDoc, status: 'delivered', paymentMethod: 'upi', paymentStatus: 'paid', cashfreeOrderId: 'o', refund: { state: 'approved' } };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: false, status: 409 });
    expect(lastState()).toBe('failed');
    expect(committed[0].ops).toContainEqual({ ifRevisionId: 'rev-0' }); // never overwrites a newer state
  });

  it('marks the refund failed when the gateway rejects it', async () => {
    cashfree.createCashfreeRefund.mockRejectedValue({ response: { status: 400, data: { message: 'refund amount exceeds' } } });
    state.currentDoc = { ...baseDoc, status: 'cancelled', paymentMethod: 'upi', paymentStatus: 'refund_due', cashfreeOrderId: 'o', cashfreePaymentId: 'p', refund: { state: 'approved' } };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'failed', message: 'refund amount exceeds' });
    expect(lastState()).toBe('failed');
  });

  it('never sends money when another request already locked the order', async () => {
    state.failRevision = true;
    state.currentDoc = { ...baseDoc, status: 'cancelled', paymentMethod: 'upi', paymentStatus: 'refund_due', cashfreeOrderId: 'o', cashfreePaymentId: 'p', refund: { state: 'approved' } };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: false, status: 409 });
    expect(cashfree.createCashfreeRefund).not.toHaveBeenCalled();
  });

  it('reconciles a processing refund with a status lookup', async () => {
    cashfree.fetchCashfreeRefund.mockResolvedValue({ refund_status: 'SUCCESS', refund_arn: 'ARN1' });
    state.currentDoc = {
      ...baseDoc,
      status: 'returned',
      paymentMethod: 'upi',
      paymentStatus: 'refund_due',
      cashfreeOrderId: 'o',
      cashfreePaymentId: 'p',
      refund: { state: 'processing', source: 'cashfree', referenceId: 'NSAB12CD34_R1', attempt: 1 },
    };
    expect(await processRefund('NS-AB12CD34')).toMatchObject({ ok: true, state: 'success' });
    expect(cashfree.fetchCashfreeRefund).toHaveBeenCalledWith('o', 'NSAB12CD34_R1');
    expect(cashfree.createCashfreeRefund).not.toHaveBeenCalled();
  });
});
