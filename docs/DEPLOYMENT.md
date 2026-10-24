# Deployment Guide

Status: **not deployed.** The code builds and passes all checks, but hosting has not been
chosen or configured. Nothing in this guide has been executed against a live account.

## 1. What the app needs from a host

- **Next.js 16.3.8** (App Router, Turbopack build), npm, Node.js 20+ (tested locally on 24).
- A **Node.js server runtime** for API routes: Mongoose (TCP/TLS to MongoDB Atlas),
  `cashfree-pg`, `razorpay` (legacy), `bcryptjs`, `jsonwebtoken`.
- `src/middleware.ts` (Clerk). Next 16 prints a "middleware → proxy" deprecation warning at
  build time. **Keep `middleware.ts`**: it is still supported, and Cloudflare/OpenNext does not
  support the Node-runtime `proxy.ts`.
- ISR pages (`revalidate` 60 s–1 h on home, product, policy pages; collections are dynamic).
- `next/image` with remote Sanity CDN images.
- Inbound HTTPS webhooks: `/api/payment/cashfree/webhook`, `/api/webhooks/order-status`
  (Sanity), `/api/payment/webhook` (legacy Razorpay).
- Outbound HTTPS to Sanity, Cashfree (PG + Payouts), Clerk, Resend, MSG91, Meta.

Build/run commands (from `package.json`):

```powershell
npm ci
npm run build      # next build
npm start          # next start  (Node hosts)
```

## 2. Hosting options compared (free-first)

| Option | Works unchanged? | Cost | Verdict |
|---|---|---|---|
| **Cloudflare Workers via OpenNext** (`@opennextjs/cloudflare`) | Needs adapter + config (below). Mongoose works through `nodejs_compat` with caveats. | Free plan: 100k req/day but **10 ms CPU per request** — SSR + Clerk + Mongoose + bcrypt will exceed it. **Workers Paid: $5/month** (30 s CPU). | Viable on **Workers Paid**; not reliable on Free. Not yet build-verified (see §3.4). |
| **Vercel Hobby** | Yes, zero config. | Free (non-commercial use per Vercel terms; Pro $20/mo for commercial). | Lowest-risk technically. Check the commercial-use terms. |
| **Render / Railway / Fly.io / VPS** | Yes (`npm start`). | Render free sleeps after inactivity (slow first load, may miss webhook timing); paid ≈ $7/mo. | Simple and fully compatible. |
| **Cloudflare as DNS/CDN only** in front of any Node host | Yes. | Free. | Recommended in all cases: free DNS, TLS, caching, DDoS protection. |

**Recommendation:** Because Cloudflare is the preferred platform, use **Cloudflare Workers Paid
($5/month) with OpenNext**, after the preview verification in §3.4. If you need a completely
free option, use **Cloudflare DNS + Render/Vercel** — no code changes are needed.

## 3. Cloudflare Workers (OpenNext) — assessment and steps

### 3.1 Compatibility findings

| Area | Result |
|---|---|
| Adapter | `@opennextjs/cloudflare` is Cloudflare's supported path for Next.js 16 on Workers. `@cloudflare/next-on-pages` is deprecated — do not use it. |
| Middleware | `src/middleware.ts` (Clerk, edge-compatible) — supported. Do **not** migrate to `proxy.ts`. |
| API routes (`runtime = 'nodejs'`) | Run in Workers with the `nodejs_compat` flag. |
| MongoDB / Mongoose | Works via `node:net`/`node:tls` under `nodejs_compat`, but Workers can't keep a connection pool between requests reliably. Set `maxPoolSize` low (1–2) and keep short timeouts; expect a TLS handshake on many requests (+50–150 ms). |
| Clerk | Supported (edge SDK). Production instance needs DNS records on your domain. |
| Cashfree / Resend / MSG91 / Meta / Sanity | All plain HTTPS `fetch` — compatible. Webhook HMAC uses `crypto` (`nodejs_compat`). |
| `bcryptjs` | Pure JS — works, but CPU-heavy (exceeds the Free plan's 10 ms). |
| `next/image` | Needs Cloudflare Images binding **or** `images.unoptimized: true` (Sanity CDN already resizes via URL params). |
| ISR (`revalidate`) | Needs an incremental cache (R2 or KV) configured in `open-next.config.ts`; otherwise pages are re-rendered per request. |
| Embedded Sanity Studio (`/studio`) | Large bundle. Better to host Studio separately with `npm run sanity:deploy` (free `*.sanity.studio`). The refund API already accepts calls from `https://*.sanity.studio`. |
| Worker size | Check with `wrangler deploy --dry-run`. Free plan limit is much smaller than Paid; moving Studio out helps. |
| Free plan sufficiency | **No** — the 10 ms CPU limit per request is the blocker. Workers Paid is required. |

### 3.2 Files to add (when you choose Cloudflare)

These are not committed yet, because the adapter has not been installed or build-verified here.

`wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "nikunj-sakhi",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "observability": { "enabled": true }
}
```

`open-next.config.ts`

```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
export default defineCloudflareConfig();
```

`package.json` scripts

```json
"cf:build": "opennextjs-cloudflare build",
"cf:preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
"cf:deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy"
```

`next.config.mjs` — add at the end for local dev bindings:

```js
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
```

and set `images: { unoptimized: true, remotePatterns: [...] }` (or configure an Images binding).

### 3.3 Commands (run in WSL or CI — OpenNext recommends Linux/macOS, not native Windows)

```bash
npm i -D @opennextjs/cloudflare wrangler
npx wrangler login
npm run cf:preview            # local Workers runtime test
npx wrangler deploy --dry-run # check bundle size
# add every variable from docs/ENVIRONMENT-SETUP.md:
npx wrangler secret put MONGODB_URI     # (repeat for each server secret)
npm run cf:deploy
```

`NEXT_PUBLIC_*` variables are inlined at **build** time — set them in the build environment
(CI or shell) as well as in Wrangler `vars`.

### 3.4 What must be verified before going live on Cloudflare (BLOCKED here)

1. `cf:preview` builds and serves home, product, checkout, track-order.
2. A sandbox Cashfree payment completes and the webhook marks the order paid.
3. MongoDB Atlas accepts connections from Cloudflare (Atlas → Network Access → allow
   `0.0.0.0/0` with a strong password, since Workers have no fixed IP).
4. Clerk sign-in works on the Workers domain.
5. CPU time per request in Workers observability stays well within limits.

## 4. Steps common to every host

1. **Domain & DNS** — add the domain to Cloudflare (free). Point it to the host. Enable
   "Always use HTTPS".
2. **Environment** — enter every variable from `docs/ENVIRONMENT-SETUP.md`.
   `NEXT_PUBLIC_SITE_URL=https://<domain>`, `CASHFREE_ENVIRONMENT=PRODUCTION` (only after
   sandbox testing).
3. **MongoDB Atlas** — Network Access must allow the host (fixed IPs on a VPS, otherwise
   `0.0.0.0/0`). Enable Atlas backups (paid tiers) or schedule `mongodump`.
4. **Cashfree** — production webhook URL `https://<domain>/api/payment/cashfree/webhook`,
   events PAYMENT_SUCCESS / FAILED / USER_DROPPED. Whitelist the domain in Cashfree.
   For automatic COD refunds: Payouts keys + IP whitelist or 2FA public key.
5. **Clerk** — create a **production instance**, add its DNS records, set the allowed origin
   and Google OAuth credentials in the Clerk dashboard.
6. **Sanity** — Project → API → CORS origins: add `https://<domain>` (with credentials).
   Optionally `npm run sanity:deploy` for a hosted Studio. Studio users log in once more
   (Studio now uses token login so it can authorise refund sends).
7. **Sanity webhook** (optional, for WhatsApp order-status messages) → POST
   `https://<domain>/api/webhooks/order-status` with header `x-webhook-secret`.
7a. **Publishing Sanity content (required on Cloudflare).** Pages are built from Sanity at deploy
   time and served as static files, so a product/price/image change only appears after a
   rebuild. Set this up once:
   1. Cloudflare → Workers & Pages → `nikunj` → Settings → Builds → **Deploy Hooks** → create a
      hook for branch `main` and copy its URL.
   2. sanity.io/manage → API → Webhooks → **Create**: URL = that deploy hook URL, method POST,
      dataset `production`, trigger on Create/Update/Delete, filter
      `_type in ["product","category","productType","deity","fragrance","heroSlide","siteSettings","testimonial"]`.
      This calls Cloudflare directly (no Worker CPU), so it works on the Free plan.
   3. (Optional, alternative) add the hook URL as the secret `CLOUDFLARE_DEPLOY_HOOK_URL` so
      `/api/revalidate` can trigger it. It logs `CLOUDFLARE_DEPLOY_HOOK_URL missing` when unset.

   A rebuild takes ~3–5 minutes. Newly published products render on demand until then;
   edits to existing products, prices and listings appear once the rebuild finishes.
8. **Resend** — verify the sending domain (DNS records), set `EMAIL_FROM`.
9. **Meta WhatsApp** — business verification, approved templates.

## 5. Monitoring and recovery

- **Logs**: the host's log viewer (Workers observability / Vercel / Render). API routes log
  provider errors with a route prefix (`[cashfree webhook]`, `[refunds/process]` …) and never
  log secrets or OTPs in production.
- **Uptime**: a free monitor (e.g. UptimeRobot) on `/` and `/track-order`.
- **Payments**: after the Cashfree checkout closes, the checkout page asks the server to
  re-verify the payment with Cashfree (`/api/payment/cashfree/verify`), and the webhook confirms
  it independently. Both are idempotent. No order is marked paid from the browser alone.
- **Rollback**: Cloudflare (`wrangler rollback`), Vercel and Render all keep previous
  deployments; redeploy the previous version.
- **Data**: orders live in MongoDB (source of truth) and are mirrored to Sanity. Back up Atlas.
  Sanity keeps document history; `npx sanity dataset export production` takes a full backup.
