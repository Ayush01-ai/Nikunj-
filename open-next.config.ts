import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';
import memoryQueue from '@opennextjs/cloudflare/overrides/queue/memory-queue';
import type { CacheEntryType, CacheValue, IncrementalCache, WithLastModified } from '@opennextjs/aws/types/overrides.js';

const silentStaticAssetsIncrementalCache: IncrementalCache = {
  name: 'silent-static-assets-incremental-cache',
  get<CacheType extends CacheEntryType = 'cache'>(
    key: string,
    cacheType?: CacheType,
  ): Promise<WithLastModified<CacheValue<CacheType>> | null> {
    return staticAssetsIncrementalCache.get(key, cacheType);
  },
  async set<CacheType extends CacheEntryType = 'cache'>(
    key: string,
    value: CacheValue<CacheType>,
    cacheType?: CacheType,
  ): Promise<void> {
    void key;
    void value;
    void cacheType;
  },
  async delete(key: string): Promise<void> {
    void key;
  },
};

// Prerendered pages are served straight from the Worker's static assets. This performs no
// Workers KV writes (the free tier allows only 1,000/day, which repeated deploys exhausted and
// which made every request re-render on the Worker). The cache is read-only, so content
// changes go live via a rebuild: /api/revalidate triggers CLOUDFLARE_DEPLOY_HOOK_URL.
// Next.js can still attempt cache writes for fetches or RSC requests; those writes are ignored.
export default defineCloudflareConfig({
  incrementalCache: silentStaticAssetsIncrementalCache,
  tagCache: 'dummy',
  // No Cloudflare Queue is bound; an in-memory queue means a stale-page refresh can never crash.
  queue: memoryQueue,
});
