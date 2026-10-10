# Security & Migration Report

## 1. Security review summary

A dedicated security review was performed against the diff introduced on this branch
(not the pre-existing codebase). **No exploitable vulnerabilities were found.** Key
points verified:

- **WhatsApp OTP → Clerk session bridge**: a Clerk session/sign-in token is only ever
  issued *after* the OTP has been verified against the record stored for that phone
  number, using a constant-time comparison (`safeEqual`, `crypto.timingSafeEqual`), with
  a 5-attempt cap and OTP expiry enforced before verification is even attempted. An
  attacker who does not control the target phone number cannot obtain a session, because
  Meta only delivers the OTP to the real WhatsApp number and the server never trusts a
  client-supplied "verified" flag.
- **Clerk ticket (`signInToken`)**: single-use, 120-second TTL, created server-side only
  after OTP success — it is not a long-lived or reusable credential.
- **Authorization boundaries preserved**: `requireAuthHybrid`/`requireAdminHybrid` never
  read role from Clerk metadata or any client-supplied value. Role always comes from the
  MongoDB `User` document, and admin status is re-synced on every hybrid auth call via the
  same `syncAdminRole()` allow-list logic the existing SMS OTP flow already uses. A new
  Clerk identity is only auto-linked to an *existing* Mongo user when Clerk reports the
  matching email/phone as independently verified — never by an unverified or
  client-asserted identifier, which would otherwise be an account-takeover vector.
- **Payments**: order amount/currency are always derived server-side from the stored
  `Order` document — never accepted from the client — in both the Cashfree `/create` and
  `/verify` routes (mirroring the existing Razorpay routes). The Cashfree webhook
  verifies `x-webhook-signature` using the SDK's HMAC check over the **raw** request body
  (reading `req.text()`, not a parsed/re-serialized JSON body, which would invalidate the
  signature check or allow a forged payload to pass if comparison used a different byte
  representation than what was signed).
- **Idempotency / no double-crediting**: every status-changing write uses an atomic
  `findOneAndUpdate` guarded by `paymentStatus: { $ne: 'paid' }` (webhook, verify) or an
  equivalent claim pattern (create), so repeated/duplicate webhook deliveries, a race
  between `/verify` and the webhook, or a replayed request can never mark an order paid
  twice or re-trigger the Sanity sync twice. Covered by automated tests in
  [tests/cashfree-webhook.test.ts](/C:/Nikunj/tests/cashfree-webhook.test.ts).
- **No secrets logged or returned to the client** anywhere in the new code. `.env.local`
  itself was never read, displayed, or modified at any point in this work — only
  `.env.local.example` (names only, no values) was edited.

### Known gap (documented, not exploitable via current UI)

The Cashfree `/create` route rejects creating a Cashfree order on an `Order` that already
has a `razorpayOrderId`. The reverse is **not** true: the pre-existing Razorpay `/create`
route was left completely untouched and does not reject an order that already has a
`cashfreeOrderId`. This is not currently reachable through the checkout UI (which only
calls one gateway's `/create` route per order, based on the user's gateway selection), but
it is a defense-in-depth gap that should be closed with a one-line guard in Razorpay's
`/create` route if that file is ever touched for other reasons. Flagging this explicitly
rather than silently fixing it, since the plan requires not modifying working Razorpay
code without a reviewed reason.

---

## 2. Migration risk report

### 2a. Clerk sessions

- **Risk**: none to existing sessions. Clerk is entirely additive; the existing
  `ns_token` JWT cookie auth path (`requireAuth`/`requireAdmin`, login/register/OTP
  routes) is completely untouched and keeps working whether or not Clerk is configured.
- **Residual risk once adopted further**: if/when more routes are migrated to
  `requireAuthHybrid`, a Clerk outage or misconfiguration must not silently grant or deny
  access incorrectly. The current implementation catches Clerk errors and falls back to
  the legacy JWT check rather than failing open — this behavior should be preserved in
  any future route migrations.

### 2b. Existing customer records

- **Risk**: low. No existing `User` documents are modified by merely configuring Clerk —
  linking only happens lazily, the first time a specific customer authenticates via
  Clerk, and only by an already-verified email/phone match (see security review above).
  No bulk migration or backfill script was run or is required.
- **Recommendation before wider rollout**: decide and communicate whether existing
  password-based accounts will be asked to "claim" their account via Clerk (e.g. sign in
  with the same email) or whether password login remains available indefinitely
  alongside Clerk. This is a product decision, not something this phase needed to resolve
  since both paths coexist today.

### 2c. Admin roles

- **Risk**: none. Admin status is never derived from Clerk and is always re-verified from
  the existing Sanity-backed admin allow-list (`syncAdminRole`) on every hybrid-auth call,
  identical to the existing SMS OTP flow's behavior.

### 2d. Order ownership

- **Risk**: none introduced. Orders are owned by the Mongo `User._id`, which Clerk linking
  reuses rather than replacing — a customer who starts using Clerk still resolves to the
  same `User` document (and therefore the same order history) as long as their email/phone
  matches what's on file. If a customer signs up fresh via Clerk with an email/phone that
  does **not** match any existing record, a new `User` is created (same behavior as the
  existing SMS OTP flow creating a new user for an unrecognized phone number) — this is
  existing, pre-established behavior, not a new risk.

### 2e. WhatsApp OTP security model

- OTPs are 6 digits, single delivery channel per record (`channel: 'whatsapp'`, stored
  separately from SMS OTPs), expire server-side, and are capped at 5 verification attempts
  before requiring a fresh OTP. Send requests are rate-limited per client IP using the
  same `createRateLimiter` helper already used elsewhere in the app.
- **Dependency risk**: this flow's security is only as strong as Meta's phone number
  verification and the operator's control over the registered WhatsApp Business number.
  No additional risk beyond what the existing SMS OTP flow already accepts.
- **Not yet tested against a live Meta number** (explicitly out of scope this phase) —
  before enabling in production, manually verify: OTP actually arrives via WhatsApp, the
  approved template renders correctly, and the full OTP → Clerk ticket → session flow
  completes end-to-end in a staging environment.

### 2f. Razorpay → Cashfree migration

**This phase deliberately does NOT migrate away from Razorpay.** Cashfree was added as a
second, feature-flagged, opt-in gateway. Razorpay remains the default and fully
operational regardless of Cashfree's configuration state. A future migration (if ever
desired) would need a **separate, explicitly reviewed plan** covering:

1. A soak period running both gateways in production (current state, once enabled) to
   validate Cashfree's real-world webhook reliability and settlement behavior.
2. A decision on default gateway (flip the checkout page's default selection) only after
   the soak period.
3. Handling of **in-flight Razorpay orders** at any cutover point — orders already created
   against Razorpay must still be verifiable/completable via the existing, untouched
   Razorpay routes indefinitely; nothing in this phase changes or deprecates those routes.
4. A decision on whether/when to stop offering Razorpay entirely, which is explicitly
   **not** something this phase implements or recommends a timeline for — per the
   master plan's restriction: *"Do not remove Razorpay until a separate migration plan has
   been reviewed and approved."* No Razorpay code, routes, or UI were removed, disabled,
   or deprecated in this work.

---

## 3. What was intentionally NOT changed (by design)

- Existing `requireAuth`/`requireAdmin` (synchronous JWT-cookie) logic — untouched.
- Existing SMS/phone OTP send/verify routes — untouched (WhatsApp OTP uses new, separate
  routes and a separate `channel` field on the same `Otp` model).
- Existing Razorpay create/verify/webhook routes and checkout flow when
  `NEXT_PUBLIC_CASHFREE_ENABLED` is unset/false — byte-for-byte unchanged behavior.
- `.env.local` (the real file) — never read, displayed, or modified; only
  `.env.local.example` (documentation, no values) was updated.
- `main` branch — all work is isolated to
  `feature/clerk-resend-whatsapp-cashfree`, with a pre-work baseline commit (`71b3e5e`)
  available as a rollback point.
