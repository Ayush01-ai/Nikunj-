import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from '@/frontend/lib/fetchRetry';

const res = (status: number) => new Response('{}', { status });

describe('fetchWithRetry', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries a cold-start 5xx and returns the successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchWithRetry('/api/auth/me', undefined, { delayMs: 1 });
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries network errors', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchWithRetry('/x', undefined, { delayMs: 1 })).status).toBe(200);
  });

  it('does not retry 4xx (e.g. signed out)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(401));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchWithRetry('/x', undefined, { delayMs: 1 })).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchWithRetry('/x', undefined, { retries: 2, delayMs: 1 })).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const failing = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', failing);
    await expect(fetchWithRetry('/x', undefined, { retries: 1, delayMs: 1 })).rejects.toThrow('offline');
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
