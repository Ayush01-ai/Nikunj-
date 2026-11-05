// Custom Worker entry: OpenNext's generated worker handles every HTTP request, and this wrapper adds the
// Cloudflare cron trigger that calls the order reconciliation endpoint (see "triggers" in wrangler.jsonc).
import openNextWorker from '../.open-next/worker.js';

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js';

const RECONCILE_URL = 'https://nikunjsakhi.in/api/cron/reconcile-orders';

export default {
  fetch: openNextWorker.fetch,

  async scheduled(_event, env, ctx) {
    if (!env.CRON_SECRET) {
      console.error('[cron] CRON_SECRET is not set; skipping order reconciliation');
      return;
    }
    const run = async () => {
      try {
        const res = await env.WORKER_SELF_REFERENCE.fetch(
          new Request(RECONCILE_URL, { method: 'POST', headers: { authorization: `Bearer ${env.CRON_SECRET}` } }),
        );
        const body = await res.text();
        console.log('[cron] reconcile-orders', res.status, body.slice(0, 500));
      } catch (e) {
        console.error('[cron] reconcile-orders failed', e instanceof Error ? e.message : e);
      }
    };
    ctx.waitUntil(run());
  },
};
