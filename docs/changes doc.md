# Changes Doc — Storefront, Orders & Login Update

Status: **Implemented** · Stack: Next.js 16 · React 19 · Sanity · MongoDB · Razorpay · Zustand · Tailwind v3

This document lists the 14 requested changes. For each one it gives the problem found (root cause), the fix, the files touched, and anything the admin needs to do. The full requirement record is §13 of [PRD-Catalog-CMS-Feedback.md](./PRD-Catalog-CMS-Feedback.md).

---

## Summary

| # | Request | Status |
|---|---------|--------|
| 1 | "Bhakti Ka Bhaav" title in logo colours | ✅ Done |
| 2 | Search all products, with suggestions while typing | ✅ Done |
| 3 | Product page image not visible | ✅ Done |
| 4 | Quantity selector everywhere, price follows quantity | ✅ Done |
| 5 | Sale % inaccurate | ✅ Done (code) + admin data note |
| 6 | Order management in Sanity + WhatsApp confirmation | ✅ Done (needs env for automatic sending) |
| 7 | "Select size by price" variant section | ✅ Done |
| 8 | New logo + tagline "Serve with Devotion" | ✅ Done (tagline field: admin to update in Studio) |
| 9 | "View All Products" moved into "Browse by Deity & Category" as the first panel | ✅ Done |
| 10 | Trust badges on one line, animated, with 2D icons | ✅ Done |
| 11 | Remove the "Scroll" animation | ✅ Done |
| 12 | Buttons not redirecting / policy pages open mid-page / delay | ✅ Done |
| 13 | Shop page product-type tiles (image from Sanity) that filter products | ✅ Done |
| 14 | Email, Google and phone-OTP login, forgot password, account dashboard | ✅ Done (Google/email need env) |

---

## 1. Hero title colour
- **Cause:** The title used a single gold colour that didn't match the teal-and-gold logo.
- **Fix:** Added a `.brand-gradient-text` utility (logo teal `#0f6d6a` → gold `#c9922a`) and applied it to the hero title.
- **Files:** `src/app/globals.css`, `src/frontend/components/home/HeroSection.tsx`, `tailwind.config.ts`

## 2. Search
- **Cause:** Search only matched the start of a few fields and ran after submit, so many products were never found.
- **Fix:**
  - When search first opens, `SearchModal` loads a lightweight index of **all** products: name, deity, category, product type, tags, price and image. It then ranks matches as you type (instant, no extra request per keystroke).
  - Suggestions show the product image, name and price, plus quick category/type suggestions.
  - Supports keyboard navigation (↑/↓/Enter/Esc), and Enter opens "See all results" (`/collections?search=`).
  - The full results page uses a GROQ `match` prefix search (`toSearchPattern`) across the same fields.
- **Files:** `src/cms/lib/queries.ts`, `src/frontend/components/ui/SearchModal.tsx`

## 3. Product page image
- **Cause:** The main image container on `ProductDetail` had no height, so the `fill` image collapsed to 0 px. Quick View worked because its container had a fixed aspect ratio.
- **Fix:** Gave the gallery an `aspect-square` container with correct `sizes`. Added a thumbnail strip and a placeholder fallback.
- **Files:** `src/frontend/components/products/ProductDetail.tsx`

## 4. Quantity selector
- **Cause:** Quantity controls were missing on the product page and Quick View, and the price did not change with quantity.
- **Fix:** One shared `ProductOptions` component (variant, colour, quantity −/+, capped by stock) is used on the product page and Quick View. The total price updates live (`unit price × qty`). The cart sidebar −/+ buttons respect stock, and the checkout totals recalculate.
- **Files:** `ProductOptions.tsx` (new), `ProductDetail.tsx`, `ProductQuickModal.tsx`, `CartSidebar.tsx`, `cartStore.ts`, `checkout/page.tsx`

## 5. Sale percentage
- **Cause:** Each component calculated the % differently. Some used the legacy `originalPrice` field, some rounded up, and some ignored the variant's price.
- **Fix:** All prices and discounts now come from one module, `src/cms/lib/pricing.ts`:
  - `discountPercent(mrp, price)` rounds **down**, so it never advertises more than the real saving (₹999 vs ₹1,200 = 16.75% → "16% off"), and returns 0 when price ≥ MRP.
  - `getVariantPricing`, `lowestPricing` and `formatINR` handle variant prices and formatting.
  - Product cards, the detail page, Quick View, the cart and the order API all use it.
- **Admin note:** "Radha Krishna Haar set" has a size `0-5` with a **+₹1200 modifier** and a legacy MRP of ₹1800. Set the **Variant Price** field for that size so the shown discount is what you intend.

## 6. Order management in Sanity + WhatsApp confirmation
How an order flows:
1. A customer places an order. COD orders sync immediately; online orders sync once Razorpay payment is verified (verify route or webhook).
2. `pushConfirmedOrderToSanity` creates the **order document in Sanity** and reduces stock in the same transaction. It is idempotent.
3. **Automatic WhatsApp confirmation:** the customer gets an "Order confirmed" message through the WhatsApp Cloud API (`src/backend/lib/whatsapp.ts`). It is sent only once, and only for new orders.
4. In **Studio → 📦 Orders**, orders are grouped: 🆕 New — to pack · 📦 Packing · 🚚 Shipped · ✅ Delivered · ❌ Cancelled · 💸 Refund due · All.
5. The order document has these buttons:
   - **Mark as Packing / Shipped / Delivered**: moves the status forward and logs it in history.
   - **Send to Delivery Partner** (new):
     - Opens WhatsApp to the partner number set in **Admin Access**, pre-filled with the customer name, phone, full address, items, piece count, and **COD amount to collect** (or "Prepaid").
     - Records `Sent to Delivery Partner At`, fills in the courier name, and moves a *Confirmed* order to *Packing*.
   - **Send WhatsApp update**: opens WhatsApp with a ready-made message to the customer (manual fallback).
   - **Cancel Order**: restocks items and marks paid orders "Refund due".
6. **Automatic status messages:** when the status changes in Studio, a Sanity webhook calls `/api/webhooks/order-status`, which WhatsApps the customer (Packing / Shipped with AWB and link / Delivered / Cancelled).
7. The customer always sees the live status on **My Account → Orders** and **Track Order**.

- **Files:** `src/backend/lib/whatsapp.ts` (new), `src/app/api/webhooks/order-status/route.ts` (new), `src/backend/lib/sanityOrders.ts`, `src/cms/actions/orderActions.ts`, `src/cms/lib/orderMessages.ts` (`deliveryPartnerMessage`), `src/cms/schemas/order.ts` (`tracking.handedOverAt`), `src/cms/schemas/adminSettings.ts` (`deliveryPartnerName`, `deliveryPartnerWhatsApp`), `sanity.config.ts`
- **Admin setup:**
  1. Studio → **Admin Access**: fill in **Delivery Partner** and **Delivery Partner WhatsApp Number**.
  2. Meta WhatsApp Cloud API:
     - Set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.
     - For production, create an approved **utility template** with 4 body variables (name, order ID, status, tracking link) and set `WHATSAPP_ORDER_TEMPLATE`. Without a template, Meta only delivers free-text messages inside a 24-hour customer window.
  3. sanity.io/manage → API → Webhooks → **Create**:
     - URL `https://<site>/api/webhooks/order-status`, Dataset `production`, Trigger **Update**.
     - Filter `_type == "order" && delta::changedAny(status)`
     - Projection `{orderNumber, status, customerName, phone, total, paymentStatus, tracking, items}`
     - HTTP header `x-webhook-secret: <SANITY_WEBHOOK_SECRET>`
  - If these env vars are missing, nothing breaks: automatic messages are skipped, and the manual WhatsApp buttons still work.

## 7. "Select size by price" (variants)
- **Cause:** Selecting a size didn't change the price or stock. Variant `price` overrides and `priceModifier` were mixed up, and out-of-stock sizes could still be selected.
- **Fix:**
  - `getVariantPricing` resolves the price in this order: the variant's own price, then base + modifier, then the base price.
  - `ProductOptions` shows each size as a chip with its price, disables sold-out sizes, and selects the cheapest in-stock size by default.
  - The cart stores the selected size with its price.
- **Files:** `pricing.ts`, `ProductOptions.tsx`, `cartStore.ts`, `src/cms/schemas/product.ts` (clearer field help)

## 8. New logo & tagline
- **Fix:**
  - The new logo is at `public/nikunj-sakhi-logo-v2.webp`, used by `NikunjSakhiLogo` (header, footer, login).
  - The logo is a **transparent** WebP (870×594, padding trimmed), so it sits directly on the cream/gold theme with no box or blend hacks. On the dark footer it gets a soft cream-to-gold feathered halo so the teal lettering stays readable. The favicons, app icons and OG image were regenerated from the transparent logo.
  - The favicon, Apple touch icon, PWA icons (192/512) and the default social share image (`og-default.jpg`) were regenerated from the new logo.
  - "Serve with Devotion" is used in alt text, SEO titles, Razorpay checkout, emails and the schema defaults.
- **Admin note:** The live Sanity **Site Settings → Tagline** still says "Handcrafted with Perfection". The API token doesn't have permission to edit it, so change it in Studio.

## 9. "View All Products" in Browse by Deity & Category
- **Fix:** The separate button was removed. A **"View All Products"** card is now the first panel of the category grid, followed by every category from Sanity (the query is no longer limited).
- **Files:** `CategoryGrid.tsx`, `FeaturedProducts.tsx`, `src/app/page.tsx`

## 10. Trust badges
- **Fix:** New `TrustBadges` component: one horizontally scrollable line on mobile, 4 columns on desktop. It has staggered fade-up, icon float and hover-lift animations, and 2D SVG icons (lotus/hands, gem, diya, delivery van). It respects `prefers-reduced-motion`.
- **Files:** `TrustBadges.tsx` (new), `HeroSection.tsx`, `globals.css`

## 11. "Scroll" indicator
- **Fix:** Removed the bouncing "Scroll" element from the hero.

## 12. Buttons, navigation and page position
- **Cause:**
  - Some links used plain `<a>` tags (full reloads, losing the cart drawer state).
  - Policy pages were not pre-rendered, so they loaded slowly.
  - Next.js kept the old scroll position, so pages like Terms & Conditions opened mid-page.
- **Fix:**
  - `<a>` → `<Link>` throughout (account, footer, cards).
  - `ScrollReset` provider scrolls to the top on every route change, except `#hash` links.
  - `generateStaticParams` added for policy pages.
  - A global `loading.tsx` gives instant feedback during navigation.
- **Files:** `ScrollReset.tsx` (new), `Providers.tsx`, `src/app/loading.tsx` (new), `policies/[slug]/page.tsx`, `account/page.tsx`

## 13. Shop page product-type tiles
- **Fix:**
  - "All Collections" shows a row of round tiles: an **All** tile, then one per product type.
  - Each tile shows the **image uploaded in Sanity** (Product Type → *Tile Image*). If none is uploaded, it shows a matching 2D icon (`ProductTypeIcon`).
  - Clicking a tile opens that type's product listing (`/collections/{category}/{type}`, which is shareable and works with Back). Clicking the active tile again returns to All. Only types that have products are shown, with a product count.
- **Files:** `CatalogPage.tsx`, `ProductTypeIcon.tsx` (new), `src/cms/schemas/productType.ts` (`image` field), `queries.ts`
- **Admin note:** Upload a tile image for Attar, Haar, Mukut and Bangles in Studio.

## 14. Login & account
- **Login page** (`/login`):
  - **Continue with Google**.
  - **Email** tab: sign in / create account / forgot password.
  - **Phone** tab: OTP with resend timer.
  - Supports `?next=` to return the user to where they were.
- **Forgot password:**
  - Emails a one-time link, valid for 30 minutes. Only a SHA-256 hash of the token is stored.
  - The response is generic, so it doesn't reveal which emails have accounts.
  - The link opens `/login/reset-password`.
  - Phone users can always sign in again with an OTP.
- **Security:**
  - Passwords are bcrypt-hashed (8+ characters, with a letter and a number).
  - Login, registration and reset are rate-limited.
  - Sessions use an httpOnly `ns_token` cookie, valid 7 days.
  - Google OAuth uses a `state` check.
  - One user can link phone, email and Google; accounts are matched by email.
- **Account dashboard** (`/account`):
  - Stats: total orders, in progress, wishlist, in cart.
  - Tabs:
    - **Orders**: progress tracker for each order, and a Track button.
    - **Wishlist**: product grid.
    - **Cart**: items, subtotal, Edit, Checkout.
    - **Profile**.
- **Files:**
  - `src/backend/models/User.ts`, `src/backend/lib/session.ts` (new), `src/backend/lib/email.ts` (new)
  - `src/app/api/auth/{register,login,forgot-password,reset-password,google,google/callback,me,providers}` (new), `verify-otp` (refactored)
  - `src/app/login/page.tsx`, `src/app/login/reset-password/page.tsx` (new), `src/app/account/page.tsx`, `src/types/index.ts`
- **Migration:** `phone` is now optional. On first use, `ensureUserIndexes()` replaces the old unique `phone_1` index with partial unique indexes on phone, email and googleId. Existing phone users are unaffected.

---

## Environment variables (new)

| Variable | Used for | If missing |
|----------|----------|------------|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in (redirect URI `{SITE_URL}/api/auth/google/callback`) | Google button shows "not available" |
| `RESEND_API_KEY`, `EMAIL_FROM` | Password-reset emails | Dev: link returned in the response; Prod: "email unavailable" |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Automatic WhatsApp order messages | Automatic messages are skipped; manual buttons still work |
| `WHATSAPP_ORDER_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` | Approved template for business-initiated messages | Free-text (delivered only inside a 24-hour window) |
| `SANITY_WEBHOOK_SECRET` | Authenticates `/api/webhooks/order-status` | The webhook returns 401 |

All of them are listed in `.env.local.example`.

## Admin checklist after deploy
1. Studio → Site Settings → Tagline = **Serve with Devotion**.
2. Studio → Admin Access → Delivery Partner name and WhatsApp number.
3. Studio → Product Types → upload tile images.
4. Radha Krishna Haar set → set the Variant Price for size `0-5`.
5. Site Settings → check the Free Delivery threshold. It is currently ₹499 in Sanity; the badge shows the live value.
6. Add the env vars above in the hosting dashboard, create the Sanity webhook, and add the Google OAuth redirect URI.
7. Deploy the Studio (`npm run sanity:deploy`) so the new order buttons and fields appear.

## Verification
- `npm run type-check`: ✅ passes
- `npm run build`: see release notes / CI
- Browser checks: home (hero colours, badges, category grid, no Scroll indicator), search suggestions, `/collections` tiles and filtering, product image, variants and quantity, footer Terms opens at the top, login tabs and forgot flow, account dashboard.


---

# Round 3: UI and CMS refinements

| # | Request | Status | Where |
|---|---------|--------|-------|
| R3.1 | Login greeting reads "Namaste" in an Anglo-Hindi display font | ✅ | `src/app/login/page.tsx`, `src/app/fonts.ts` (Yatra One, Latin + Devanagari), `tailwind.config.ts` (`font-namaste`) |
| R3.2 | Footer logo blends with the theme (plain transparent logo, no halo). Header logo is bigger and hangs half below the bar | ✅ | `NikunjSakhiLogo.tsx`, `Navbar.tsx` |
| R3.3 | One image per colour, each with its own price. The preview switches with the colour | ✅ | `cms/schemas/product.ts`, `cms/lib/pricing.ts`, `frontend/lib/product.ts`, `ProductDetail.tsx`, `ProductQuickModal.tsx`, cart, checkout, `api/orders` |
| R3.4 | Wishlist items can be bought, the same way as from quick view | ✅ | `src/app/wishlist/page.tsx` |
| R3.5 | Shop sidebar headings (Categories / Product Type / Deity / Highlights / Price / Sort) are boxed, bold and highlighted | ✅ | `ProductFilters.tsx` |
| R3.6 | "Shop All" renamed to "Shop Products" everywhere | ✅ | `Navbar.tsx` (desktop + mobile), `CatalogPage.tsx` (page title), `not-found.tsx` |
| R3.7 | Under "Order via WhatsApp": 3 columns (Product Details / Care Instructions / Return Policy) with highlighted headings | ✅ | `src/app/products/[slug]/page.tsx` |
| R3.8 | Sanity admin mapped for the new fields | ✅ | `product.ts` (`colors[]`, `returnPolicy`, `careInstructions`) |

## Details

### R3.1 Namaste
- The sign-in and phone-welcome states show **Namaste नमस्ते 🙏** in Yatra One, with Namaste in gold and नमस्ते in teal.
- Other states keep their headings: Create Account, Enter OTP, Forgot Password.
- The successful-login toast reads "Namaste! Welcome back 🙏".

### R3.2 Logos
- **Footer:** the transparent logo sits directly on the dark footer. A thin glow follows the logo's shape, so there is no box or halo.
- **Header:** the logo area is 124 px tall on desktop and 84 px on mobile, inside an 80 px / 64 px bar, so the logo "hangs" below the bar.
  - It shrinks to 104 px / 72 px when the page is scrolled.
  - It sits above the page content, with a soft drop shadow.

### R3.3 Colour variants (admin guide)
In Studio, open a Product, then **Media** (or **Extra Details**), then **Colour Variants (image + price)**. Add one row per colour:

| Field | Meaning |
|-------|---------|
| Image | Photo of the product in this colour |
| Which colour is this image? | Required, e.g. "Red" |
| Price / MRP | Optional price for this colour. MRP must be higher than the price |
| Hex | Optional swatch colour |

- **Price precedence:** colour price, then size (variant) price, then base price.
- Sale % is recomputed from the winning price and MRP.
- On the website:
  - Colour photos are added to the gallery.
  - Picking a colour jumps to its photo and updates the price.
  - Swiping to a colour photo selects that colour.
  - Cart, checkout and the server-side order total all use the colour price, so the server re-verifies it.
- Existing colours that have only a label and hex keep working.

### R3.4 Wishlist
- Products that need a size or colour choice open the full **Quick View**: image, options, quantity, Add to Cart and Buy Now.
- Simple products add straight to the cart, or use **Buy Now**, which goes to checkout.
- Out-of-stock items show a toast.
- Price shows the lowest price ("From"), the MRP and % OFF.

### R3.7 Product information columns
- **Product Details:** the rich description (or short description), plus material, weight and specifications.
- **Care Instructions:** `careInstructions`, or default devotional care text.
- **Return Policy:** the new per-product `returnPolicy` field, or the default 7-day policy, plus a link to `/policies/return`.

## Round 3 verification
- `npx tsc --noEmit`: ✅ passes.
- Browser checks on localhost:3000, desktop and 390 px mobile:
  - Namaste heading.
  - Overhanging header logo.
  - Plain footer logo.
  - Boxed shop sidebar and the "Shop Products" page title.
  - The 3 info columns on the product page.
  - Wishlist, then Quick View with Add to Cart / Buy Now.
- **Admin action:** run `npm run sanity:deploy` so the hosted Studio shows the colour image + price rows and the Return Policy field.

## Round 3 addendum — Wishlist hydration fix & UI/UX Pro Max skill

### Wishlist hydration fix
- **Root cause:** the persisted wishlist (localStorage) loaded during hydration. Hearts then rendered "Remove from wishlist" on the client but "Add to wishlist" on the server, which caused a React hydration mismatch.
- **Fix:**
  - `wishlistStore` now uses `skipHydration: true`, and `Providers` rehydrates it after mount.
  - The new `useWishlistHydrated()` hook is false on each component's first render. So `ProductCard`, `ProductDetail` and the home coverflow carousel always match the SSR markup, then show the saved hearts.
  - `/wishlist` waits for hydration before fetching, so there's no "empty wishlist" flash.
- **Verified:** with a saved item, `/`, `/collections`, the product page and `/wishlist` show the correct heart or item, with zero hydration errors in the console.

### UI/UX Pro Max skill
- **Install:** installed from `krishnakanthb13/antigravity_global_skills/ui_ux_pro_max` into `~/.copilot/skills/ui-ux-pro-max`.
- **Fixes to the skill itself:**
  - Corrected the hard-coded install path.
  - Fixed an upstream import bug (`persist_design_system`) so `search.py` runs.
- **Pre-delivery checklist applied:**
  - "No emojis as icons": the product-info column headings now use Lucide SVG icons (`ScrollText`, `Sparkles`, `RotateCcw`) instead of the 📜/🪔/↩️ emoji.
  - The existing brand palette (maroon/gold/cream) and fonts were kept; the skill's generic palette suggestion didn't match the devotional brand.

---

## Round 4 — Logo v3, light-brown animated highlights, wishlist button

| # | Change | Files | Verified |
|---|--------|-------|----------|
| 1 | **New logo (v3) everywhere.** The supplied transparent PNG was cropped to its artwork bounds and saved as `nikunj-sakhi-logo-v3.webp`/`.png`. It is used by the shared `NikunjSakhiLogo` (header, mobile menu, hero, footer) and the login page. The favicon (peacock-feather crop), PWA icons, Apple touch icon and OG image were regenerated from it. The old v2 asset was removed. | `public/nikunj-sakhi-logo-v3.*`, `public/favicon-32.png`, `icon-192/512.png`, `apple-touch-icon.png`, `og-default.jpg`, `NikunjSakhiLogo.tsx`, `login/page.tsx` | Header + login screenshots; footer `src` checked in the DOM and the logo composited on the footer colour (`#1A0A00`), where it reads clearly |
| 2 | **Highlight colour → light brown and animated.** A new `.heading-highlight` class uses the Buy-button golds (`#8B6010 → #B07D22 → #C9922A`). It has a slow gradient flow, a periodic shine sweep and a twinkling ✦ marker, and `prefers-reduced-motion` turns the animation off. It is applied to the Shop sidebar boxes (Categories / Product Type / Highlights, etc.) and the 3 product-info column headings. | `globals.css`, `ProductFilters.tsx`, `products/[slug]/page.tsx` | `/collections` and product-page screenshots |
| 3 | **Wishlist "Add to Cart" always visible.** The card image wrapper was missing `relative`, so the `fill` image covered the whole card, including the transparent outline button underneath. The wrapper is now `relative overflow-hidden`, and the button has a solid cream background and semibold text. | `wishlist/page.tsx` | Screenshot: "Choose & Add" visible without hover |

`npx tsc --noEmit` passes.

---

## Round 5 — Back button, header logo spacing, footer logo clarity

| # | Change | Files | Verified |
|---|--------|-------|----------|
| 1 | **Back button (top-left).** A new shared `BackButton` goes to the previous page when the visitor came from inside the site; otherwise it goes to a set fallback (e.g. the parent category). It appears at the start of the breadcrumb bar on Shop / category / product pages, and at the top of Wishlist and Checkout. In Checkout it steps back through the steps first ("Back to Cart", "Back to Address") before leaving the page. | `components/ui/BackButton.tsx`, `CatalogPage.tsx`, `products/[slug]/page.tsx`, `checkout/page.tsx`, `wishlist/page.tsx` | Product page → Back returned to `/collections` |
| 2 | **Header logo no longer overlaps page content.** The hanging logo covered the breadcrumb ("Home › Shop › …"). The header bar is now taller (80px mobile / 112px desktop) and the logo sits fully inside it (72/104px, 64/92px when scrolled), with a slight hover zoom. Section scroll offsets and the sticky checkout summary were adjusted to the new header height. The old `pt-20` spacer on Checkout/Wishlist (left from the fixed-header era) was removed. | `Navbar.tsx`, home sections (`scroll-mt`), `checkout/page.tsx`, `wishlist/page.tsx` | Desktop 1280 + mobile 390 screenshots |
| 3 | **Footer logo crisp and legible.** The blur came from the CSS drop-shadow glows, and the dark teal "NIKUNJ" and the tagline disappeared on the dark footer. A dark-background version of the artwork, `nikunj-sakhi-logo-v3-dark.webp`, brightens only the dark tones (hue kept; the golds are unchanged) and is used, with no blur filters, wherever `variant="dark"` (footer and hero over image slides). The footer brand column now spans 2 of 6 grid columns, so the logo renders at 256px instead of about 205px. | `public/nikunj-sakhi-logo-v3-dark.{webp,png}`, `NikunjSakhiLogo.tsx`, `Footer.tsx` | Footer rendered in the browser: teal, gold and tagline all clear |

`npx tsc --noEmit` passes.

---

## Round 6 — Minimal header, login namaste art, Excel bulk import, Orders dashboard and returns

| # | Change | Files | Verified |
|---|--------|-------|----------|
| 1 | **Minimal header, full brand visible on entry.** The header bar is slimmer (64px mobile / 76px desktop, 56/64px when scrolled) with a smaller logo, and the nav text is lighter (`text-[11px] font-medium`, wide tracking) instead of heavy bold. The hero lost its extra top padding and is sized to `100svh` minus the header, so on first load the full logo, "Serve with Devotion" tagline, the "Bhakti ka Bhaav" headline and the four promise badges are all on screen. Section scroll offsets and the top padding of Checkout, Account, Track Order, Login, Reset Password and Confirmation were reduced to match. | `Navbar.tsx`, `HeroSection.tsx`, home sections, the pages listed | 1536×768 screenshot: logo, tagline, headline, CTAs and badges all visible without scrolling |
| 2 | **Login: namaste hands + new subtitle.** The supplied namaste-hands image was background-removed, tinted to the theme brown (`#8B6010`) and saved as `public/namaste-hands-v2.webp`. It sits beside "Namaste" with a soft gold drop-shadow and a gentle bow animation (disabled for reduced-motion). The subtitle is now "Sign in to Continue". | `login/page.tsx`, `globals.css`, `public/namaste-hands-v2.webp` | Login screenshot |
| 3 | **Excel bulk product import (Studio → "Bulk Import").** Steps: **Download Excel template** (Products, Instructions, and a Lists sheet with your live categories, product types, deities and fragrances) → fill one row per product → upload `.xlsx`/`.xls`/`.csv` → review the per-row check → **Import**. It handles every product field: name, slug, category, product type, deity, fragrance, descriptions, SKU, price/sale price, stock, images, variants (`Label;Price;MRP;Stock` separated by `\|`), colours with their own image and price (`Colour;Price;MRP;Hex;Image`), material, specifications (`Key: Value \| …`), care/return text, the collection flags, sort order, active status and SEO. Images can be `https://` links or local files picked in the **Images** button (matched by file name); each image is uploaded once and reused. Rows are validated against the same rules as the product form (lengths, sale price < price, variant MRP > price, unique variants, and the product type must belong to the category). Rows with errors are skipped and listed. A slug that matches an existing product **updates** it (optional); otherwise a new product is created. Products can be imported as **published** or as **drafts**, with a live progress bar and per-row result. | `src/cms/tools/BulkProductImport.tsx`, `sanity.config.ts`, `package.json` (`xlsx` 0.20.3 from the official SheetJS CDN, which has the security fixes the npm 0.18 build lacks) | `tsc` passes; Studio compiles with no console errors; Excel header round-trip checked with SheetJS. Studio UI needs your Sanity login to view |
| 4 | **Orders Dashboard (Studio → "Orders Dashboard").** One screen to run orders end to end. It shows live **stat cards** (new, confirmed, packing, shipped, delivered, returns, cancelled, COD to collect, sales today / this month / total); clicking a card filters the list. It has filter tabs with counts and search by order no., name, phone or AWB. Each order card shows items, amount, payment, address, the delivery partner/AWB and a **return-window badge**, with one-click actions per stage: **Confirm** (stock deducted) → **Send to delivery partner** (WhatsApp pickup message to the partner number in Admin Access, then status "Packing") → **Ship** (courier, AWB, tracking link, then WhatsApp the customer) → **Mark delivered** (COD is also marked paid) → **Record return request** (checked against the return window, default 7 days, editable in Admin Access) → **Approve / Reject** → **Item received back** (stock restored, refund marked due if prepaid) → **Mark refunded**. "COD received", "Cancel" (restocks) and "WhatsApp customer" are available where relevant, and every step is written to the order's status history. | `src/cms/tools/OrdersDashboard.tsx`, `src/cms/lib/orderOps.ts`, `orderMessages.ts`, `orderActions.ts`, `schemas/order.ts` (`returnInfo`, 4 return statuses), `schemas/adminSettings.ts` (`returnWindowDays`), `deskStructure.ts` (Returns / Refunded lists) | `tsc` passes; Studio compiles with no console errors |
| 5 | **Customer side of returns.** The new statuses (`return_requested`, `return_approved`, `returned`, `refunded`) are supported by the API, the order model and the WhatsApp status webhook, so customers get a WhatsApp update on approval, receipt and refund. **Account → Orders** and **Track Order** show an amber return banner instead of the delivery steps, and delivered orders get a **"Request a return"** WhatsApp link. | `types/index.ts`, `backend/models/Order.ts`, `api/orders/[id]/route.ts`, `api/webhooks/order-status/route.ts`, `account/page.tsx`, `track-order/page.tsx` | `tsc` passes |
| 6 | **QA pass on localhost.** Every internal link crawled from Home, Products and Collections returns 200 (collections, product types, products, policies, login, wishlist, track order). Two problems were found and fixed: the Studio crashed on load because `@sanity/icons` v5 no longer exports icons from its root (switched to per-icon imports such as `@sanity/icons/Package`), and `@sanity/ui` v4 renamed `space`/`columns` props to `gap`/`gridTemplateColumns`. | `sanity.config.ts`, both Studio tools | `/studio` returns 200 with no console errors |

**Notes for production**
- Run `npm run sanity:deploy` (or redeploy) so the new order statuses, `returnInfo` and `returnWindowDays` reach the hosted Studio.
- In **Admin Access**, set **Return window (days)** and the **delivery-partner WhatsApp number**.
- The top banner says "Free delivery on orders above ₹399", but the free-delivery threshold setting is ₹499 (shown on the hero badge). Make the Site Settings announcement and the threshold match.
- Some products have no slug, so their URLs are IDs (e.g. `/products/404ffd41-…`). Generate a slug for each in Studio for cleaner, SEO-friendly links.
- On this local network the DNS returns a NAT64 IPv6 address (`64:ff9b::…`) for `cdn.sanity.io`, and Next's image security check treats it as private, so a few thumbnails show 400 **only on localhost**. A normal production host is not affected; no code change was made (the alternative, `dangerouslyAllowLocalIP`, would weaken SSRF protection).

`npx tsc --noEmit` passes.

---

## Round 7 — Card image arrows, single Add to Cart, View All tile, Hindi Namaste, new banner, customer cancel/return requests

| # | Change | Files | Verified |
|---|--------|-------|----------|
| 1 | **Shop cards: image arrows and one Add to Cart.** Each product card cycles through all of the product's images, including variant (colour) images with duplicates removed. Previous/next chevrons and dots appear when there is more than one image; clicking them does not open the product. The extra floating "Add to Cart" in the hover overlay was removed, which leaves **Quick View** on hover and **one fixed Add to Cart** per card. | `src/frontend/components/products/ProductCard.tsx` | `/products`: 5 cards, 5 Add to Cart buttons; Next/Prev switch the visible image and stay on the page |
| 2 | **"View All Products" tile on the homepage** now uses the theme brown/gold gradient (`#8B6010 → #C9922A`), with a slow flowing-gradient animation and a shine sweep on hover. Animation is disabled for reduced-motion users. | `src/frontend/components/home/CategoryGrid.tsx`, `src/app/globals.css` (`.view-all-card`) | Screenshot; computed style shows the gradient and the `headingFlow` animation |
| 3 | **Login greeting:** the English "Namaste" was removed. The Hindi **नमस्ते** is larger (`text-5xl / sm:text-6xl`), and the namaste-hands image is resized to the same height. | `src/app/login/page.tsx` | Screenshot of `/login` |
| 4 | **The second-last homepage section (About banner)** uses the new Radha Krishna artwork. Updated again with the final artwork (Radha Krishna with a peacock and calf in front of temple carvings), saved as `about-radha-krishna-v2.webp` (1584×672, about 170 KB). The new file name means browsers don't keep showing the old cached image. | `public/about-radha-krishna-v2.webp`, `src/frontend/components/home/AboutSection.tsx` | Image present on `/` |
| 5 | **Customer order cancellation and return requests**, kept low-key: a small underlined text link on **Track Order** (Account → Orders → Track), not a button. **Cancel:** "Need to cancel this order?" appears while the order is Pending, Confirmed or Packing. The customer chooses a reason (plus optional details) and the request goes to the admin. The order status does **not** change until the admin approves. **Return:** "Return or report an issue (N days left)" appears after delivery, within the return window (Admin Access → Return window, default 7 days). It has a reason, details and **up to 4 photos** (JPG/PNG/WebP, 5 MB each). Photos are **required** for damaged, defective, wrong item, wrong size/colour and quality issues, so the admin can verify them. The order moves to **Return requested** and the customer gets a WhatsApp confirmation. One return request is allowed per order. Pending, approved and rejected outcomes (with the admin's note) are shown back to the customer. | `src/frontend/components/orders/OrderRequestPanel.tsx` (new), `src/app/track-order/page.tsx`, `src/app/api/orders/request/route.ts` (new), `src/app/api/track-order/route.ts`, `src/backend/lib/orderAccess.ts` (new, shared ownership check), `src/backend/lib/sanityOrders.ts`, `src/cms/lib/orderRequests.ts` (new, reasons and eligibility rules) | Panel renders; photo-required validation works; multipart submit works (mocked); API returns 400 for an invalid type, reason or order ID, and 429 after 5 requests in 10 minutes |
| 6 | **Admin handling in Sanity:** the order schema gains a read-only **Cancellation request** block (state, reason, details, requested/decided dates, admin note). `returnInfo` gains the reason category, **customer photos**, requested-by (customer/admin), and the rejection reason and date. **Orders Dashboard:** a new **🛑 Cancel requests** filter and stat card, and pending requests count in **Needs action**. A cancel request shows the customer's reason with **Approve cancellation** (cancels, restocks, marks the refund due if prepaid) or **Reject cancellation** (the order continues, with a note to the customer). Return requests show the reason and **photo thumbnails** (click for full size), then the usual Approve / Reject → Item received → Refunded flow. | `src/cms/schemas/order.ts`, `src/cms/tools/OrdersDashboard.tsx` | `tsc` passes |

**Security:** the request API checks order ownership (the mobile number used at checkout, or the signed-in owner), is rate-limited, validates the reason and length, and checks each photo's real file type from its magic bytes (not only the declared MIME type) before uploading it to Sanity.

**Admin workflow:** Studio → **Orders Dashboard** → **🛑 Cancel requests** or **🔁 Returns** → review the reason and photos → Approve or Reject (the note is shown to the customer). Every decision is written to the order's status history.

**Notes for production**
- Run `npm run sanity:deploy` (or restart the Studio) so the new `cancelRequest` and `returnInfo` fields appear in the hosted Studio.
- Cancel and return links appear only once the order has been pushed to Sanity (confirmed orders). Brand-new unconfirmed orders show tracking only.

`npx tsc --noEmit` passes.