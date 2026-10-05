# Nikunj Sakhi — Divine God Ornaments

Production-grade Next.js 14 e-commerce website for handcrafted devotional ornaments.

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Sanity CMS v3** (Embedded Studio at `/studio`)
- **Tailwind CSS 3** with custom gold/cream/deep design system
- **Framer Motion** + **GSAP** animations
- **React Three Fiber** (Three.js) — 3D hero scene
- **Zustand** — cart, auth, wishlist state
- **MongoDB + Mongoose** — orders, users, OTPs
- **Razorpay** — payment gateway
- **Cloudinary** — media storage
- **MSG91** — OTP delivery

## Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd nikunj
npm install
```

### 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
cp .env.local.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SANITY_PROJECT_ID` — from sanity.io
- `NEXT_PUBLIC_SANITY_DATASET` — usually `production`
- `SANITY_API_TOKEN` — from Sanity → API → Tokens (Editor access)
- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — random 64-char secret
- `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` — from Razorpay Dashboard
- `MSG91_AUTH_KEY` + `MSG91_TEMPLATE_ID` — from MSG91 (optional in dev)
- `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`

### 3. Set Up Sanity

```bash
npx sanity login
npx sanity init --reconfigure  # use existing project ID
```

### 4. Run Dev Server

```bash
npm run dev
```

Open http://localhost:3000
Sanity Studio: http://localhost:3000/studio

### 5. Add Content in Studio

1. **Site Settings** — brand name, tagline, WhatsApp number, policies
2. **Hero Slides** — homepage banner images with CTA buttons
3. **Categories** — create deity collections (Radha Krishna, Laddu Gopal, etc.)
4. **Products** — add products with images, pricing, variants, SEO

## Deployment (Vercel)

```bash
vercel --prod
```

Add all environment variables in Vercel → Project Settings → Environment Variables.

After deploying, update `NEXT_PUBLIC_SITE_URL` to your live domain.

## Project Structure

```
app/
  page.tsx              # Homepage (server component)
  products/             # Products listing + detail pages
  checkout/             # 3-step checkout
  confirmation/         # Order success page
  login/                # OTP authentication
  account/              # User dashboard
  wishlist/             # Wishlist page
  studio/               # Embedded Sanity Studio
  api/
    auth/               # OTP send & verify
    orders/             # Order CRUD
    payment/            # Razorpay create & verify
    coupon/             # Coupon validation

sanity/
  schemas/              # Sanity content schemas
  lib/                  # client, image builder, GROQ queries

components/
  3d/                   # Three.js Scene3D
  home/                 # Homepage sections
  layout/               # Navbar, Footer
  products/             # ProductCard, ProductDetail, Filters
  cart/                 # CartSidebar
  ui/                   # WhatsAppFloat, SearchModal

store/                  # Zustand stores (cart, auth, wishlist)
models/                 # Mongoose models (User, Order, Otp)
lib/                    # MongoDB, auth utilities, Razorpay
types/                  # TypeScript interfaces
```

## Design System

| Token | Color |
|-------|-------|
| Gold | `#C9922A` |
| Gold Light | `#E8C16A` |
| Gold Dark | `#8B6010` |
| Cream | `#FFF8EE` |
| Deep | `#1A0A00` |
| Teal | `#1a6b5a` |

Fonts: Cinzel Decorative, Cinzel, Crimson Text, Great Vibes, Lato

## License

Proprietary — Nikunj Sakhi © 2024
