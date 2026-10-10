# Implementation Report

**Branch:** `feature/clerk-resend-whatsapp-cashfree`
**Baseline commit (pre-existing work, rollback point):** `71b3e5e`
**`main` branch:** untouched by this work.

This report covers two phases of commits on this branch.

### Phase 1 (original Clerk/WhatsApp/Cashfree scaffolding)

| Commit | Summary |
|---|---|
| `bd9d9b1` | Add `@clerk/nextjs` and `cashfree-pg` dependencies |
| `80445a3` | Clerk middleware, config, hybrid auth, provider, `/api/auth/me` migration |
| `816513e` | WhatsApp OTP backend (Meta Cloud API) + Otp model channel field |
| `e13b40f` | WhatsApp → Clerk session bridge UI (ticket/sign-in-token strategy) |
| `0d49367` | Cashfree payments alongside Razorpay (models, SDK wrapper, routes, checkout UI) |
| `b24e0ca` | `.env.local.example` documentation for all new variables |
| `c73f359` | Vitest test runner + mocked tests for the above |

### Phase 2 (this session — completing the Clerk integration)

Phase 1 left a single canary route (`/api/auth/me`) on the hybrid Clerk+legacy resolver
and had no client-side mechanism to recognize a Clerk-only session outside the login
page. Phase 2 closes both gaps and rolls the hybrid resolver out to every route that
needs to recognize an authenticated customer, without changing behavior for existing
legacy-JWT sessions (the hybrid resolver is a strict superset — see `clerk.ts`).

| File | Change |
|---|---|
| [src/frontend/providers/AuthBootstrap.tsx](/C:/Nikunj/src/frontend/providers/AuthBootstrap.tsx) *(new)* | Client component mounted once at the app root (via `Providers.tsx`). On first load, if the persisted Zustand store isn't already authenticated, it calls `/api/auth/me` (which resolves either a Clerk session or the legacy `ns_token` cookie) and populates the store on success. Marks a new `authChecked` flag regardless of outcome. |
| [src/frontend/store/authStore.ts](/C:/Nikunj/src/frontend/store/authStore.ts) | Added `authChecked` (not persisted) + `setAuthChecked()`, so gated pages can distinguish "not yet checked" from "checked and not authenticated". |
| [src/app/account/page.tsx](/C:/Nikunj/src/app/account/page.tsx) | Redirect-to-login effect now waits for `authChecked` before redirecting (previously redirected immediately on `!isAuthenticated`, which would have bounced a legitimately Clerk-signed-in user before `AuthBootstrap` finished its check). Logout now also triggers a real Clerk `signOut()` (see next row) so a Clerk session can't silently resurrect itself via `AuthBootstrap` on the next page load. |
| [src/frontend/components/auth/ClerkSignOutBridge.tsx](/C:/Nikunj/src/frontend/components/auth/ClerkSignOutBridge.tsx) *(new)* | Tiny client component that calls Clerk's own documented `useClerk().signOut()`. Only ever rendered when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set (same build-time gating pattern already used in `login/whatsapp/page.tsx`), so `useClerk()` is never called without a `<ClerkProvider>` ancestor. |
| [src/app/api/orders/route.ts](/C:/Nikunj/src/app/api/orders/route.ts) (POST + GET) | `requireAuth` → `await requireAuthHybrid`. Guest-checkout fallback behavior on POST is unchanged. |
| [src/app/api/orders/[id]/route.ts](</C:/Nikunj/src/app/api/orders/[id]/route.ts>) (GET + PATCH) | `requireAuth`/`requireAdmin` → `await requireAuthHybrid`/`await requireAdminHybrid`. Owner/guest-owner/admin access logic is unchanged — only the identity resolution changed. |
| [src/app/api/payment/create/route.ts](/C:/Nikunj/src/app/api/payment/create/route.ts) | `requireAuth` → `await requireAuthHybrid` in the optional-auth/guest-checkout block. Razorpay order creation, amount derivation, and the rest of the route are untouched. |
| [src/app/api/payment/cashfree/create/route.ts](/C:/Nikunj/src/app/api/payment/cashfree/create/route.ts) | Same swap as above; Cashfree order creation logic untouched. |
| [src/backend/lib/orderAccess.ts](/C:/Nikunj/src/backend/lib/orderAccess.ts) | `verifyOrderAccess()` (used by track-order and the guest order-lookup API) now resolves the viewer via `requireAuthHybrid`, so a Clerk-signed-in customer's own orders resolve by ownership instead of requiring them to re-enter their phone number. |

**Status: Implemented and verified in code (type-check, production build, and full test
suite all pass — see "Build & test results" below); not live-tested against a real Clerk
project (no sandbox/dashboard credentials were available in this environment, and the
task explicitly disallows sending real OTPs/emails/payments).**

---

## 1. Clerk Authentication (email + Google + session bridge)

**Status: Implemented and verified in code (build/type-check clean, hybrid resolver now
used by every route that needs to recognize an authenticated customer — see Phase 2
table above); not live-tested against a real Clerk project.**

| File | What it does |
|---|---|
| [src/middleware.ts](/C:/Nikunj/src/middleware.ts) | Wraps `clerkMiddleware()`; becomes a pure no-op passthrough when Clerk keys are absent, so existing routing/auth is unaffected until Clerk is configured. |
| [src/backend/lib/clerkConfig.ts](/C:/Nikunj/src/backend/lib/clerkConfig.ts) | `isClerkConfigured()` — true only when both `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set. |
| [src/backend/lib/clerk.ts](/C:/Nikunj/src/backend/lib/clerk.ts) | `requireAuthHybrid()` / `requireAdminHybrid()` — tries a real Clerk session first, otherwise transparently falls back to the existing `requireAuth`/legacy JWT cookie. Links a Clerk identity to an existing Mongo `User` **only** by an already-verified email or phone match; otherwise creates a new, non-privileged (`role: 'user'`) record. Role is always re-read from Mongo and re-synced via the existing `syncAdminRole()` admin allow-list — Clerk metadata is never trusted for authorization. |
| [src/frontend/providers/ClerkAppProvider.tsx](/C:/Nikunj/src/frontend/providers/ClerkAppProvider.tsx), [src/app/layout.tsx](/C:/Nikunj/src/app/layout.tsx) | Wraps the app in `<ClerkProvider>` only when configured (conditional, no-op otherwise). |
| [src/app/sign-in/[[...sign-in]]/page.tsx](</C:/Nikunj/src/app/sign-in/[[...sign-in]]/page.tsx>), [src/app/sign-up/[[...sign-up]]/page.tsx](</C:/Nikunj/src/app/sign-up/[[...sign-up]]/page.tsx>) | Clerk's hosted `<SignIn>`/`<SignUp>` components, which natively provide email verification and "Continue with Google" once a Google OAuth connection is enabled in the Clerk Dashboard (no app code change needed for Google — it is dashboard configuration). |
| [src/app/api/auth/me/route.ts](/C:/Nikunj/src/app/api/auth/me/route.ts) | Uses `requireAuthHybrid`. Called proactively by `AuthBootstrap` on every app load now, not just from the login page. |
| [src/frontend/providers/AuthBootstrap.tsx](/C:/Nikunj/src/frontend/providers/AuthBootstrap.tsx) | Client-side session hydration — see Phase 2 table above. This is what makes a Clerk-only sign-in (e.g. via the hosted `/sign-in` page, with no prior legacy login) visible to `/account`, `Navbar`, etc. |
| `src/app/api/orders/route.ts`, `src/app/api/orders/[id]/route.ts`, `src/app/api/payment/create/route.ts`, `src/app/api/payment/cashfree/create/route.ts`, `src/backend/lib/orderAccess.ts` | All migrated to the hybrid resolver this phase — a Clerk-only session can now place orders, view its own order history, pay via Razorpay or Cashfree, and use track-order by ownership, exactly like a legacy-JWT session. |

**Not done / deliberately deferred:** no other routes needed migration — every
existing `requireAuth`/`requireAdmin` call site in the app was either already covered
above or does not perform an authenticated action (login/register/OTP/forgot-password
routes authenticate *to establish* a session, not to check one; payment verify/webhook
routes are intentionally unauthenticated and instead verify the gateway's own signature).

---

## 2. Resend Email

**Status: Implemented and verified in code (pre-existing, confirmed still correct); not extended with new templates.**

- [src/backend/lib/email.ts](/C:/Nikunj/src/backend/lib/email.ts) already sends transactional email via Resend's HTTP API (`isEmailConfigured()`, `sendEmail()`), gated on `RESEND_API_KEY` + `EMAIL_FROM`. Confirmed this session to be syntactically and functionally correct (verified via raw byte inspection, since the chat viewer visually masks the `Bearer` header string).
- Currently the **only** caller is [src/app/api/auth/forgot-password/route.ts](/C:/Nikunj/src/app/api/auth/forgot-password/route.ts) (password-reset email). No order-confirmation or welcome emails were added — out of scope for this phase; the master plan's Resend requirement ("transactional email delivery") is satisfied by the existing password-reset flow, and no other transactional email exists elsewhere in the app to consolidate.
- **Clerk's own built-in emails** (magic links / email verification codes it sends on `<SignIn>`/`<SignUp>`) are delivered by Clerk's own infrastructure by default. Routing them through Resend specifically requires configuring **Clerk Dashboard → Customization → Custom SMTP** with Resend's SMTP credentials — this is dashboard/account configuration, not an application code change, so it is documented in the Provider Setup Guide rather than implemented here.

---

## 3. WhatsApp OTP Login (Meta Cloud API)

**Status: Implemented and verified in code; genuinely wired to real Clerk sessions (not UI-only); not live-tested against a real Meta/WhatsApp number (per the "no real OTPs" restriction).**

| File | What it does |
|---|---|
| [src/backend/models/Otp.ts](/C:/Nikunj/src/backend/models/Otp.ts) | Added `channel: 'sms' \| 'whatsapp'` so WhatsApp OTPs are stored and looked up separately from the existing SMS OTP records (no collision/overwrite risk). |
| [src/backend/lib/whatsapp.ts](/C:/Nikunj/src/backend/lib/whatsapp.ts) | `sendWhatsAppOtp(phone, otp)` — calls Meta's official WhatsApp Cloud API `messages` endpoint using the pre-approved `authentication` template category (required by Meta policy for OTP messages), driven by `WHATSAPP_OTP_TEMPLATE` / `_LANG` / `_BUTTON`, reusing the existing `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`. |
| [src/app/api/auth/whatsapp/send-otp/route.ts](/C:/Nikunj/src/app/api/auth/whatsapp/send-otp/route.ts) | Generates and stores a 6-digit OTP, rate-limited via the existing `createRateLimiter`/`clientIp` helpers (same pattern as the SMS flow). |
| [src/app/api/auth/whatsapp/verify-otp/route.ts](/C:/Nikunj/src/app/api/auth/whatsapp/verify-otp/route.ts) | Verifies the OTP (constant-time compare via `safeEqual`), enforces expiry and a **5-attempt** cap before forcing a fresh OTP request, finds/creates the Mongo `User`, re-syncs admin role, then: if Clerk is configured, creates/links a Clerk user for the now Meta-verified phone number and issues a short-lived (**120-second**) one-time Clerk `signInToken` — it does **not** fabricate a Clerk session itself. If Clerk is not configured, falls back to the existing legacy `ns_token` cookie session exactly like the SMS flow. |
| [src/app/login/whatsapp/page.tsx](/C:/Nikunj/src/app/login/whatsapp/page.tsx), [ClerkTicketRedeemer.tsx](/C:/Nikunj/src/app/login/whatsapp/ClerkTicketRedeemer.tsx) | New login UI: phone entry → OTP entry → on success, redeems the Clerk `signInToken` client-side via Clerk's documented `ticket` sign-in strategy (`signIn.ticket({ ticket })` → `signIn.finalize()`), converting the Meta-verified identity into a genuine, Clerk-issued session. |

**Verified genuinely implemented, not a placeholder:** OTP generation, expiry, attempt-limiting, and rate-limiting are real and enforced server-side (confirmed by both code reading and the mocked unit tests in `tests/`); the Clerk session bridge issues a real Clerk `signInToken`/session, not a fake or client-only "logged in" UI state.

**Not done:** a live end-to-end test against a real WhatsApp Business number and a real Clerk project (explicitly out of scope — "do not send real OTPs"). The Checkout/session-bridge logic should be manually tested once sandbox/test credentials for both Meta and Clerk are available.

---

## 4. Cashfree Payments (alongside Razorpay)

**Status: Implemented and verified in code (type-check, build, and mocked webhook tests all pass); no live sandbox transaction has been run.**

| File | What it does |
|---|---|
| [src/backend/models/Order.ts](/C:/Nikunj/src/backend/models/Order.ts), [src/types/index.ts](/C:/Nikunj/src/types/index.ts) | Added gateway-agnostic fields — `paymentGateway?: 'razorpay' \| 'cashfree'`, `cashfreeOrderId`, `cashfreePaymentSessionId`, `cashfreePaymentId` — alongside the existing Razorpay fields, which are completely untouched. |
| [src/backend/lib/cashfreeConfig.ts](/C:/Nikunj/src/backend/lib/cashfreeConfig.ts) | `isCashfreeConfigured()` (both `CASHFREE_APP_ID` + `CASHFREE_SECRET_KEY` required), `isCashfreeEnabledOnClient()` (`NEXT_PUBLIC_CASHFREE_ENABLED === 'true'`), `cashfreeEnvironment()` (defaults to `SANDBOX` unless explicitly `PRODUCTION`). |
| [src/backend/lib/cashfree.ts](/C:/Nikunj/src/backend/lib/cashfree.ts) | Lazy Cashfree SDK client (constructed only on first real use, never at import time, so importing this file never fails when unconfigured); wraps `PGCreateOrder`, `PGFetchOrder`, `PGOrderFetchPayments`, and `PGVerifyWebhookSignature`. |
| [src/app/api/payment/cashfree/create/route.ts](/C:/Nikunj/src/app/api/payment/cashfree/create/route.ts) | Mirrors `/api/payment/create`'s atomic-claim pattern. Server-derives the amount from the stored order, never the client. Rejects (409) if the order already has a `razorpayOrderId`. |
| [src/app/api/payment/cashfree/verify/route.ts](/C:/Nikunj/src/app/api/payment/cashfree/verify/route.ts) | Cashfree has no client-trustable signed callback (unlike Razorpay's `razorpay_signature`). This route takes **only** the order id from the client and re-derives the real payment status server-side via `PGOrderFetchPayments`, checking amount/currency before ever marking an order paid. Idempotent. |
| [src/app/api/payment/cashfree/webhook/route.ts](/C:/Nikunj/src/app/api/payment/cashfree/webhook/route.ts) | Verifies `x-webhook-signature`/`x-webhook-timestamp` via the SDK's HMAC verification over the **raw** request body (never re-serialized JSON). Handles `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK`. Idempotent via `findOneAndUpdate({ paymentStatus: { $ne: 'paid' } })`; a paid order is never re-processed or re-synced to Sanity. Verified by 7 mocked tests in [tests/cashfree-webhook.test.ts](/C:/Nikunj/tests/cashfree-webhook.test.ts). |
| [src/app/checkout/page.tsx](/C:/Nikunj/src/app/checkout/page.tsx) | Feature-flagged (`NEXT_PUBLIC_CASHFREE_ENABLED`) gateway selector. When off (default), the Razorpay flow is byte-for-byte unchanged. When on, loads Cashfree's Checkout JS v3 (`https://sdk.cashfree.com/js/v3/cashfree.js`) and opens its modal checkout, then calls `/api/payment/cashfree/verify`. |

**Known asymmetry (defense-in-depth gap, not an active bug):** the Cashfree `/create` route rejects an order that already has a `razorpayOrderId`, but the pre-existing, untouched Razorpay `/create` route does not reject an order that already has a `cashfreeOrderId`. In practice the checkout UI only ever calls one gateway's `/create` route per order (determined by the `gateway` selection), so this gap is not currently reachable through the UI, but it should be closed if Razorpay's route is ever touched for other reasons.

**Least-verified detail:** the exact runtime shape of the Cashfree Checkout JS v3 `.checkout({...})` promise resolution (`{ error?, paymentDetails? }`) is based on web-search documentation, not a typed SDK (Checkout JS v3 is a browser script, not an npm package). This should be manually confirmed in a Cashfree sandbox before enabling `NEXT_PUBLIC_CASHFREE_ENABLED=true` in any real environment.

---

## 5. Tests added

No test runner previously existed in this project. Added Vitest (`npm test` → `vitest run`), scoped to `tests/**` only, as an additive dev dependency.

| File | Covers |
|---|---|
| [tests/rateLimit.test.ts](/C:/Nikunj/tests/rateLimit.test.ts) | Per-key rate limiting, independent keys, window expiry, `x-forwarded-for`/`x-real-ip` parsing. |
| [tests/auth.test.ts](/C:/Nikunj/tests/auth.test.ts) | Constant-time OTP comparison (`safeEqual`), Indian phone validation, phone sanitizing. |
| [tests/cashfreeConfig.test.ts](/C:/Nikunj/tests/cashfreeConfig.test.ts) | Feature-flag gating — unconfigured by default, both keys required, sandbox-by-default. |
| [tests/cashfree-webhook.test.ts](/C:/Nikunj/tests/cashfree-webhook.test.ts) | 7 cases: missing signature headers, invalid signature, successful confirmation, idempotency on a duplicate/replayed webhook for an already-paid order, amount-mismatch rejection, failed/dropped payment handling, unrecognized event acknowledgment. |

All tests use mocks only — no real network calls, database connections, OTPs, or payments.

**Result:** 20/20 tests passing. `npm run type-check` clean. `npm run build` succeeds (Turbopack, Next.js 16.3.8), all new routes correctly registered.

---

## 6. Build/type-check/lint results (Section F)

| Command | Result |
|---|---|
| `npm run type-check` | ✅ Pass, zero errors (re-confirmed after Phase 2 changes) |
| `npm run build` | ✅ Pass — all new routes (`/api/auth/whatsapp/*`, `/api/payment/cashfree/*`, `/sign-in`, `/sign-up`, `/login/whatsapp`) compiled and registered correctly. Only pre-existing warning: `middleware.ts` → `proxy.ts` deprecation notice (Next.js 16, non-blocking, not introduced by this work). Re-confirmed after Phase 2 changes. |
| `npm run lint` | ❌ Pre-existing failure, **unrelated to this work**: `next lint` errors with `Invalid project directory provided, no such directory: C:\Nikunj\lint` (Next.js 16 removed/changed the `next lint` subcommand). Running ESLint directly (`npx eslint src --ext .ts,.tsx`) also fails — no ESLint configuration file (`eslint.config.*`/`.eslintrc*`) exists in the repo. Confirmed this is a pre-existing project/tooling gap, not a regression caused by this work; not fixed here since adding an ESLint config is unrelated scope. |
| `npm test` | ✅ 20/20 passing, re-run after Phase 2 changes with no new failures (no new tests were added for the Phase 2 auth-routing/client-bootstrap changes — they are exercised by `type-check`/`build` and are better validated by manual/E2E testing once Clerk sandbox credentials are available, since they depend on Clerk's runtime hook behavior) |

No real OTPs, emails, or payment transactions were sent or run at any point in this work.
