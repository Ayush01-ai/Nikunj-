# NIKUNJ SAKHI — PRODUCTION DEPLOYMENT MASTER CONTEXT

You are working on the existing "Nikunj Sakhi" devotional e-commerce website.

The application was initially generated/developed using an AI coding tool and currently exists as a local codebase. It has NOT yet been deployed to production.

Your responsibility is to help prepare the EXISTING codebase for production deployment without unnecessarily rewriting, redesigning, or breaking existing functionality.

## CORE RULE

DO NOT rebuild the application from scratch.

DO NOT replace existing working functionality unless explicitly instructed.

DO NOT change the UI/design unless explicitly requested.

DO NOT rename existing routes, models, components, or files unless there is a technical reason and the change is approved.

Before modifying anything:

1. Inspect the existing implementation.
2. Identify dependencies and relationships.
3. Explain what needs to change.
4. Make the smallest safe change.
5. Run appropriate validation/tests.
6. Report exactly what was changed.

If an existing implementation already solves a requirement correctly, preserve it.

---

# CURRENT TECHNOLOGY

The current project uses:

* Next.js 16.2.6
* React 19.2.3
* TypeScript
* Tailwind CSS
* MongoDB/Mongoose
* Sanity CMS
* Cloudinary
* Razorpay
* Zustand
* React Hook Form
* Zod
* Three.js / React Three Fiber
* Framer Motion
* JWT
* bcryptjs
* Axios

The current package.json includes:

* mongoose
* @sanity/client
* next-sanity
* sanity
* cloudinary
* next-cloudinary
* razorpay
* jsonwebtoken
* bcryptjs
* crypto-js
* zod
* zustand

---

# CURRENT NEXT.JS CONFIGURATION

The project currently has:

next.config.mjs

Important existing configuration includes:

* allowedDevOrigins
* remote image patterns for:

  * cdn.sanity.io
  * res.cloudinary.com
  * images.unsplash.com
  * lh3.googleusercontent.com
* AVIF/WebP image formats
* Mongoose listed under serverExternalPackages
* Turbopack configuration
* NEXT_PUBLIC_SITE_URL
* Sanity environment variables
* Razorpay public key environment variable
* HTTP → HTTPS redirect using x-forwarded-proto
* security headers
* API no-store caching

PRESERVE these settings unless a deployment compatibility issue requires modification.

---

# DATABASE ARCHITECTURE

MongoDB is the primary application/business database.

MongoDB should remain responsible for:

* Products where applicable
* Customers
* Orders
* Order items
* Addresses
* Cart/business data where applicable
* Payment records
* Order status
* Other application-specific business data

DO NOT migrate MongoDB data to Supabase PostgreSQL.

DO NOT duplicate business records unnecessarily between MongoDB and Supabase.

The existing Mongoose models and API routes should be preserved wherever possible.

---

# CONTENT MANAGEMENT

Sanity is already installed and used by the application.

Sanity should continue to handle CMS/content functionality that is already implemented.

Do not replace Sanity with another CMS unless explicitly instructed.

---

# IMAGE MANAGEMENT

Cloudinary is already installed and used by the application.

Sanity images and Cloudinary images are already allowed by next.config.mjs.

Do not remove either integration without inspecting where it is used.

---

# PAYMENT

Razorpay is currently installed:

razorpay: ^2.9.4

The existing application may already contain Razorpay payment functionality.

IMPORTANT:

Do not replace Razorpay with Cashfree automatically.

First inspect the existing Razorpay implementation.

Determine:

* where Razorpay orders are created
* how payment signatures are verified
* how payment status is stored
* how orders are created
* whether webhooks are implemented
* whether duplicate payment/order creation is possible
* whether secrets are server-side
* whether client-controlled amounts are trusted

Only change the payment provider if explicitly instructed later.

---

# AUTHENTICATION

The current project may contain custom JWT/bcrypt authentication.

Before introducing Supabase Auth:

1. Locate the existing authentication implementation.
2. Identify login/signup routes.
3. Identify password handling.
4. Identify JWT creation and verification.
5. Identify admin authentication.
6. Identify customer authentication.
7. Identify protected API routes.
8. Determine whether the existing implementation should be retained or migrated.

Do not install Supabase authentication packages until explicitly instructed.

If Supabase Auth is introduced later, Supabase should primarily handle:

* identity
* authentication
* sessions
* login
* signup
* password reset

MongoDB should continue to hold application/business/customer profile data.

Passwords must NOT be stored in MongoDB if Supabase Auth becomes the authentication authority.

---

# FUTURE HOSTING TARGET

The intended production hosting platform is:

Cloudflare Workers

However:

DO NOT install Cloudflare deployment packages yet.

DO NOT migrate the project to vinext yet.

DO NOT create wrangler configuration yet.

First inspect the existing application for Cloudflare compatibility.

The application uses server-side functionality, Mongoose, API routes and third-party SDKs, so deployment compatibility must be evaluated before changing the build system.

---

# FUTURE DATABASE HOSTING

The intended production MongoDB provider is:

MongoDB Atlas

The local development database, if currently used, should eventually be replaced by a cloud-hosted MongoDB Atlas deployment for production.

The application should use environment variables for the production MongoDB connection string.

Never hardcode MongoDB credentials.

---

# FUTURE AUTHENTICATION OPTION

Supabase Auth may be introduced later.

Potential architecture:

Customer
↓
Supabase Auth
↓
authenticated session
↓
Next.js server/API
↓
Supabase user ID
↓
MongoDB customer record

Do not duplicate authentication credentials in MongoDB.

---

# SECURITY REQUIREMENTS

Never expose secrets in client-side code.

Never commit:

* MongoDB passwords
* MongoDB connection strings
* Razorpay secret
* JWT secret
* Supabase service-role key
* Cloudinary secret
* API private keys
* webhook secrets

Environment variables must be used.

Public environment variables should only contain values that are intentionally safe for browser exposure.

Server secrets must remain server-side.

---

# PAYMENT SECURITY

For payment implementation:

NEVER trust the payment amount supplied by the browser.

The server must calculate/validate the order total using trusted product/order information.

Payment verification must happen server-side.

Webhook processing should be idempotent.

Repeated webhook events must not create duplicate orders or duplicate payment records.

Payment status should be updated only after successful verification.

---

# ORDER SECURITY

Customers must only be able to access their own orders.

Admin functionality must remain separate from normal customer functionality.

Do not expose unrestricted GET/PATCH/DELETE order APIs.

Existing order APIs must be audited before production deployment.

---

# EXISTING ORDER STRUCTURE

Known existing implementation includes:

MongoDB connection:
mongodb.ts

Order model:
Order.ts

Create order:
POST /api/orders

Get orders:
GET /api/orders

Get individual order:
GET /api/orders/[id]

Update order:
PATCH /api/orders/[id]

The exact locations should be discovered from the actual project before modifying them.

Do not assume these are the only order-related files.

---

# DEPLOYMENT PRINCIPLE

The project should progress through these phases:

PHASE 0
Audit current codebase

PHASE 1
Make local application production-ready

PHASE 2
Move database to MongoDB Atlas

PHASE 3
Verify all database/API functionality

PHASE 4
Audit and improve authentication

PHASE 5
Integrate/secure payment system

PHASE 6
Security audit

PHASE 7
GitHub repository and version control

PHASE 8
Cloudflare Workers deployment

PHASE 9
Production environment variables

PHASE 10
Production authentication configuration

PHASE 11
Production payment/webhook configuration

PHASE 12
Custom domain

PHASE 13
End-to-end production testing

---

# AI CODING AGENT BEHAVIOR

Before each task:

1. Inspect relevant files.
2. Do not modify unrelated files.
3. Do not introduce unnecessary dependencies.
4. Do not upgrade packages unless explicitly requested.
5. Do not delete existing functionality.
6. Do not change visual design unless explicitly requested.
7. Keep changes reversible.
8. Explain changes after implementation.
9. Report any assumptions.
10. Report any remaining risks.

If you discover a potentially breaking architectural issue, STOP and explain it before making a large change.

---

# CURRENT OBJECTIVE

For the first task ONLY:

AUDIT THE EXISTING CODEBASE.

Do NOT modify application code yet.

Identify:

1. Next.js application structure
2. App Router / Pages Router usage
3. API routes
4. MongoDB connection
5. Mongoose models
6. Order APIs
7. Product data source
8. Sanity integration
9. Cloudinary integration
10. Razorpay integration
11. Authentication implementation
12. Admin authentication/authorization
13. JWT usage
14. Environment variables used
15. Middleware
16. Server actions if any
17. Client-side components that call APIs
18. Existing deployment configuration
19. Existing scripts
20. Any obvious production blockers

Produce a concise report with:

* Current architecture
* Important files
* Data flow
* Authentication flow
* Payment flow
* Current environment variables (names only, never values)
* Production risks
* Recommended next step

DO NOT MODIFY ANY FILE FOR THIS AUDIT.
