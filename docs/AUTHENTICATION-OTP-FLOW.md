# Authentication & Order-Notification Flow

## Login methods (exactly three)

| Method | Route / UI | Session |
|---|---|---|
| Google | Clerk Google connection (or legacy `/api/auth/google/callback`) | Clerk session (legacy JWT `ns_token` with `method: google` on the legacy path) |
| Email + password | Clerk, or legacy `/api/auth/login`, `/register`, `/reset-password` | same |
| Phone via WhatsApp OTP | `/login/whatsapp` → `/api/auth/whatsapp/send-otp` + `/verify-otp` | Clerk sign-in ticket (bridged) + legacy cookie safety net |

**SMS/phone-OTP-over-MSG91 login was removed** (it would have been a fourth method). `/api/auth/send-otp` and
`/api/auth/verify-otp` now return `410 Gone`. MSG91 remains only for *guest checkout* phone verification.
Email-OTP login is not offered. WhatsApp OTP is sent via the Meta Cloud API (`graph.facebook.com`).

All methods end in a server-verifiable session (`requireAuthHybrid`): Clerk session first, legacy signed JWT second.
Admin role is only ever read from the database (`syncAdminRole` / allow-list), never from client values.

## Login-method claim

`requireAuthHybrid` returns a `method` (`google | email | whatsapp`) used for order notifications:

- Legacy JWT: the route that issued the cookie signs the claim; it is validated against the allowed set.
- Clerk: Clerk does not expose the sign-in strategy on the session. A Clerk session created within 10 minutes of the
  server-recorded `User.whatsappLoginAt` is `whatsapp`; otherwise `email` if the account email is verified; otherwise unknown.
- **Known limitation:** Google vs. email/password cannot be told apart on a Clerk session, but both resolve to the same
  destination (verified email), so notification behaviour is unaffected. An unknown method never guesses between channels.

## Order notification policy (`src/backend/lib/orderNotify.ts`)

| Order placed via | Confirmation + status updates go to |
|---|---|
| Google / email+password | **Verified account email**, via Resend |
| WhatsApp OTP login | **Verified account phone**, via WhatsApp (Meta Cloud API) |
| Guest checkout | WhatsApp to the (OTP-verified) phone entered on the order |

- Destination is resolved **server-side** at order creation (`snapshotForOrder`) from the session method and the account
  record, then stored in `Order.notification`. The client cannot supply method or destination.
- Email is "verified" only if `emailVerified`. A phone is "verified" only if the account proved it by OTP.
- If the selected channel has no verified contact, `channel: none` is stored (with a reason, no contact details) and nothing is sent.
  There is no cross-channel fallback. If method is unknown, a contact is used only when exactly one verified contact exists.
- **Later account changes do not redirect existing orders**: the snapshot is used for every later message.
- Idempotency: each event key (e.g. the status) is claimed atomically in `Order.notificationLog` before sending; duplicates
  are skipped; a provider failure releases the claim so a retry can deliver.
- Legacy orders without a snapshot: guest orders keep WhatsApp to the order phone; registered orders are not messaged.
- Senders: Sanity status webhook, order confirmation, refunds (cancelled/refunded) and return requests all go through `notifyOrder`.

Delivery codes are **separate** — see `DELIVERY-VERIFICATION.md`.

## Tests

`tests/orderNotify.test.ts`, `tests/guestVerify*.test.ts`, `tests/whatsappWebhook.test.ts`, `tests/delivery.test.ts`.
