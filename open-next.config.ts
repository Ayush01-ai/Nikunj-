import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// Serves prerendered (SSG/ISR) pages straight from Workers static assets instead of
// re-rendering them on every request, which keeps CPU time low. Content refreshes on redeploy;
// swap in the R2 incremental cache if on-demand revalidation is needed.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
