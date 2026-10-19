# Client Handover — Nikunj Sakhi

Plain-language guide for running the store. For technical detail see
[PRODUCTION-READINESS-REPORT.md](./PRODUCTION-READINESS-REPORT.md),
[DEPLOYMENT.md](./DEPLOYMENT.md), [ENVIRONMENT-SETUP.md](./ENVIRONMENT-SETUP.md) and
[PROVIDER-SETUP-GUIDE.md](./PROVIDER-SETUP-GUIDE.md).

## 1. Where things live

| What | Where | Who edits it |
|---|---|---|
| Products, prices, variants, stock, collections, banners, policies, coupons, admin phone list | **Sanity Studio** (`/studio` on your site, or a hosted `*.sanity.studio` link) | You — no developer needed |
| Orders, customers, payments | MongoDB Atlas (the database) — mirrored into Studio → **Orders Dashboard** | Automatic; you manage orders in Studio |
| Website visits, phone numbers entered, orders placed (footfall) | Studio → **Analytics** | Automatic (production only, respects cookie consent) |
| Payments | Cashfree merchant dashboard | You |

## 2. Everyday tasks in Studio

- **Add/edit a product**: Studio → Products. Prices and stock you set here are the prices
  charged — the website recalculates every total on the server, so customers can't change them.
  A variant with stock 0 cannot be bought.
- **Orders Dashboard**: filter by *Today / Yesterday / Last 7 days / Last 30 days / This month /
  All time*, see all ordered products, change order status, approve/reject cancellations and returns.
- **Deliver an order with a customer code (recommended)**: Orders Dashboard → **Send to delivery
  partner (OTP)**. The order becomes *Shipped* and the customer gets a 6-digit delivery code on
  WhatsApp. In the window that opens, click **WhatsApp the partner** — they receive the address,
  the COD amount and a private link. At the door the customer tells the partner the code, the
  partner types it on the link, and the order turns *Delivered* by itself (COD is marked paid and
  the customer is notified). If WhatsApp could not send the code, the window shows it with a
  button to send it yourself. **New link (revoke old)** replaces a lost or locked link (5 wrong
  codes lock it). **Mark delivered without OTP** remains for exceptions. Couriers with an AWB
  number still use **Ship via courier (add tracking)**.
- **Admins**: Studio → Admin Access → *Admin Mobile Numbers*. Anyone who logs in with one of
  these phone numbers becomes an admin on the website. Remove a number to remove access.

## 3. Payments

- **Cashfree is the only payment gateway** for new orders (UPI, cards, net banking, wallets).
  **Cash on Delivery** also works.
- Razorpay is switched off for new payments. Its keys are kept only so old Razorpay orders
  can still be refunded. Once those are settled, the keys can be removed.
- An order is marked *paid* only after the server confirms the payment with Cashfree (never
  just because the customer's browser says so).

## 4. Cancellations, returns and refunds

1. The customer opens **Track Order**, enters the order ID and phone, and requests a
   cancellation (before dispatch) or a return (within your return window, with photos).
   - **Guests must confirm a one-time code** sent to the order's phone first.
   - **Customers who ordered while logged in must be logged in** to the same account.
2. You approve or reject the request in **Studio → Orders Dashboard**.
3. When you approve a refund:
   - **Paid online (Cashfree)** → the money goes back to the original card/UPI/bank
     automatically (5–7 working days).
   - **Cash on Delivery** → the customer shares a UPI ID or bank account on Track Order or at
     the top of **My Account** (again protected by OTP/login). With Cashfree **Payouts** set up, clicking approve sends the money
     automatically. Without Payouts, the refund is marked *manual*: pay from your banking app and
     click **Mark refunded** with the UTR/reference.
   - **Delivery / COD charges**: by default only the item value is refunded. The refund window
     has one-click buttons **Items only ₹X (keep delivery ₹D)** and **Full amount** for every
     payment type. Customers are told politely before they cancel or return that the delivery
     charge is non-refundable. To refund delivery charges by default, turn on *Refund delivery
     charge* in Studio → Admin Access.
4. **New this release:** Studio now uses **token login**. Everyone who uses Studio must log in
   once more. This lets the website confirm that a refund request really came from a Studio
   editor; anonymous requests are refused.

## 5. What you must still do before going live (needs your accounts)

In priority order — full steps are in [DEPLOYMENT.md](./DEPLOYMENT.md) §4.

1. **Choose hosting.** Recommended: Cloudflare **Workers Paid ($5/month)**. The Cloudflare
   *free* plan is too limited for this site (10 ms of server time per request). A free
   alternative: Cloudflare DNS (free) in front of Vercel or Render.
2. **Cashfree production**: complete KYC, get live keys, set the webhook URL, run one real
   low-value test order, then set `CASHFREE_ENVIRONMENT=PRODUCTION`.
3. **Cashfree Payouts** (optional, for automatic COD refunds): activate, get Payouts keys,
   whitelist the server IP or download the 2FA public key.
4. **Clerk production instance** (email/Google sign-in) with DNS records on your domain.
5. **Resend**: verify your domain so password-reset and order emails are delivered.
6. **OTP channel**: MSG91 (SMS) and/or Meta WhatsApp with approved templates. At least one is
   required — guests need an OTP to pay online, cancel/return, or share refund details.
7. **MongoDB Atlas**: production cluster, network access for your host, backups.
8. **Sanity**: add your domain to CORS origins; create an Editor API token for the server.
9. **Set `OTP_HASH_SECRET`** (a long random value) on the host. `CASHFREE_ENV` still works, but
   `CASHFREE_ENVIRONMENT` is the preferred name.

## 6. Known limitations

- **Free tiers have limits** (Atlas M0 storage/connections, Resend 3,000 emails/month, etc.).
  Watch usage as the store grows.
- **Delivery codes need WhatsApp.** Without the WhatsApp API, send the code shown in the
  dashboard yourself (one click).
- No automated end-to-end browser tests exist yet. The core logic has 258 automated tests,
  and the main pages were checked manually on a mobile-sized screen.

## 7. You do **not** need to

- Edit code to change products, prices, stock, coupons, banners, policies or admins.
- Run database migrations.
- Keep Razorpay active for new customers.
