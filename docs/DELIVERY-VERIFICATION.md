# Delivery Verification

Independent of login method (Google, email/password, WhatsApp, or guest).

1. **Code:** `deliveryOtp(orderId, token)` = HMAC-SHA256 of `delivery:<orderId>:<token>` keyed by `OTP_HASH_SECRET`/`JWT_SECRET`.
   Derived, not stored; bound to one order and one delivery link, so a code from another order or a regenerated link fails.
   Login OTPs use a different scope and are never accepted.
2. **Sent to:** the WhatsApp number entered for that order (`shippingAddress.phone`), even if it differs from the login phone.
   **Never** emailed — there is no email fallback.
3. **Shown:** only to the authenticated order owner (My Account / Track Order when signed in as owner) with a Copy button.
   Public/unrelated lookups never receive it (`deliveryView(..., showCode=false)`). Code is shown only while the order is `shipped`
   and the PIN has not expired.
4. **If WhatsApp fails:** `delivery.otpStatus = failed`; the owner still sees the code on the site with the message
   "We could not send the code to your WhatsApp". The UI never claims delivery unless the provider confirmed it.
   (The admin assign response includes the code only when the send failed, so the shop can relay it by phone.)
   If WhatsApp is not configured (no `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_TOKEN`, e.g. local dev), nothing is sent,
   `otpStatus = skipped`, and the code is still shown to the owner.
5. **Created when:** the Orders Dashboard hands the order to delivery (`assignDelivery`), **or** the status becomes `shipped`
   in Sanity Studio (`/api/webhooks/order-status` → `ensureDeliveryCode`). If that webhook never arrives (e.g. localhost),
   the next `GET /api/orders` or Track Order lookup creates it (the code is still returned only to the signed-in owner). Creation is atomic, so only one code/WhatsApp is produced.
6. **Verification:** delivery partner opens `/deliver/<token>`; timing-safe compare, max 5 wrong tries (atomic), atomic one-time claim
   (replay returns 409), PIN expiry `DELIVERY_PIN_TTL_HOURS` (default 72h, HTTP 410).

## Delivery status webhook (Meta Cloud API)

The project sends WhatsApp through the **Meta WhatsApp Cloud API**, so receipts arrive as a Meta webhook at
`/api/webhooks/whatsapp` (MSG91 is not involved and no MSG91 callback exists).

- `GET`: handshake with `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- `POST`: `X-Hub-Signature-256` HMAC-SHA256 of the raw body keyed by `WHATSAPP_APP_SECRET`, constant-time compare; 401 on mismatch, 503 if no secret.
- Matches `delivery.otpMessageId` (the `wamid` captured at send), moves status only forward
  (`accepted → sent → delivered → read`); `failed` is recorded; unknown/duplicate events are ignored.

Meta setup: App → WhatsApp → Configuration → callback URL + verify token, subscribe to `messages`.
