/**
 * fetch() with a couple of retries for idempotent requests.
 *
 * On Cloudflare Workers a cold isolate can fail the first request ("Worker exceeded CPU time
 * limit" → 5xx / network error) while a retry hits the now-warm isolate and succeeds. Only
 * network failures and 5xx responses are retried; 4xx (e.g. 401 signed-out) return immediately.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  { retries = 2, delayMs = 600 }: { retries?: number; delayMs?: number } = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.status < 500 || attempt >= retries) return res;
    } catch (err) {
      if (attempt >= retries || init?.signal?.aborted) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
  }
}
