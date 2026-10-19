# Provider Setup Guide

Step-by-step account/dashboard setup for each new provider. No secrets are included —
follow each provider's dashboard to generate your own keys, then put them in your real
`.env.local` (never commit that file). `.env.local.example` lists every variable name
this code actually reads.

Every feature below is **off by default**. Leaving its variables blank/unset keeps the
existing behavior (legacy JWT auth, SMS OTP, Razorpay-only checkout) fully working.

---

## 1. Clerk (email verification/login + Google login)

1. Create a project at https://dashboard.clerk.com.
2. **API Keys** page → copy the **Publishable key** and **Secret key**.
   - Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env.local`.
3. **User & Authentication → Email, Phone, Username**: ensure "Email address" is enabled
   with "Email verification code" or "Email verification link" (either is compatible —
   Clerk's hosted `<SignIn>`/`<SignUp>` components handle this automatically, no code
   change needed).
4. **User & Authentication → Social Connections → Google**: enable Google, and either use
   Clerk's shared/development Google OAuth credentials (fine for testing) or create your
   own OAuth client in Google Cloud Console and paste the Client ID/Secret into Clerk for
   production use.
5. **(Optional) Custom email delivery via Resend**: Clerk → **Customization → Emails →
   SMTP**. Enter Resend's SMTP host/port/credentials (from your Resend dashboard) so
   Clerk's own verification/magic-link emails are sent through Resend instead of Clerk's
   default sender. This is a dashboard-only step; no code change is required or was made
   for this.
6. Restart the dev server after setting the two required env vars — `middleware.ts` only
   activates Clerk once both are present.

**Callback/redirect URLs:** none to configure manually — Clerk's hosted components and
middleware handle redirects internally for this integration style (no custom OAuth
redirect URI needs to be registered in your own app).

---

## 2. Resend (transactional email)

Already partially configured in this project (pre-existing). To (re)verify:

1. Create an account at https://resend.com and verify a sending domain (**Domains** tab →
   add your domain → add the shown DNS records → wait for verification). Without a
   verified domain you can only send to your own Resend account email.
2. **API Keys** tab → create a key.
   - Set `RESEND_API_KEY` in `.env.local`.
3. Set `EMAIL_FROM` to an address on your verified domain, e.g.
   `Nikunj Sakhi <orders@yourdomain.com>`.
4. Currently used for: password-reset email only ([src/app/api/auth/forgot-password/route.ts](/C:/Nikunj/src/app/api/auth/forgot-password/route.ts)).
   Without both vars set, password reset falls back to a dev-only console-logged link in
   non-production, and is disabled in production.

No webhook or callback URL is required for outbound transactional email.

---

## 3. Meta WhatsApp Cloud API (WhatsApp OTP login)

This reuses the **same** WhatsApp Business/Cloud API credentials as any pre-existing
WhatsApp integration in this project (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) — no
new app/account is required if those are already configured; only the extra template
variables below are new.

1. In Meta Business Manager, under your WhatsApp Business Account, create (or reuse) an
   **Authentication** category message template in the correct language (e.g. `en_US`).
   Meta requires authentication-category templates for OTP use — marketing/utility
   templates will be rejected or flagged.
2. Submit the template for approval; wait for Meta to approve it (can take minutes to
   ~24h).
3. Set:
   - `WHATSAPP_OTP_TEMPLATE` — the approved template's name.
   - `WHATSAPP_OTP_TEMPLATE_LANG` — the template's approved language code (e.g. `en_US`).
   - `WHATSAPP_OTP_BUTTON` — `true` if the template includes Meta's "Copy code" quick-reply
     button, otherwise `false`.
4. No webhook subscription is required purely for *sending* OTPs. If you already receive
   WhatsApp delivery-status webhooks elsewhere in this project, no changes are needed
   there.

**Rate limits already enforced in code** (see `send-otp`/`verify-otp` routes): per-IP send
rate limiting, 6-digit OTP with a server-set expiry, and a 5-attempt cap on verification
before a new OTP must be requested.

---

## 4. Cashfree Payments (sole active checkout gateway)

1. Create an account at https://merchant.cashfree.com (sandbox access is available
   immediately; production requires KYC/business verification).
2. **Developers → API Keys**: generate a key pair.
   - Set `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` in `.env.local`.
3. Set `CASHFREE_ENVIRONMENT=SANDBOX` for testing (this is also the default if unset) or
   `PRODUCTION` once ready to go live — never set `PRODUCTION` without having tested a
   full sandbox checkout end-to-end first.
4. **Developers → Webhooks**: add a webhook pointing to
   `https://<your-domain>/api/payment/cashfree/webhook`, subscribed to at least:
   - `PAYMENT_SUCCESS_WEBHOOK`
   - `PAYMENT_FAILED_WEBHOOK`
   - `PAYMENT_USER_DROPPED_WEBHOOK`

   Cashfree signs webhooks using the **same** `CASHFREE_SECRET_KEY` used for API calls —
   there is no separate webhook-signing secret to configure.
5. Online checkout now returns a 503 ("payment gateway not configured") until
   `CASHFREE_APP_ID`/`CASHFREE_SECRET_KEY` are set — Cash on Delivery still works without
   them. `NEXT_PUBLIC_CASHFREE_ENABLED` is **deprecated and no longer read by the checkout
   page** (Cashfree is the only online gateway offered regardless of this flag); it is kept
   only so older deployments that still check it do not break.
6. Guest (non-logged-in) checkout additionally requires an OTP step before payment can be
   initiated: the customer verifies the phone number on their order via
   `/api/payment/guest-verify/send-otp` and `/api/payment/guest-verify/confirm-otp`, which
   reuses the existing `Otp` model and, where configured, the WhatsApp/MSG91 delivery
   channels above. If neither channel is configured, production returns 503; in development
   the code is saved only in the `Otp` collection (short expiry) and is **never logged or
   returned to the browser**, so test this step with WhatsApp or MSG91 configured. No separate dashboard setup is required for
   this step beyond WhatsApp or MSG91 already being configured.

### 4a. How a Cashfree payment is created and confirmed (as implemented)

| Step | Code | What it does |
|---|---|---|
| Create | `POST /api/payment/cashfree/create` | Authorizes the caller (owner, or guest with `guestProof`), rate-limits, and creates a Cashfree order from the **server-computed** `order.total` (Sanity prices, server-side coupon and delivery) in INR. The Cashfree `order_id` is our `orderId`, and an idempotency key `create-<orderId>` is sent. Returns only `paymentSessionId` and environment to the browser. |
| Checkout | `src/app/checkout/page.tsx` | Loads the official Cashfree JS SDK (`sdk.cashfree.com/js/v3/cashfree.js`) and opens the modal in `sandbox`/`production` mode as returned by the server. |
| Verify | `POST /api/payment/cashfree/verify` | Same authorization as create. Fetches the order **and** its payments from Cashfree with the secret key. Marks paid only if the order ID matches, the order is `PAID` in INR with the same amount, and a `SUCCESS` payment for that amount in INR exists. Returns 200 (paid), 202 (pending), 402 (failed) or 400 (mismatch). |
| Return URL | `/confirmation?orderId=…` | Server-side re-check with the same logic (throttled per order). The redirect itself is never treated as proof of payment. |
| Webhook | `POST /api/payment/cashfree/webhook` | Verifies `x-webhook-signature` = base64(HMAC-SHA256(`x-webhook-timestamp` + raw body, `CASHFREE_SECRET_KEY`)) in constant time, then requires the amount and INR currency to match. |

All confirmation paths write `paymentStatus: 'paid'` with a `{ paymentStatus: { $ne: 'paid' } }`
guard, and only the request that wins that update calls `pushConfirmedOrderToSanity()`
(stock decrement and notifications). Duplicate webhooks, a verify racing the webhook, and page
refreshes therefore confirm an order, decrement stock and notify at most once. The Sanity
order document ID is also deterministic (`orders.<orderId>`), which is a second guard.

### 4b. Cashfree dashboard checklist (manual)

1. Sandbox: **Developers → API Keys → Test** keys into `.env.local` with `CASHFREE_ENVIRONMENT=SANDBOX`.
2. Sandbox webhook: **Developers → Webhooks** (Test mode) → add
   `https://<public-test-domain>/api/payment/cashfree/webhook`, subscribing to the three
   payment events above. Cashfree cannot reach `localhost`. Use a deployed preview URL or an
   HTTPS tunnel. Verify and return-URL reconciliation still confirm payments locally without
   the webhook.
3. Run a sandbox checkout with Cashfree's published test cards/UPI IDs. Check that the order
   becomes `paid` in MongoDB/Sanity and that a failed or dropped attempt leaves it unpaid.
4. Production: complete KYC/business activation, then generate **Production** keys.
   Whitelist/verify your production domain if Cashfree asks (it is required for the return
   URL and checkout origin). Add the production webhook URL in **Production** mode.
5. On the production host set `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`,
   `CASHFREE_ENVIRONMENT=PRODUCTION` and `NEXT_PUBLIC_SITE_URL=https://<your-domain>`, then redeploy.

**Razorpay is kept only for settling/refunding pre-existing paid orders** (see
`src/backend/lib/razorpay.ts`, `/api/payment/create`, `/api/payment/verify`,
`/api/payment/webhook`) — it is intentionally no longer offered for new checkouts and no
new Razorpay order can be created (`/api/payment/create` returns 410 for new requests).
Its existing environment variables (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`) must remain set as long as any historical Razorpay orders still
need to be verified/refunded.

### 4c. Refunds (cancelled / returned orders)

When an order with money collected is cancelled or a return is approved, a refund becomes due.
The owner approves it in **Studio → Orders Dashboard** (filter "Refunds"), optionally editing the
amount, and the server (`/api/refunds/process`, `src/backend/lib/refunds.ts`) sends it:

| Paid with | Where the money goes | How |
|---|---|---|
| Cashfree (UPI/card/netbanking) | Back to the original payment source | Cashfree PG refund API (`CASHFREE_APP_ID`/`CASHFREE_SECRET_KEY`) |
| Razorpay (legacy orders) | Back to the original payment source | Razorpay refund API |
| Cash on Delivery / manual | The customer's UPI ID or bank account | Customer enters it on `/track-order` (owner login or OTP for guests); sent with **Cashfree Payouts** |

Cashfree Payouts setup (optional — without it COD refunds become "manual": pay from your
UPI/bank app and record the UTR with **Mark refunded**):

1. Activate Payouts on the Cashfree merchant dashboard and add funds to the Payouts balance.
2. Payouts → Developers → API keys: set `CASHFREE_PAYOUT_CLIENT_ID`, `CASHFREE_PAYOUT_CLIENT_SECRET`.
3. Either whitelist the server's outbound IP (Payouts → Developers → IP Whitelist) or download
   the Payouts public key and set `CASHFREE_PAYOUT_PUBLIC_KEY` (PEM with `\n` escapes, or base64).
4. `CASHFREE_ENVIRONMENT` selects sandbox vs production for Payouts too.

Each attempt uses a deterministic reference (`NSXXXXXXXX_R<n>`) as the gateway idempotency key,
and an order is locked (Sanity revision check) before money is sent, so repeated clicks can
never pay twice. If a gateway reply is lost, the refund stays "processing" and **Check status**
reconciles it.

`/api/refunds/process` only accepts calls from a signed-in Studio user with the
administrator/editor/developer role (Studio uses **token login**, so every Studio user must log
in once after this change) or a website admin session. A hosted Studio (`*.sanity.studio`) is
allowed cross-origin; nothing else is.

---

## 5. MongoDB Atlas + Mongoose (unchanged)

No new setup — this project already uses MongoDB Atlas via Mongoose. The existing
`MONGODB_URI` continues to be the single source of truth for `User`, `Otp`, and `Order`
documents, including the new fields added in this phase (`clerkUserId`, `channel`,
`paymentGateway`, `cashfreeOrderId`, etc.).

## 6. Sanity (unchanged)

No new setup — products/catalog/pricing/CMS functionality is untouched. The Cashfree
webhook calls the same existing `pushConfirmedOrderToSanity()` helper that the Razorpay
webhook already uses, so order sync to Sanity behaves identically regardless of which
gateway confirmed the payment.

---

## Configuration checklist (summary)

| Provider | Required for feature to activate | Notes |
|---|---|---|
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Google login enabled per-project in Clerk Dashboard, not via env var. |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM` | Domain must be verified in Resend for production sending. |
| WhatsApp (Meta Cloud API) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (pre-existing) + `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_OTP_TEMPLATE_LANG`, `WHATSAPP_OTP_BUTTON` | Authentication-category template must be pre-approved by Meta. |
| Cashfree | `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` | `CASHFREE_ENVIRONMENT` optional (defaults SANDBOX). Sole active checkout gateway — without these keys, online payment is unavailable (COD still works). Webhook URL must be registered in the Cashfree dashboard. `NEXT_PUBLIC_CASHFREE_ENABLED` is deprecated/unused. |
| Razorpay (legacy) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (pre-existing) | No longer offered for new checkouts; required only to settle/refund/verify pre-existing paid orders. |
| Cashfree Payouts (optional) | `CASHFREE_PAYOUT_CLIENT_ID`, `CASHFREE_PAYOUT_CLIENT_SECRET` (+ IP whitelist or `CASHFREE_PAYOUT_PUBLIC_KEY`) | Sends COD refunds to the customer's UPI/bank. Without it COD refunds are recorded manually. |
| Website analytics | `SANITY_API_TOKEN` (pre-existing) | Recorded in production only (`ANALYTICS_IN_DEV=1` to include dev). View in Studio → Analytics. |
| MongoDB Atlas | `MONGODB_URI` (pre-existing) | No change. |
| Sanity | pre-existing Sanity env vars | No change. |
