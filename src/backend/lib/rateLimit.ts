/** Best-effort, per-instance limiter: at most `max` hits per `windowMs` for each key. */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function isLimited(key: string) {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    const limited = recent.length >= max;
    if (!limited) recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return limited;
  };
}

export const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
