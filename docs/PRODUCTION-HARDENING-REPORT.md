# Production Hardening Report

> **Superseded (2026-10-17):** this is a historical log. For the current, verified state see
> [PRODUCTION-READINESS-REPORT.md](./PRODUCTION-READINESS-REPORT.md).

> **Update (read-only verification pass, same session):** Task 1's original fix
> (described below) implemented phone-only guest-order authorization, which a follow-up
> read-only review correctly flagged as insufficient (an attacker who merely knows or
> guesses a guest's phone number could pass this check). That gap has since been closed:
> guest payment creation now requires a short-lived, OTP-verified `guestPaymentProof` JWT
> (see `src/backend/lib/guestPaymentProof.ts`, `/api/payment/guest-verify/send-otp`,
> `/api/payment/guest-verify/confirm-otp`), not a bare phone-number match. Checkout UI,
> `authorizeOrderForPayment()`, and both payment-create routes were updated accordingly.
> The repo-wide payment gateway has also since become Cashfree-only (Razorpay retained
> only for settling pre-existing orders) — see `docs/SECURITY-AND-MIGRATION.md`'s update
> notice. The phone-only description in Task 1 below is preserved as a historical record
> of the original fix; it does **not** describe current behavior.

**Project:** Nikunj Sakhi
**Branch:** `feature/clerk-resend-whatsapp-cashfree`
**Baseline commit:** `e1114635057e2a1876485023eb99b6e5d742ff43`
**Scope:** Fix the two confirmed Medium-severity findings from the prior
production-readiness audit — (1) guest-order payment authorization, and
(2) missing rate limiting on order/payment-creation endpoints.

This report documents what changed, exactly what the new behavior is, the
tests added, validation results, and the limitations that remain.

---

## 1. Files changed

| File | Change |
|---|---|
| [src/backend/lib/orderAccess.ts](/C:/Nikunj/src/backend/lib/orderAccess.ts) | Added `authorizeOrderForPayment()` — the new authorization gate for payment creation. |
| [src/app/api/payment/create/route.ts](/C:/Nikunj/src/app/api/payment/create/route.ts) | Razorpay order-creation route: now rate-limited and gated by `authorizeOrderForPayment`. |
| [src/app/api/payment/cashfree/create/route.ts](/C:/Nikunj/src/app/api/payment/cashfree/create/route.ts) | Cashfree order-creation route: identical rate-limit/authorization treatment. |
| [src/app/api/orders/route.ts](/C:/Nikunj/src/app/api/orders/route.ts) | `POST` (order creation) is now IP-rate-limited at the very top of the handler. |
| [src/app/checkout/page.tsx](/C:/Nikunj/src/app/checkout/page.tsx) | Both payment-create fetches now send `phone: address.phone`, required for guest-order authorization. |
| [src/backend/lib/rateLimit.ts](/C:/Nikunj/src/backend/lib/rateLimit.ts) | `createRateLimiter`'s returned function now also exposes `.retryAfterSeconds(key)`; added explicit documentation of the process-local and IP-spoofability limitations. |
| [tests/orderAccess.test.ts](/C:/Nikunj/tests/orderAccess.test.ts) *(new)* | Unit tests for `authorizeOrderForPayment` (10 tests). |
| [tests/payment-create.test.ts](/C:/Nikunj/tests/payment-create.test.ts) *(new)* | Route-level tests for the Razorpay payment-create endpoint (10 tests). |
| [tests/payment-cashfree-create.test.ts](/C:/Nikunj/tests/payment-cashfree-create.test.ts) *(new)* | Route-level tests for the Cashfree payment-create endpoint (9 tests). |
| [tests/orders-ratelimit.test.ts](/C:/Nikunj/tests/orders-ratelimit.test.ts) *(new)* | Rate-limit behavior for `POST /api/orders` (2 tests). |
| [tests/rateLimit.test.ts](/C:/Nikunj/tests/rateLimit.test.ts) | Added tests for the new `retryAfterSeconds` helper (3 new tests; 8 total in file). |

No other files were touched. Nothing was committed — see §6 for current git status.

---

## 2. Security issues addressed

### 2.1 Guest-order payment authorization (Task 1)

**Before:** Both `/api/payment/create` (Razorpay) and
`/api/payment/cashfree/create` (Cashfree) contained:

```ts
if (order.userId && order.userId.toString() !== userId) { ... 403 ... }
```

This only rejects when `order.userId` **exists and mismatches**. For a
**guest order** (`order.userId` is `undefined`), the condition is `false`
unconditionally, so the check was skipped entirely — any caller who learned
or guessed an `orderId` (e.g. from a confirmation-page URL, a leaked
receipt, or a sequential/short ID) could trigger gateway-order creation for
that guest's order with **zero verification**. Gateway-order creation alone
doesn't move money, but it does leak the order's existence/amount and lets
an attacker manipulate the gateway-order state (e.g. force the Razorpay/
Cashfree one-gateway-per-order lock, or create unlimited unused gateway
orders/sessions).

**After — `authorizeOrderForPayment()`** (in `orderAccess.ts`):

- **Registered orders** (`order.userId` set): only the authenticated owner
  may proceed. This is identical to the previous, already-correct behavior
  for this case — unchanged.
- **Guest orders** (`order.userId` unset): the caller must supply a `phone`
  in the request body that matches (via `sanitizePhone`, tolerating `+91`/
  spacing/formatting differences) either `order.shippingAddress.phone` or
  `order.guestPhone`. Missing or mismatched phone → generic
  `403 Access denied.` with **no order details in the response** (same
  anti-enumeration pattern already used by `verifyOrderAccess` for the
  track-order flow).
- An authenticated session cannot be used to claim a guest order by userId
  alone — guest-order authorization is **phone-only**, by design, since a
  guest order has no owning account to match against.

**Frontend change:** `checkout/page.tsx` now sends `phone: address.phone`
(the phone already present in the in-memory checkout form) in both
payment-create requests, so existing guest checkout continues to work
without any UI change.

**Decision — no admin bypass added:** The task asked us to review whether
admins need to initiate payment for other users' orders. No such code path
existed before this change (admins have never been able to call these
payment-create endpoints on another user's behalf), so none was added —
adding one now would be a net-new privilege, not a fix. This keeps the
change minimal and strictly closes the gap rather than expanding scope. If
an admin-initiated payment-retry feature is wanted in the future, it should
be designed, scoped, and reviewed separately.

**Idempotency preserved exactly:** The existing atomic
`findOneAndUpdate(... $or: [gateway-id missing/null/empty], paymentStatus
!= paid ...)` claim pattern in both routes is untouched; the new
authorization check runs strictly *before* it, not interleaved with it.

### 2.2 Rate limiting (Task 2)

Three new rate limiters were added:

| Endpoint | Limiter(s) | Limit |
|---|---|---|
| `POST /api/payment/create` | order-scoped + IP-scoped | 10 req / 5 min per order; 30 req / 5 min per IP |
| `POST /api/payment/cashfree/create` | order-scoped + IP-scoped | Same as above |
| `POST /api/orders` | IP-scoped | 20 req / 10 min per IP |

Both payment-create routes check the order-scoped limiter *and* the
IP-scoped limiter. The order-scoped key (`order:${orderId}`) is the
primary defense because it **cannot be bypassed by IP/header spoofing** —
this directly addresses the requirement not to blindly trust
client-supplied forwarding headers. The IP-scoped limiter is a secondary,
best-effort layer, consistent with the existing codebase convention (see
§3 — it still trusts `x-forwarded-for`/`x-real-ip`, documented as such).
`/api/orders` has no order ID yet at creation time, so it uses IP-scoping
only.

All three return **`429`** with a **`Retry-After`** header (seconds) on
trip, computed from `isLimited.retryAfterSeconds(key)`.

**Webhooks/verification untouched:** `/api/payment/webhook`,
`/api/payment/cashfree/webhook`, `/api/payment/verify`, and
`/api/payment/cashfree/verify` are separate route files and were not
modified — provider callbacks and client-side verification polling are not
subject to the new limiters.

---

## 3. Exact behavior after the fix

### Guest-order payment creation

| Scenario | Result |
|---|---|
| Registered owner pays for their own order | 200, gateway order created/reused |
| A different authenticated customer tries another customer's order | 403 `Access denied.` |
| Guest order, correct phone supplied | 200, gateway order created/reused |
| Guest order, no phone supplied | 403 `Access denied.` |
| Guest order, wrong phone supplied | 403 `Access denied.` |
| Any failure case | Response body is exactly `{ success: false, error: 'Access denied.' }` — no order id, amount, address, or status leaked |

### Rate limiting

- **Scope:** process-local (in-memory `Map`), per Node.js process/instance.
  There is **no shared store** (Redis/Upstash/KV) configured in this
  project, and none was added — per the task's "no new external service
  without approval" constraint. This is explicitly documented in
  `rateLimit.ts`'s module comment and repeated here:

  > **Limitation:** on a host that runs multiple concurrent serverless
  > instances/processes (e.g. multiple warm Vercel lambdas), each instance
  > enforces its own independent counter. The *effective* limit across the
  > whole deployment is `max × (number of warm instances)`, not `max`.
  > Treat this as abuse-mitigation / defense-in-depth against a single
  > runaway client or script, **not** a hard, globally-enforced rate limit.
  > If the hosting plan is confirmed to run a single long-lived instance
  > (e.g. one Node server, not serverless-per-request), this limitation
  > does not apply.

- **`clientIp()` is unchanged and still trusts `x-forwarded-for` /
  `x-real-ip` directly.** This was a deliberate, scoped decision: changing
  it would have risked the 9 other existing call sites
  (`track-order`, `feedback`, `orders/request`, `auth/login`,
  `auth/whatsapp/send-otp`, `auth/reset-password`, `auth/register`,
  `auth/forgot-password`) and the existing `tests/rateLimit.test.ts`
  contract that asserts this exact header-trusting behavior. Instead, the
  **order-scoped limiter** (non-spoofable) is the primary protection for
  the payment-create endpoints, with the IP limiter as a secondary,
  best-effort layer — consistent with how the rest of the codebase already
  treats `clientIp()`. If stronger IP trust is needed later (e.g.
  validating against a known trusted-proxy allowlist), that is a separate,
  broader change affecting all 9+ call sites and should be scoped on its
  own.

- **`isLimited(key)` return type is unchanged** (still a plain boolean) —
  all 9 existing call sites continue to work exactly as before with zero
  code changes required. `retryAfterSeconds` is an additive property on the
  returned function, not a breaking change to the function's signature.

---

## 4. Tests added / updated

| File | Tests | Covers |
|---|---|---|
| `tests/orderAccess.test.ts` | 10 | Pure-logic coverage of `authorizeOrderForPayment`: owner success, cross-customer denial, guest success (both `shippingAddress.phone` and `guestPhone`), formatting tolerance, missing/mismatched phone, and confirming a userId claim cannot substitute for phone verification on a guest order. |
| `tests/payment-create.test.ts` | 10 | Razorpay route: owner success, cross-customer 403, guest success/missing-phone/mismatched-phone, no-detail-leak on denial, idempotent reuse of an existing `razorpayOrderId`, order-scoped 429 + Retry-After, IP-scoped 429 + Retry-After (across distinct orders), legitimate low-volume retries still succeed. |
| `tests/payment-cashfree-create.test.ts` | 9 | Same matrix for Cashfree, plus the existing one-gateway-per-order 409 check and the "Cashfree not configured → 503 before touching DB" path. |
| `tests/orders-ratelimit.test.ts` | 2 | `POST /api/orders` 429 + Retry-After once the per-IP limit is exceeded; confirms a fresh IP is unaffected by another IP's usage. |
| `tests/rateLimit.test.ts` | +3 (8 total) | `retryAfterSeconds`: full-window default for an unhit key, positive/bounded value once limited, and that it shrinks as the oldest hit in the window ages. |

All new tests use mocked gateways/DB/auth (no real Razorpay/Cashfree/Mongo
calls), following the project's existing `vitest` mocking conventions
(module-level `vi.fn()` + `vi.mock()`, matching `tests/cashfree-webhook.test.ts`).
No real OTPs, emails, or payments were sent.

---

## 5. Validation results

```
npm run type-check   → PASS (tsc --noEmit, exit code 0)
npm test             → PASS (8 test files, 54 tests, 0 failures)
npm run build         → PASS (next build; TypeScript, lint-equivalent
                         compile, and static generation all completed
                         successfully — 46/46 pages generated)
```

No existing test was modified to make it pass, and no existing test's
assertions were weakened. The pre-existing `tests/auth.test.ts`,
`tests/cashfreeConfig.test.ts`, and `tests/cashfree-webhook.test.ts` files
are unchanged and all still pass.

---

## 6. Git status (not committed)

```
Branch:        feature/clerk-resend-whatsapp-cashfree
Current HEAD:  e1114635057e2a1876485023eb99b6e5d742ff43   (unchanged — nothing committed)

git status --short:
 M src/app/api/orders/route.ts
 M src/app/api/payment/cashfree/create/route.ts
 M src/app/api/payment/create/route.ts
 M src/app/checkout/page.tsx
 M src/backend/lib/orderAccess.ts
 M src/backend/lib/rateLimit.ts
 M tests/rateLimit.test.ts
?? docs/PRODUCTION-HARDENING-REPORT.md
?? docs/PRODUCTION-READINESS-REPORT.md   (from the prior audit task, pre-existing)
?? tests/orderAccess.test.ts
?? tests/orders-ratelimit.test.ts
?? tests/payment-cashfree-create.test.ts
?? tests/payment-create.test.ts

git diff --stat:
 src/app/api/orders/route.ts                  | 14 +++++++++
 src/app/api/payment/cashfree/create/route.ts | 39 +++++++++++++++++++------
 src/app/api/payment/create/route.ts          | 43 ++++++++++++++++++++++------
 src/app/checkout/page.tsx                    |  8 ++++--
 src/backend/lib/orderAccess.ts               | 31 ++++++++++++++++++++
 src/backend/lib/rateLimit.ts                 | 34 ++++++++++++++++++++--
 tests/rateLimit.test.ts                      | 29 +++++++++++++++++++
 7 files changed, 176 insertions(+), 22 deletions(-)

git diff --check:
 (no output — no whitespace errors)
```

---

## 7. Remaining production blockers / limitations

These are not regressions introduced by this change, but honest
limitations that should be understood before relying on this hardening in
production:

1. **Rate limiting is process-local only.** On multi-instance serverless
   hosting, the effective limit scales with the number of warm instances.
   No shared store is configured; adding one (Redis/Upstash/etc.) would
   require provider approval and is out of scope for this task.
2. **`clientIp()` still trusts forwarding headers.** It remains spoofable
   by a direct caller if the app is ever reachable without going through a
   trusted reverse proxy. The order-scoped limiter mitigates this for the
   payment-create routes specifically; the IP-scoped limiter (here and on
   `/api/orders`) is best-effort defense-in-depth, not a hard boundary.
3. **No admin payment-initiation path exists or was added.** If product
   requirements later call for support/admin-initiated payment retries on
   a customer's behalf, that is new functionality requiring its own
   authorization design and review — not a fix to this report's scope.
4. **Guest-order authorization is phone-only.** A guest order has no
   account to tie to, so possession of the correct phone number is the
   strongest available proof of ownership without introducing new
   infrastructure (e.g. a guest-order access token emailed/texted at order
   time). This matches the existing `verifyOrderAccess` pattern already
   used for `track-order`/`orders/request`.

---

## 8. Session update — continuation from HEAD `e111463`

This section records a later, independent continuation of the hardening
work on the same branch/commit (`feature/clerk-resend-whatsapp-cashfree` @
`e111463`, still uncommitted). Every claim below was re-derived from the
live code and re-run commands in this environment, not assumed from §1–§7.

### 8.1 Flaky test — root cause and fix

`tests/orders-db-unavailable.test.ts` was reported as passing in isolation
but failing under full parallel-suite execution. The originally suspected
cause (shared in-memory rate-limit state leaking across test files) was
tested and **falsified**: running it alongside `tests/orders-ratelimit.test.ts`
reproduced two *timeouts*, not rate-limit-induced assertion failures. The
actual cause is **CPU contention during parallel forked-process test
execution** — cold-starting two test files that each dynamically import
heavy modules (Next.js server internals, Mongoose, Clerk, Cashfree SDKs)
at the same time pushed module-import time past Vitest's default 5000 ms
`testTimeout`.

**Fix:** added `testTimeout: 20000` to `vitest.config.ts` (test logic itself
was already correct) and added a one-line regression comment to
`tests/orders-db-unavailable.test.ts` documenting why the timeout exists.
**Verified:** 4 separate full-suite runs in this continuation (plus 3 more
from the prior segment), all **15/15 test files, 125/125 tests passing**,
with the previously-flaky test consistently completing in ~7–9 s — safely
under the new 20 s ceiling. No reduction in test coverage; no test logic
was skipped, weakened, or deleted to make it pass.

### 8.2 New gap found and fixed: inconsistent IP rate limiting on OTP routes

`src/backend/lib/rateLimit.ts`'s `createRateLimiter`/`clientIp` helpers were
already used by `whatsapp/send-otp`, `guest-verify/send-otp`, and
`guest-verify/confirm-otp`, but were **missing** from three sibling routes
that follow the same pattern elsewhere in the codebase:

- `src/app/api/auth/send-otp/route.ts` (legacy SMS OTP send) — only had a
  60 s per-phone cooldown, no per-IP ceiling.
- `src/app/api/auth/verify-otp/route.ts` (legacy SMS OTP verify) — only had
  a 5-attempt per-phone cap, no per-IP ceiling.
- `src/app/api/auth/whatsapp/verify-otp/route.ts` (WhatsApp OTP verify +
  Clerk sign-in bridge) — same gap.

Without an IP-level limit, an attacker could spread OTP-guessing attempts
across many different phone numbers from a single IP without ever tripping
the existing per-phone limiter. **Fixed** by adding the identical,
already-established `createRateLimiter`/`clientIp` pattern to all three
routes: 10 requests/hour/IP on the send route, 30 requests/hour/IP on the
two verify routes (matching the precedent already set by
`guest-verify/confirm-otp`). No new rate-limiting mechanism was introduced
— this closes a consistency gap using the existing, already-reviewed
design.

### 8.3 Re-review of Clerk auth, OTP/guest-payment, Cashfree, Resend, MongoDB

All of §2 (Clerk hybrid auth), the guest-payment-proof/OTP flows, the
Cashfree create/webhook/verify routes, the Resend email flow, and the
MongoDB connection/authorization layer were re-read end-to-end in this
continuation (not re-summarized from §2–§6, independently re-derived) and
found to still be sound, with the one exception fixed in §8.2. In
particular:
- No client-controlled value can grant a role or create an authenticated
  session (role is always read from the Mongo user document or the
  Sanity-managed `adminPhones` allow-list, never from Clerk's unsafe
  metadata or an unsigned claim).
- The Cashfree webhook verifies `HMAC-SHA256(timestamp + raw body)` against
  `CASHFREE_SECRET_KEY` before trusting any payload, and payment-status
  writes are idempotent (`findOneAndUpdate` with a `paymentStatus: { $ne:
  'paid' }` guard).
- `tests/cashfree-webhook.test.ts` already has dedicated coverage for valid,
  invalid-signature, repeated/idempotent, and amount-mismatch webhook
  events — the task's "add sandbox/mock tests for valid, invalid, repeated,
  and mismatched webhook events" requirement is already satisfied by
  existing tests; no new tests were needed.

### 8.4 Final validation (this continuation, all independently re-run)

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | ✅ Pass — 0 errors |
| `npm run lint` | ✅ Pass — 0 errors, 27 warnings (unchanged from baseline) |
| `npm test` (×4 in this continuation) | ✅ 15/15 files, 125/125 tests, every run |
| `npm run build` | ✅ Pass — all routes compiled/generated |
| `git diff --check` | ✅ Pass — 0 whitespace errors (only benign CRLF-on-touch warnings, not errors) |

### 8.5 Files changed in this continuation

- `src/app/api/auth/send-otp/route.ts` — added IP rate limiting (10/hour).
- `src/app/api/auth/verify-otp/route.ts` — added IP rate limiting (30/hour).
- `src/app/api/auth/whatsapp/verify-otp/route.ts` — added IP rate limiting
  (30/hour).
- `vitest.config.ts` / `tests/orders-db-unavailable.test.ts` — flaky-test
  fix (carried from the start of this continuation; see §8.1).
- `docs/PRODUCTION-HARDENING-REPORT.md`, `docs/PRODUCTION-READINESS-REPORT.md`,
  `docs/ENVIRONMENT-SETUP.md`, `docs/DEPLOYMENT.md`, `docs/CLIENT-HANDOVER.md`
  — this update.

No other files were modified. Nothing was committed, pushed, or deployed —
`git status` still shows the same uncommitted working tree as before this
continuation, plus the files listed above.
