# Environment Setup

Every variable below was derived from the code (`process.env.*` in `src/`, `scripts/`,
`next.config.mjs`, `sanity.config.ts`, `sanity.cli.ts`) and cross-checked against
`.env.local.example`. The example file now lists **exactly** these variables — nothing unused,
nothing missing (except `NODE_ENV`, which the host sets automatically).

**No values are shown here.** Copy `.env.local.example` to `.env.local` (local) or enter the
variables in your host's secret store (production). Never commit real values.

Legend — **Scope**: `server` = secret, server-only · `public` = `NEXT_PUBLIC_*`, embedded in
browser JavaScript (never put secrets here). **Need**: `required` = app breaks without it ·
`prod` = required for production go-live · `optional` = feature degrades safely.

## 1. Core

| Variable | Scope | Need | Read by | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | public | prod | `next.config.mjs`, `layout.tsx`, Cashfree create route, confirmation page | `https://<your-domain>` in production. Builds the Cashfree `return_url`/`notify_url` (so a spoofed Host header can't redirect payments). |
| `MONGODB_URI` | server | required | `src/backend/lib/mongodb.ts`, `scripts/*.mjs` | Atlas connection string. |
| `JWT_SECRET` | server | required | `src/backend/lib/auth.ts`, `guestPaymentProof.ts` | ≥ 64 random chars. Signs the legacy `ns_token` session cookie **and** the 15-minute guest OTP proofs. |
| `JWT_EXPIRES_IN_SECONDS` | server | optional | `auth.ts` | Integer seconds, default `604800` (7 days). |
| `OTP_HASH_SECRET` | server | recommended | `src/backend/lib/otpHash.ts` | ≥ 32 random chars. Keys the stored OTP hashes and derives doorstep delivery codes. Falls back to `JWT_SECRET`; in production OTP code refuses to run if neither is set. Changing it invalidates codes already sent. |

## 2. Sanity (catalog, orders mirror, Studio, analytics)

| Variable | Scope | Need | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | public | required | Project ID (not secret). |
| `NEXT_PUBLIC_SANITY_DATASET` | public | required | `production`. |
| `SANITY_API_TOKEN` | server | prod | **Editor** token. Needed for order sync to Studio, cancel/return requests, refunds, feedback, analytics. Never exposed to the browser. |
| `SANITY_WEBHOOK_SECRET` | server | optional | Shared secret for `/api/webhooks/order-status` (header `x-webhook-secret`). Unset = webhook rejected (fails closed). |
| `ANALYTICS_IN_DEV` | server | optional | `1` = also record footfall from `npm run dev`. Analytics is otherwise production-only and consent-aware. |

## 3. Cashfree (the only active payment gateway)

| Variable | Scope | Need | Notes |
|---|---|---|---|
| `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` | server | prod | PG keys. Unset → online checkout returns 503; COD still works. The secret also verifies webhook signatures (no separate webhook secret). |
| `CASHFREE_ENVIRONMENT` | server | prod | `SANDBOX` (default) or `PRODUCTION`. Must match the key pair. The older name `CASHFREE_ENV` is also accepted. |
| `CASHFREE_API_VERSION` | server | optional | Pins `x-api-version`; default = SDK's bundled version. |
| `NEXT_PUBLIC_CASHFREE_ENABLED` | public | optional | Legacy flag; checkout is Cashfree-only regardless. Leave `false`/unset. |
| `CASHFREE_PAYOUT_CLIENT_ID`, `CASHFREE_PAYOUT_CLIENT_SECRET` | server | optional | Cashfree **Payouts** keys (separate product) for automatic COD refunds to UPI/bank. Unset → refunds are marked "manual" and you pay from your bank app. |
| `CASHFREE_PAYOUT_PUBLIC_KEY` | server | optional | Payouts 2FA public key (PEM or base64). Not needed if your server IP is whitelisted in Payouts. |

> ℹ️ **Your local `.env.local` uses `CASHFREE_ENV`.** The code now accepts it as an alias of
> `CASHFREE_ENVIRONMENT` (the latter wins if both are set). In production make sure one of them
> is `PRODUCTION`, otherwise live keys are sent to the sandbox API.

### Razorpay (legacy — historical orders only)

| Variable | Scope | Need | Notes |
|---|---|---|---|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | server | optional | Only for settling/refunding orders paid with Razorpay before the Cashfree switch. Read lazily — the app starts and builds without them. New Razorpay payments are disabled (`/api/payment/create` returns 410). |
| `RAZORPAY_WEBHOOK_SECRET` | server | optional | Verifies late Razorpay webhooks for those historical orders. |

Remove all three once every historical Razorpay order is settled or refunded.

## 4. Sign-in and messaging

| Variable | Scope | Need | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | public / server | prod | Clerk email + Google sign-in. Both blank → middleware is a pass-through and the legacy phone/JWT login is used. Use the **production instance** keys (`pk_live_…`/`sk_live_…`) on the live domain. |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | server | optional | SMS OTP for **guest order verification only**. SMS is not a login method. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | server | optional | Meta WhatsApp Cloud API — shared by OTP and order messages. |
| `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_OTP_TEMPLATE_LANG`, `WHATSAPP_OTP_BUTTON` | server | optional | Approved **Authentication** template with one `{{1}}` code variable. |
| `WHATSAPP_DELIVERY_OTP_TEMPLATE` | server | optional | Approved template for the doorstep delivery code (one `{{1}}` body variable = code). Unset → the delivery code is sent with `WHATSAPP_OTP_TEMPLATE`; if WhatsApp is not configured at all, the Orders Dashboard shows the code so you can send it yourself. |
| `WHATSAPP_ORDER_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` | server | optional | Approved order-status template with 4 variables (name, order ID, status, link). |
| `RESEND_API_KEY`, `EMAIL_FROM` | server | prod | Resend: password reset **and order confirmation/status emails** for Google and email/password customers. Both required; `EMAIL_FROM` must use a domain verified in Resend. Unset → email skipped (order is not failed). Never used for the delivery code. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | server | prod | Meta Cloud API delivery-receipt webhook `/api/webhooks/whatsapp` (GET handshake token; POST `X-Hub-Signature-256` HMAC keyed by the App Secret). Missing secret → POST returns 503 (fails closed). |
| `DELIVERY_PIN_TTL_HOURS` | server | optional | Delivery PIN validity after assignment (default 72). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | server | optional | **Legacy** non-Clerk Google login. Not needed if you use Clerk's Google connection. |

At least one OTP channel (MSG91 **or** WhatsApp) must be configured in production, because
guests need an OTP to pay online, cancel/return an order, or share refund details.

## 5. SEO / analytics

| Variable | Scope | Need | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_GA_ID` | public | optional | GA4 ID; loads only after cookie consent. |
| `NEXT_PUBLIC_GOOGLE_VERIFICATION` | public | optional | Search Console meta-tag value. |

## 6. Set automatically

| Variable | Notes |
|---|---|
| `NODE_ENV` | Set by `next build`/`next start`/the host. `production` enables secure cookies and hides dev-only behaviour. Never set it manually. |

## 7. Variables you can delete from your local `.env.local`

These are present in your local file but **no code reads them**: `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`
(`CASHFREE_ENV` is now read as an alias — keep it or rename it, see §3).
They were also removed from `.env.local.example` (together with the old Firebase, SMTP,
`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`, Instagram and WhatsApp-number placeholders) in this audit.

## 8. Secret hygiene (verified)

- `.env.local` is git-ignored; only `.env.local.example` (placeholders) is tracked.
- The only hard-coded "secrets" are dummy test values in `vitest.config.ts`.
- OTPs are never logged or returned in production. In local development **without** an SMS/
  WhatsApp provider, the two login OTP routes print the code to the server console (and return
  `_devOtp`) so you can test; with `NODE_ENV=production` and no provider they fail closed (503).
  The guest-order OTP is never logged even in development (use `npm run otp:peek`, which
  refuses to run with `NODE_ENV=production`).
- `SANITY_API_TOKEN`, Cashfree, Clerk secret, Resend and WhatsApp tokens are only read in
  server code.
