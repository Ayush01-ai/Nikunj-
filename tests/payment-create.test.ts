import { describe, expect, it } from 'vitest';

// Razorpay checkout is retired — this route must now unconditionally return 410 without
// ever touching the Razorpay SDK, the database, or any request body/rate-limit state, so
// it stays safe to deploy with zero Razorpay credentials configured.
describe('POST /api/payment/create (Razorpay — retired)', () => {
  it('returns 410 Gone directing callers to Cashfree', async () => {
    const { POST } = await import('@/app/api/payment/create/route');
    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(410);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/retired/i);
  });
});
