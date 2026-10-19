# Security & Migration Report

> **Update (Cashfree-only checkout migration):** the sections below describing Cashfree
> as a "second, feature-flagged, opt-in gateway" alongside Razorpay reflect the state at
> the time this report was first written. Cashfree has since become the **sole active
> checkout gateway**: `checkout/page.tsx` no longer offers a gateway choice, and
> `/api/payment/create` (Razorpay order creation) now returns `410 Gone` for new
> requests. Razorpay's `/verify` and `/webhook` routes, and `src/backend/lib/razorpay.ts`,
> remain fully intact and unmodified — they are required indefinitely to settle/refund
> pre-existing Razorpay orders already recorded in MongoDB. Guest checkout now requires
> an OTP-verified short-lived proof (`src/backend/lib/guestPaymentProof.ts` +
> `/api/payment/guest-verify/send-otp` and `/confirm-otp`) instead of a bare phone-number
> match before `authorizeOrderForPayment()` will allow a guest payment to be created, for
> both Cashfree and the legacy Razorpay settlement path. See
> `docs/PRODUCTION-HARDENING-REPORT.md` for the original guest-authorization finding and
> `tests/orderAccess.test.ts` / `tests/guestPaymentProof.test.ts` /
> `tests/guestVerifySendOtp.test.ts` / `tests/guestVerifyConfirmOtp.test.ts` for the
> current behavior's test coverage. The remainder of this document is preserved as
> originally written for historical context.

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
- **Phase 2 update — hybrid resolver rolled out further**: `requireAuthHybrid`/
  `requireAdminHybrid` are now also used by `/api/orders` (POST + GET), `/api/orders/[id]`
  (GET + PATCH), `/api/payment/create`, `/api/payment/cashfree/create`, and
  `verifyOrderAccess()` (used by track-order/guest order lookup) — not just
  `/api/auth/me`. The fail-closed-to-legacy behavior described below was preserved at
  every new call site: each still catches Clerk resolution errors and falls back to the
  legacy JWT check rather than failing open, exactly as the original `/api/auth/me`
  canary route did.
- **Phase 2 fix — client-side session visibility and logout correctness**: a new
  `AuthBootstrap` component now calls `/api/auth/me` once per app load so a Clerk-only
  session (no legacy `ns_token`) is reflected in the UI (`/account`, nav, etc.), which
  previously only happened immediately after the legacy login page's own fetch. This
  surfaced a related gap: the existing logout handler only cleared the `ns_token` cookie,
  so a still-active Clerk session would have been silently restored by the new bootstrap
  check on the next page load. Fixed by having logout also call Clerk's own
  `useClerk().signOut()` (via a small `ClerkSignOutBridge` component), so logout now
  terminates both session mechanisms. **Not yet runtime-verified against a live Clerk
  project** (no sandbox credentials available in this environment) — this should be
  spot-checked once Clerk keys are configured: log in via Clerk, log out, reload, and
  confirm the user is not silently signed back in.
- **Residual risk once adopted further**: if/when any additional routes are migrated to
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

---

## Dependency vulnerability remediation (Snyk SCA) — 2026-10-17

Scope: Snyk Open Source (dependency) scan only. **Snyk Code (SAST) is not enabled for the
org (`SNYK-CODE-0005`) and was never run, so no code-level result is claimed.** Nothing was
committed, pushed or deployed; no credentials, databases, providers, DNS or hosting changed.

### Results

| Initial 37 findings | Status |
|---|---|
| 32 × `next@14.2.35`/`postcss`/`nanoid` in `_ai-tooling/.../ui-ux-pro-max-skill/gallery` (vendored, git-ignored tooling, not part of the shop) | **Fixed** — upgraded to Next 16 / React 19 / postcss 8.5; Snyk scan of that folder: 0 issues. Not built or run. |
| `zod@3.25.76` high (via `next-cloudinary` → `@cloudinary-util/url-loader`) | **Fixed** — zod 4.6.7 app-wide plus override for `@cloudinary-util/url-loader` |
| `deepmerge@4.3.1` prototype pollution (via `sanitize-html`) | **Fixed** — `sanitize-html` ^2.18.1 |
| `xlsx@0.20.3` ReDoS (`SNYK-JS-XLSX-6252523`) and prototype pollution (`SNYK-JS-XLSX-5457926`) — no upstream fix | **Fixed by removal/migration** — replaced with ExcelJS 4.4.0 (see below) |
| `braces@3.0.3` `SNYK-JS-BRACES-19963945` (CVE-2026-93687, CWE-674, high) | **Unresolved — no fix exists** (see below). No `.snyk` ignore added. |

Final Snyk scan of `C:\Nikunj` (excluding `node_modules`, `_ai-tooling`): **1 issue** (the braces advisory above).
A transient `SNYK-JS-UNZIPPER-18365659` (zip-slip, via ExcelJS) appeared after migration; fixed with override `unzipper@^0.12.5`.

### `xlsx` usage and migration

- Only user: `src/cms/tools/BulkProductImport.tsx` (Sanity Studio "Bulk Import" tool, embedded at `/studio`, used by
  authenticated admins). Runs in the **browser**: reads an uploaded .xlsx/.xls/.csv into product rows, and generates the
  download template (Products / Instructions / Lists sheets). Not used by API routes, server import/export or scripts.
- New [spreadsheet.ts](../src/cms/tools/spreadsheet.ts) (`readProductRows`, `buildWorkbook`, `parseCsv`) on ExcelJS. The
  prebuilt `exceljs/dist/exceljs.min.js` bundle is used so the Node-only streaming reader (`unzipper`, which needs
  optional AWS SDK modules) is not bundled; only buffer load/write is used.
- ExcelJS review: 4.4.0 has Snyk-clean direct dependencies after the `unzipper` override; its deps are archiver, dayjs,
  fast-csv, jszip, readable-stream, saxes, tmp, unzipper, uuid.
- **Behaviour changes (please note):** (1) legacy binary **`.xls` is no longer supported** (ExcelJS cannot read it); the
  tool shows "Save the file as .xlsx or .csv" and the picker accepts `.xlsx,.csv`. (2) New safety limit: files over 10 MB
  are rejected. (3) CSV is parsed by an in-repo RFC 4180 parser. Cell values are read as display text (as before with
  `raw:false`); blank rows skipped; "Products" sheet preferred, else first sheet.
- Tests: `tests/bulk-import-spreadsheet.test.ts` (16) — round trip, unicode/newlines/numbers, sheet selection, blank rows,
  duplicate/blank/`__proto__` headers, formulas/dates/rich text, CSV quirks (BOM, quotes, CRLF), corrupt/truncated xlsx,
  legacy .xls, oversize, unterminated CSV quote.

### `braces@3.0.3` investigation

- Path (verified with `npm ls`): `sanity@6.18.0 → @sanity/cli → @sanity/codegen → chokidar@3.6.0 → braces`; also
  `tailwindcss@3.4.19 → chokidar / micromatch → braces`.
- Production tree: `sanity` is a runtime `dependency`, so `npm ls --omit=dev` **does** list braces and it is installed
  with production dependencies. It is **not** imported by the app: `src/` only imports `sanity` APIs in `src/cms`
  (Studio UI), never the CLI/codegen/chokidar; I did not find `braces` traced into the Next server output (`.nft.json`).
  The Tailwind path is build-time (devDependency).
- Reachability: braces expands brace patterns in file globs. Patterns come from developer-controlled config/CLI
  (`tailwind.config.ts` content globs, Sanity CLI/codegen config), not from HTTP requests, form fields, uploads or
  CMS content. I found no exposed application input that reaches it. Risk is limited to a developer/CI machine running a
  hostile glob — low, but not zero.
- Fix options: `braces` 3.0.3 is the latest release (no patched version), so no override is possible; `npm audit`'s
  suggested "fixes" are major downgrades/upgrades (Sanity 5.7.0, Tailwind 4) and were rejected. A Tailwind 4 migration
  would remove one path but not the Sanity CLI path, and is out of scope.
- Decision: **retained, unresolved, documented.** No `.snyk` ignore was added (no project ignore policy file exists and
  the finding is real). Re-check when braces or `@sanity/codegen`/`chokidar` ships a fix.

### zod 4 migration review

Schemas were inline in five files; they are now in `src/frontend/lib/formSchemas.ts` (same rules and messages) and
imported by the login, WhatsApp login, reset-password and feedback forms and by `/api/feedback`, whose runtime
`safeParse` + generic-400 handling is unchanged. `tests/form-schemas.test.ts` (41) covers valid/invalid values, length
boundaries (2/80, 10/500, 8-char passwords), trim behaviour, rating coercion (`'4'`, 0, 6, 3.5, NaN, `'Infinity'`),
password mismatch path, non-string/null/array bodies, and that unknown keys are stripped.

### Verification

`tsc --noEmit` 0 errors · `vitest run` 22 files / 230 tests pass · `npm run build` succeeds · `eslint` on touched files:
0 errors (4 pre-existing warnings). `npm audit` still reports other advisories on dev tooling (vitest/tinypool, eslint-config-next,
tailwind chain) that Snyk did not flag; not addressed here.
