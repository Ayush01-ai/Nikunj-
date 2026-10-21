import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import kvIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache';
import kvNextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache';

// Workers KV (free tier) backs both the page cache and the tag cache, so
// revalidatePath()/revalidateTag() in /api/revalidate can invalidate pages on the edge.
// Bindings: NEXT_INC_CACHE_KV and NEXT_TAG_CACHE_KV (see wrangler.jsonc).
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: kvNextTagCache,
});
