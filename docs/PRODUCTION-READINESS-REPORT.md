# Production Readiness Report — Nikunj Sakhi

Audit date: 2026-10-17 · Branch `feature/clerk-resend-whatsapp-cashfree` · HEAD `e111463`
(unchanged; all work is uncommitted) · Next.js 16.3.8 · Node 24.

This report replaces all earlier readiness/hardening summaries. Where older docs disagree
(e.g. "Razorpay active", "lint broken", "Cloudflare impossible"), **this report is current**.

## A. Executive summary

| Dimension | Verdict |
|---|---|
| **Code readiness** | **READY WITH LIMITATIONS**: type-check, 258 tests, lint (0 errors) and production build all pass. The limitations from the first audit (oversell race, per-instance rate limits, no CSP, plain-text OTPs, `CASHFREE_ENV`, unused Cloudinary) are now fixed — see §Q. Remaining items are documented and non-critical (§L). |
| **Live-provider readiness** | **BLOCKED**: Cashfree production, Cashfree Payouts, Clerk production instance, Resend domain, MSG91/WhatsApp templates and production Atlas/Sanity tokens need owner accounts and credentials. |
| **Deployment readiness** | **BLOCKED**: no host chosen or configured. Cloudflare Workers works via OpenNext on **Workers Paid ($5/mo)**; the Free plan's 10 ms CPU limit is insufficient. Config and steps are in `DEPLOYMENT.md`. |

**Overall: BLOCKED (external setup only).** No code-level critical or high issue remains open.

## B. Requirement status

| # | Requirement | Status | Evidence / verification | Key files | Remaining action |
|---|---|---|---|---|---|
| 1 | Authentication & authorisation | PASS | Server-side `requireAuthHybrid`/`requireAdminHybrid` (Clerk or legacy JWT, HS256-pinned). Admin role derived server-side from Sanity admin phones. **Fixed:** `/api/refunds/process` was unauthenticated → now Studio-token or site-admin only (9 tests). | `backend/lib/clerk.ts`, `auth.ts`, `session.ts`, `studioAuth.ts` | — |
| 2 | Registration, sign-in, logout, account | PARTIAL | Legacy phone/email/WhatsApp OTP login, Clerk email/Google, logout, `/account` exist. Auth unit tests pass. Clerk dev instance answers (HTTP 200). No end-to-end login test run (would need real OTP/email). | `api/auth/*`, `app/account`, `sign-in`, `sign-up` | Test live sign-in after Clerk production setup. |
| 3 | Guest checkout & order tracking | PASS | Guests pay online only after OTP proof (15-min signed token bound to order + phone). Track-order needs order ID + phone, is rate-limited and returns a reduced view (masked address/refund destination). **Fixed:** cancel/return requests required only order ID + phone → now need guest OTP proof or owner login (7 tests). | `orderAccess.ts`, `guestPaymentProof.ts`, `api/orders/request`, `api/track-order`, `OrderRequestPanel.tsx`, `GuestOtpGate.tsx` | — |
| 4 | Cashfree create / verify / webhook | PASS (code) · BLOCKED (live) | Amount from DB order total; `order_id` = internal ID; verify + webhook check order ID, INR and amount; webhook HMAC over `timestamp + rawBody` with the secret; mocked tests. | `api/payment/cashfree/*`, `backend/lib/cashfree*.ts`, tests `payment-cashfree-*`, `cashfree-*` | Sandbox end-to-end + production keys. |
| 5 | Payment idempotency & stock | PASS | Paid transition is conditional (`paymentStatus != paid`). Sanity confirm uses deterministic `orders.<id>` doc + transaction, so stock is decremented once. **Fixed:** order creation now re-checks stock under a per-product lock and counts units held by unpaid orders from the last 30 min, so the last unit can't be sold twice (409 "just sold out"). | `api/orders`, `backend/lib/stockHold.ts`, `backend/lib/sanityOrders.ts` | — |
| 6 | MongoDB Atlas | PASS (code) · BLOCKED (prod cluster) | Cached connection, `bufferCommands:false`, 10 s timeouts, typed DB-unavailable errors (503) with tests. | `backend/lib/mongodb.ts`, tests `mongodb-*`, `orders-db-unavailable` | Production cluster, network access, backups. |
| 7 | Sanity catalog / pricing / variants / stock / Studio | PASS | Prices, coupons and shipping recomputed server-side from Sanity. Write token server-only. Studio tools: Orders Dashboard, Analytics. Product page + related-products query verified in the browser earlier this session. | `cms/*`, `sanity.config.ts`, `api/orders/route.ts` | Add production domain to Sanity CORS. |
| 8 | Clerk | PARTIAL / BLOCKED | Middleware pass-through when keys are absent; Clerk users linked to Mongo users without trusting client metadata. Dev keys present locally. | `middleware.ts`, `clerk.ts`, `clerkConfig.ts` | Production instance + DNS. |
| 9 | Resend email | PASS (code) · BLOCKED (live) | Server-only `fetch` to Resend; skipped safely when unconfigured; errors logged without secrets. Not configured locally. | `backend/lib/email.ts` | Verify domain, set keys. |
| 10 | MSG91 / WhatsApp OTP | PASS (code) · BLOCKED (live) | Expiry (TTL index), max 5 attempts, 60 s resend throttle, per-IP limits, constant-time compare, order-scoped guest OTPs; production fails closed with no provider. Tests for guest send/confirm. | `api/auth/*otp*`, `api/payment/guest-verify/*`, `models/Otp.ts` | Template approval / MSG91 keys. |
| 11 | Rate limiting & abuse prevention | PASS | Rate limits on OTP, orders, payment, track-order, requests, refunds and delivery codes. **Fixed:** limits are now shared across instances through a MongoDB counter (`ratelimits`, TTL), with the in-memory window as a fast first check. | `backend/lib/rateLimit.ts` | — |
| 12 | Input validation & errors | PASS | Order ID regex, phone normalisation, payout detail validation (UPI/IFSC/account), image-type sniffing on uploads, generic 404 to prevent enumeration, safe error messages. | various routes, `cms/lib/refunds.ts` | — |
| 13 | Secrets & environment | PASS | `.env.local` ignored; example matches the code. **Fixed:** `CASHFREE_ENV` is now accepted as an alias of `CASHFREE_ENVIRONMENT`. New: `OTP_HASH_SECRET` (falls back to `JWT_SECRET`; production refuses to run OTP code without one), `WHATSAPP_DELIVERY_OTP_TEMPLATE` (optional). | `.env.local.example`, `ENVIRONMENT-SETUP.md` | — |
| 14 | Headers, cookies, authz | PASS | HSTS, nosniff, Referrer-Policy, Permissions-Policy (Cashfree only), X-Frame-Options; cookie `httpOnly`, `sameSite=lax`, `secure` in production. **Fixed:** Content-Security-Policy on every site page (Studio excluded) allowing only Clerk, Cashfree, Google Analytics and Sanity; verified in the browser with no violations. | `next.config.mjs`, `session.ts` | Re-check the browser console once the production Clerk domain is live. |
| 15 | Mobile & essential flows | PARTIAL | At mobile width: `/`, `/products`, a product page, `/collections`, `/checkout`, `/track-order`, `/login`, `/wishlist` all return 200 with no horizontal overflow. No automated E2E suite. | — | Manual purchase walkthrough on a phone after deployment. |
| 16 | Next.js runtime & Cloudflare | PARTIAL | Compatible via OpenNext + `nodejs_compat` on Workers Paid; not build-verified (needs WSL/CI + adapter install). Free plan insufficient. | `DEPLOYMENT.md` §3 | Choose host; run `cf:preview`. |
| 17 | Build, tests, lint, types | PASS | See §G. | — | — |
| 18 | Deployment, domain, monitoring, recovery | BLOCKED | Documented in `DEPLOYMENT.md` §4–5; nothing configured. | — | Owner action. |
| 19 | Client handover / Sanity management | PASS | `CLIENT-HANDOVER.md`; products, stock, coupons, admins, orders, refunds, analytics all managed in Studio. | — | — |
| 20 | Dependencies / obsolete code / paid services | PARTIAL | Razorpay retired for new payments (410) but kept for historical refunds. **Fixed:** unused `next-cloudinary`/`cloudinary` removed. Remaining `npm audit` items are dev/CLI tooling (see §L). | `package.json` | Remove Razorpay once no historical Razorpay refunds remain. |

## C. Already complete before this run

Cashfree-only checkout with server-side totals, signature-verified idempotent webhook, guest
OTP proof for online payment, Razorpay retired (410), Clerk + legacy JWT hybrid auth, OTP
limits, Mongo error handling, Sanity order mirroring with single stock decrement, refunds
(back-to-source for online; UPI/bank payouts for COD), product suggestions, footfall/lead
analytics, Orders Dashboard date filters + all-products view. Baseline: tsc ✔, 157 tests ✔,
lint 0 errors / 26 warnings, build ✔ (53 pages), `git diff --check` clean.

## D. Incomplete or broken (found in this audit)

1. **`/api/refunds/process` had no authentication.** Impact was limited (it only acts on
   refunds already *approved* in Studio and is idempotent), but anyone could trigger sends or
   status checks.
2. **Cancel/return requests (`/api/orders/request`) were authorised by order ID + phone only**,
   even for account orders — someone who knew both could cancel an order or upload photos.
3. `next.config.mjs` still exposed `NEXT_PUBLIC_RAZORPAY_KEY_ID` to the browser bundle.
4. `.env.local.example` listed 14 unused variables (Cloudinary, Firebase, SMTP, ADMIN_*,
   Instagram, WhatsApp number).
5. `source-map-js` < 1.2.2 (high, DoS) in the dependency tree.
6. Docs were contradictory and stale.

## E. Implemented and fixed

| Fix | Files |
|---|---|
| Refund processing requires a **Sanity Studio login token** (verified with Sanity `/users/me`; roles administrator/editor/developer; 5-min hashed cache; fails closed) **or** a website admin session. CORS only for `https://*.sanity.studio`. | `src/backend/lib/studioAuth.ts` (new), `src/app/api/refunds/process/route.ts` |
| Studio switched to token login so the dashboard can send the user's token; dashboard sends it with refund calls. | `sanity.config.ts`, `src/cms/tools/OrdersDashboard.tsx` |
| Cancel/return requests require **guest OTP proof** or **owner login**. Track-order returns `verifyWith`; the request panel shows an OTP step (guests) or a login prompt (account orders). Reusable OTP component. | `src/app/api/orders/request/route.ts`, `src/app/api/track-order/route.ts`, `src/frontend/components/orders/OrderRequestPanel.tsx`, `GuestOtpGate.tsx` (new), `src/app/track-order/page.tsx` |
| Removed stale Razorpay public key passthrough. | `next.config.mjs` |
| Env template cleaned to exactly the variables the code reads. | `.env.local.example` |
| `source-map-js` 1.2.1 → 1.2.2 (in-range patch, lockfile only). | `package-lock.json` |
| Tests: 9 for refund auth/CORS, 7 for request ownership proof. | `tests/refunds-process-auth.test.ts`, `tests/order-request-auth.test.ts` |
| Documentation rewritten. | `docs/PRODUCTION-READINESS-REPORT.md`, `DEPLOYMENT.md`, `ENVIRONMENT-SETUP.md`, `CLIENT-HANDOVER.md` |

## F. Blocked by accounts / credentials / approvals

Cashfree production KYC + live keys + webhook · Cashfree Payouts activation + IP whitelist/2FA
key · Clerk production instance + DNS · Resend domain verification · Meta WhatsApp business
verification + template approval and/or MSG91 DLT template · production MongoDB Atlas cluster
+ network access + backups · Sanity production CORS + editor token · hosting account and plan ·
domain DNS.

## G. Commands run and actual results (final run, after all changes)

| Command | Result |
|---|---|
| `npx tsc --noEmit -p .` | exit 0 |
| `npx vitest run` | **25 files, 258 tests passed** (first audit 20 / 173; baseline 18 / 157) |
| `npx eslint .` | exit 0 — 0 errors, 26 warnings (all pre-existing, unchanged) |
| `npx next build` | exit 0 — compiled, includes the new `/deliver/[token]` page. Only warning: middleware→proxy deprecation (intentional, §K). |
| `git diff --check` | clean (only CRLF conversion notices) |
| `npm audit --omit=dev` | 15 (2 critical, 12 high, 1 moderate) — unchanged; full `npm audit` 21 (adds dev-only tooling advisories) — see §L |
| Browser check (dev server) | Home, product page and `/deliver` at 390 px: no CSP violations (only the expected logged-out `401 /api/auth/me`) |
| Mobile spot-check (390 px, dev server) | 8 key pages 200, no horizontal overflow |

## H. Cashfree readiness

Tested with mocks: order creation from DB total, auth for guest/registered payers, verify
(PAID/PENDING/FAILED, amount/currency/order mismatch), webhook signature (valid, tampered,
re-serialised, malformed, missing headers, secret not configured), duplicate and concurrent
webhooks (single paid transition, single Sanity sync), FAILED/USER_DROPPED handling,
configuration validation.
**Not tested:** real sandbox or production payments (prohibited in this run), Payouts against
Cashfree. Before go-live: one sandbox order end-to-end, one sandbox refund, then production keys
with `CASHFREE_ENVIRONMENT=PRODUCTION` and a low-value live order.

## I. Clerk readiness

Code path complete and pass-through when unconfigured; identity linking never trusts client
metadata; admin role recomputed server-side. Dev instance reachable. Needs a production
instance (`pk_live`/`sk_live`), DNS records, Google OAuth credentials in Clerk and the allowed
origin. Legacy JWT login remains as a fallback (`ns_token`, HS256, httpOnly).

## J. MongoDB and Sanity readiness

MongoDB: connection, timeouts and failure handling verified by tests; local cluster reachable.
On Cloudflare Workers, lower `maxPoolSize` (1–2). Sanity: catalog/pricing authoritative, tokens
server-only, Studio tools working; no live data was modified in this audit.

## K. Cloudflare compatibility

Supported route is **OpenNext (`@opennextjs/cloudflare`) on Workers** with `nodejs_compat`.
Keep `src/middleware.ts` (Node-runtime `proxy.ts` is not supported there). Mongoose works with
per-request connection caveats. `next/image` needs `unoptimized` or an Images binding; ISR
needs an R2/KV cache. **Free plan: insufficient** (10 ms CPU/request). **Workers Paid ($5/mo):
suitable.** Host Studio via `sanity deploy` to shrink the Worker. The adapter was not installed
or built here (OpenNext recommends Linux/WSL) — full config and verification steps are in
`DEPLOYMENT.md` §3.

## L. Known risks and limitations

| Risk | Severity | Note |
|---|---|---|
| `npm audit` remaining 15 (runtime tree) / 21 (incl. dev) | Low (runtime) | `sanity`/`@sanity/cli`/`next-sanity`/`@sanity/vision` chain (braces, micromatch, chokidar, globby, fast-glob) affects the Studio/CLI build tooling; `braces` has no patched release and the only other "fix" is downgrading Sanity (breaking). `vitest`/`tinypool`/`@vitest/mocker` are test-only; fix requires vitest 5 (major). The 6 extra in the full audit are the same dev tooling (tailwind 3 → postcss-selector-parser, Sanity CLI). None run in the deployed request path. Re-check after the next Sanity/vitest releases. |
| Delivery OTP depends on WhatsApp | Low | If the automatic WhatsApp fails, the dashboard shows the code so the owner can send it by hand; "Mark delivered without OTP" stays available (with a confirmation). |
| Studio users must re-login | Info | Due to token login mode. |
| Snyk scan | Not run | The Snyk tool is not available in this environment; new code was reviewed manually and covered by tests. |

## M. Environment variables

See [ENVIRONMENT-SETUP.md](./ENVIRONMENT-SETUP.md) for every name, scope, consumer and
dashboard source, and [PROVIDER-SETUP-GUIDE.md](./PROVIDER-SETUP-GUIDE.md) for click-by-click
provider steps.

## N. Prioritised pre-production checklist

1. Prefer the name `CASHFREE_ENVIRONMENT` (the old `CASHFREE_ENV` still works), and set `OTP_HASH_SECRET`.
2. Choose hosting (Cloudflare Workers Paid recommended) and add the domain to Cloudflare DNS.
3. Production MongoDB Atlas + network access + backups.
4. Sanity: production CORS origin, editor token; Studio users re-login.
5. OTP channel live (MSG91 and/or WhatsApp templates approved).
6. Cashfree sandbox end-to-end test → production keys + webhook → live low-value test.
7. Clerk production instance + DNS; Resend domain.
8. Optional: Cashfree Payouts for automatic COD refunds.
9. Deploy, then do a phone walkthrough: browse → add to cart → checkout (COD + online) → track
   → cancel → refund.
10. Commit this work (it is currently uncommitted) and open a PR.

## O. Next commands and dashboard steps

```powershell
# local re-verification
npx tsc --noEmit; npx vitest run; npx eslint .; npx next build

# commit when satisfied (not done by this audit)
git add -A; git commit -m "Production readiness: refund/request auth, env cleanup, docs"
```

Cloudflare (in WSL/CI): `npm i -D @opennextjs/cloudflare wrangler` → add `wrangler.jsonc` +
`open-next.config.ts` from `DEPLOYMENT.md` §3.2 → `npx wrangler login` →
`npm run cf:preview` → `npx wrangler secret put <NAME>` for each server secret →
`npm run cf:deploy`. Dashboard steps: `DEPLOYMENT.md` §4.

## P. Repository state

- Branch `feature/clerk-resend-whatsapp-cashfree`, HEAD `e111463` — **unchanged**, nothing
  staged, nothing committed, pushed or deployed.
- `git status --short`: 119 entries (113 at audit start); the difference is this run's new
  files (`studioAuth.ts`, `GuestOtpGate.tsx`, two test files) plus newly modified tracked files.
- Files changed in this audit run: `src/backend/lib/studioAuth.ts` (new),
  `src/app/api/refunds/process/route.ts`, `sanity.config.ts`, `src/cms/tools/OrdersDashboard.tsx`,
  `src/app/api/orders/request/route.ts`, `src/app/api/track-order/route.ts`,
  `src/app/track-order/page.tsx`, `src/frontend/components/orders/OrderRequestPanel.tsx`,
  `src/frontend/components/orders/GuestOtpGate.tsx` (new), `next.config.mjs`,
  `.env.local.example`, `package-lock.json`, `tests/refunds-process-auth.test.ts` (new),
  `tests/order-request-auth.test.ts` (new), and the four docs above.
- Safety: `.env.local` not modified; no production data changed; no real payments, refunds,
  OTPs, emails or WhatsApp messages sent; no external dashboards or DNS touched; this report
  contains no credentials.

## Q. Follow-up run — limitations fixed and new order features

Still uncommitted on the same branch; nothing pushed or deployed.

**Limitations from §L fixed**

| Item | Fix | Files / tests |
|---|---|---|
| Last-unit oversell race | Per-product Mongo lock + 30-min hold on unpaid orders' quantities; hold released when the order is confirmed. | `backend/lib/stockHold.ts`, `api/orders/route.ts`, `models/Order.ts` (`stockHeld`) · `tests/stockHold.test.ts` |
| Per-instance rate limits | Shared MongoDB counter (`ratelimits`, TTL) behind the in-memory window. | `backend/lib/rateLimit.ts` · `tests/rateLimit.test.ts` |
| No CSP | CSP on all site pages (Studio excluded). | `next.config.mjs` |
| Plain-text OTPs | Stored as HMAC (`h1:` prefix); old plain codes still accepted until they expire. | `backend/lib/otpHash.ts`, `models/Otp.ts`, OTP verify routes · `tests/otpHash.test.ts` |
| `CASHFREE_ENV` misnamed | Accepted as an alias. | `backend/lib/cashfreeConfig.ts` · `tests/cashfreeConfig.test.ts` |
| Unused Cloudinary packages | Removed. | `package.json` |

**New features**

1. **Refund without delivery / COD charges.** Admin Settings → *Refund delivery charge* (off by
   default = delivery is not refunded). In the Orders Dashboard refund dialogs a one-click
   **"Items only ₹X (keep delivery ₹D)"** / **"Full amount"** picker sets the amount for every
   payment type (Cashfree back-to-source, Razorpay legacy, COD payout, manual). The kept amount is
   stored as `refund.deductedCharges`. Customers see a polite note before they cancel/return
   ("the delivery / COD charge of ₹D is non-refundable…") and on their refund status.
2. **Refund-details form at the top of My Account.** When a refund needs UPI/bank details, an
   *Action needed* card with the form appears first on `/account`, followed by the status of
   refunds in progress.
3. **Doorstep delivery OTP.** Dashboard → **Send to delivery partner (OTP)** creates a secret link
   `/deliver/<token>`, marks the order *Shipped*, and WhatsApps the customer a 6-digit code. The
   owner forwards the link to the partner in one click. At the door the customer shares the
   code, the partner types it, and the order becomes *Delivered* (COD marked paid) in Sanity and
   MongoDB automatically — the customer gets the usual "delivered" WhatsApp. Safeguards: code
   derived from the token (never stored), 5 wrong tries lock the link, 1-minute resend cooldown,
   IP/token rate limits, atomic single delivery, cancelled orders refused, new link revokes the
   old one, signed-in customers also see the code on Track Order and My Account.
   `tests/delivery.test.ts` (14 tests).
