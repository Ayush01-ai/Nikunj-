import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';
import memoryQueue from '@opennextjs/cloudflare/overrides/queue/memory-queue';

// Prerendered pages are served straight from the Worker's static assets. This performs no
// Workers KV writes (the free tier allows only 1,000/day, which repeated deploys exhausted and
// which made every request re-render on the Worker). The cache is read-only, so content
// changes go live via a rebuild: /api/revalidate triggers CLOUDFLARE_DEPLOY_HOOK_URL.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  // No Cloudflare Queue is bound; an in-memory queue means a stale-page refresh can never crash.
  queue: memoryQueue,
});
