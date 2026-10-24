import { client } from './client';

/**
 * Sanity read for statically rendered pages. No `next.revalidate`/`tags`: content is refreshed only
 * by a full Cloudflare rebuild (Deploy Hook), and the build script wipes `.next/cache` first so no
 * fetch result can carry over from a previous deployment.
 *
 * Failures are logged (visible in Cloudflare Observability) and then re-thrown instead of being
 * swapped for an empty fallback. A thrown error fails the build or keeps the previously cached
 * page during ISR, whereas a silent `[]`/`null` would be prerendered and cached as an empty site.
 */
export async function sanityFetch<T>(
  label: string,
  query: string,
  params: Record<string, string | number | boolean> = {},
): Promise<T> {
  if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) {
    console.error(`[sanity] ${label}: NEXT_PUBLIC_SANITY_PROJECT_ID is not set (build and runtime)`);
  }
  try {
    return await client.fetch<T>(query, params);
  } catch (err) {
    console.error(`[sanity] ${label} failed:`, err instanceof Error ? err.message : err);
    throw err;
  }
}
