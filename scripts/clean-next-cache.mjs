// Runs before `next build` so every Cloudflare deployment downloads Sanity content from scratch.
// A restored `.next/cache` (fetch-cache, prerender data) could otherwise carry an old payload
// into a new build.
import { rmSync } from 'node:fs';

rmSync('.next/cache', { recursive: true, force: true });
console.log('[clean-next-cache] removed .next/cache');
