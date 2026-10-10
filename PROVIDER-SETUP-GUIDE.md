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

## 4. Cashfree Payments (alongside Razorpay)

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
5. Only once you have manually completed and confirmed a **sandbox** checkout
   end-to-end (order creation → Checkout JS modal → webhook received → order marked
   paid in your database), set `NEXT_PUBLIC_CASHFREE_ENABLED=true` to surface Cashfree as
   a gateway choice on the checkout page. Leaving it unset/`false` keeps checkout
   Razorpay-only.

**No code changes are required to add Cashfree as a second gateway** — all of the above
is account/dashboard setup plus environment variables; the integration code already
exists on this branch.

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
| Cashfree | `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` | `CASHFREE_ENVIRONMENT` optional (defaults SANDBOX); `NEXT_PUBLIC_CASHFREE_ENABLED` optional (defaults off/Razorpay-only). Webhook URL must be registered in the Cashfree dashboard. |
| MongoDB Atlas | `MONGODB_URI` (pre-existing) | No change. |
| Sanity | pre-existing Sanity env vars | No change. |
