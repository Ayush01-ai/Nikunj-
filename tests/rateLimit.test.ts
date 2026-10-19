import { describe, expect, it } from 'vitest';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';

describe('createRateLimiter', () => {
  it('allows up to `max` hits within the window and then blocks', async () => {
    const isLimited = createRateLimiter(3, 60_000);
    expect(await isLimited('key-a')).toBe(false); // hit 1
    expect(await isLimited('key-a')).toBe(false); // hit 2
    expect(await isLimited('key-a')).toBe(false); // hit 3
    expect(await isLimited('key-a')).toBe(true); // hit 4 -> blocked
  });

  it('tracks each key independently', async () => {
    const isLimited = createRateLimiter(1, 60_000);
    expect(await isLimited('user-1')).toBe(false);
    expect(await isLimited('user-2')).toBe(false); // different key, not affected by user-1
    expect(await isLimited('user-1')).toBe(true);
  });

  it('resets once the window has elapsed', async () => {
    const isLimited = createRateLimiter(1, 500);
    expect(await isLimited('key-b')).toBe(false);
    expect(await isLimited('key-b')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await isLimited('key-b')).toBe(false);
  });
});

describe('createRateLimiter.retryAfterSeconds', () => {
  it('defaults to the full window for a key that has never been hit', async () => {
    const windowMs = 60_000;
    const isLimited = createRateLimiter(2, windowMs);
    expect(isLimited.retryAfterSeconds('fresh-key')).toBe(Math.ceil(windowMs / 1000));
  });

  it('returns a positive value, bounded by the window, once a key is limited', async () => {
    const windowMs = 60_000;
    const isLimited = createRateLimiter(1, windowMs);
    await isLimited('key-c');
    expect(await isLimited('key-c')).toBe(true); // now limited

    const retryAfter = isLimited.retryAfterSeconds('key-c');
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(Math.ceil(windowMs / 1000));
  });

  it('shrinks as the oldest hit in the window ages toward expiry', async () => {
    const isLimited = createRateLimiter(1, 200);
    await isLimited('key-d');
    await isLimited('key-d'); // now limited
    const first = isLimited.retryAfterSeconds('key-d');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = isLimited.retryAfterSeconds('key-d');
    expect(second).toBeLessThanOrEqual(first);
  });
});

describe('clientIp', () => {
  it('prefers the first address in x-forwarded-for', () => {
    const req = new Request('https://example.test', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    });
    expect(clientIp(req)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip, then "unknown"', () => {
    const withRealIp = new Request('https://example.test', { headers: { 'x-real-ip': '198.51.100.2' } });
    expect(clientIp(withRealIp)).toBe('198.51.100.2');

    const withNeither = new Request('https://example.test');
    expect(clientIp(withNeither)).toBe('unknown');
  });
});
