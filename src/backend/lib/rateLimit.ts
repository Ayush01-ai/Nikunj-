/**
 * Rate limiter: at most `max` hits per `windowMs` for each key.
 *
 * Two layers:
 *  1. A process-local sliding window (instant, always available).
 *  2. A shared fixed-window counter in MongoDB (`ratelimits` collection, TTL-cleaned) so the limit
 *     holds across every server instance. It is used whenever the app already has an open MongoDB
 *     connection; if MongoDB is unreachable or slow the limiter falls back to layer 1 rather than
 *     blocking customers.
 *
 * `name` namespaces the shared counters so two limiters keyed by the same value (e.g. an IP)
 * don't share a budget.
 */
export type RateLimiter = ((key: string) => Promise<boolean>) & { retryAfterSeconds: (key: string) => number };

const SHARED_TIMEOUT_MS = 1500;
let indexReady: Promise<unknown> | null = null;

interface CounterDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}

/** Returns null when the shared store isn't usable right now. */
async function sharedHit(id: string, max: number, windowMs: number): Promise<{ limited: boolean; retryAfter: number } | null> {
  try {
    const mongoose = (await import('mongoose')).default;
    const conn = mongoose.connection;
    if (conn.readyState !== 1 || !conn.db) return null;
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const windowEnd = (bucket + 1) * windowMs;
    const col = conn.db.collection<CounterDoc>('ratelimits');
    indexReady ??= col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {
      indexReady = null;
    });
    const op = col.findOneAndUpdate(
      { _id: `${id}:${bucket}` },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd + 60_000) } },
      { upsert: true, returnDocument: 'after' },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), SHARED_TIMEOUT_MS);
    });
    const doc = await Promise.race([op, timeout]).finally(() => clearTimeout(timer));
    if (!doc) return null;
    return { limited: doc.count > max, retryAfter: Math.max(1, Math.ceil((windowEnd - now) / 1000)) };
  } catch {
    return null;
  }
}

export function createRateLimiter(max: number, windowMs: number, name = `rl:${max}:${windowMs}`): RateLimiter {
  const hits = new Map<string, number[]>();
  const sharedRetry = new Map<string, number>();

  function localHit(key: string) {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    const limited = recent.length >= max;
    if (!limited) recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return limited;
  }

  const isLimited = (async (key: string) => {
    if (localHit(key)) return true;
    const shared = await sharedHit(`${name}:${key}`, max, windowMs);
    if (shared?.limited) {
      if (sharedRetry.size > 5000) sharedRetry.clear();
      sharedRetry.set(key, shared.retryAfter);
      return true;
    }
    sharedRetry.delete(key);
    return false;
  }) as RateLimiter;

  // How many seconds a caller who was just blocked should wait. Call with the same key right after
  // `isLimited` returned true for it.
  isLimited.retryAfterSeconds = (key: string) => {
    const shared = sharedRetry.get(key);
    const recent = hits.get(key) ?? [];
    if (recent.length === 0) return shared ?? Math.ceil(windowMs / 1000);
    const oldest = Math.min(...recent);
    const local = Math.max(1, Math.ceil((oldest + windowMs - Date.now()) / 1000));
    return shared ? Math.max(shared, local) : local;
  };
  return isLimited;
}

/**
 * Best-effort caller IP for rate-limit keying. `x-forwarded-for`/`x-real-ip` are set by a
 * reverse proxy (e.g. Vercel's edge network) in normal deployment, but nothing stops a
 * direct caller from sending arbitrary values for these headers if the app is ever
 * reachable without going through that proxy. Treat the result as a coarse, spoofable
 * hint — fine for throttling abusive retries, not a hard identity/security boundary. Callers
 * that need a non-spoofable scope (e.g. a specific order) should key on that instead of,
 * or in addition to, this value.
 */
export const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
