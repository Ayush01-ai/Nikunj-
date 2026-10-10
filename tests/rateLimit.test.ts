import { describe, expect, it } from 'vitest';
import { createRateLimiter, clientIp } from '@/backend/lib/rateLimit';

describe('createRateLimiter', () => {
  it('allows up to `max` hits within the window and then blocks', () => {
    const isLimited = createRateLimiter(3, 60_000);
    expect(isLimited('key-a')).toBe(false); // hit 1
    expect(isLimited('key-a')).toBe(false); // hit 2
    expect(isLimited('key-a')).toBe(false); // hit 3
    expect(isLimited('key-a')).toBe(true); // hit 4 -> blocked
  });

  it('tracks each key independently', () => {
    const isLimited = createRateLimiter(1, 60_000);
    expect(isLimited('user-1')).toBe(false);
    expect(isLimited('user-2')).toBe(false); // different key, not affected by user-1
    expect(isLimited('user-1')).toBe(true);
  });

  it('resets once the window has elapsed', async () => {
    const isLimited = createRateLimiter(1, 20);
    expect(isLimited('key-b')).toBe(false);
    expect(isLimited('key-b')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(isLimited('key-b')).toBe(false);
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
