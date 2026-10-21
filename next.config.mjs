/** Clerk's Frontend API host is encoded in the publishable key (pk_live_<base64("host$")>). */
function clerkFrontendHost() {
  const key = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').trim().replace(/^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=/, '');
  try {
    const host = Buffer.from(key.split('_')[2] || '', 'base64').toString('utf8').replace(/\$$/, '');
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : '';
  } catch {
    return '';
  }
}

/**
 * Content-Security-Policy for the storefront (Studio is excluded — Sanity manages its own).
 * Only the third parties the site actually uses are allowed: Clerk (auth), Cashfree (checkout),
 * Google Analytics (after cookie consent) and Sanity (content/images).
 */
function contentSecurityPolicy() {
  const isDev = process.env.NODE_ENV !== 'production';
  const clerk = [clerkFrontendHost(), 'https://*.clerk.accounts.dev', 'https://*.clerk.com', 'https://challenges.cloudflare.com'].filter(Boolean).join(' ');
  const cashfree = 'https://*.cashfree.com';
  const google = 'https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com';
  const sanity = 'https://*.api.sanity.io https://*.apicdn.sanity.io https://cdn.sanity.io';
  const directives = [
    "default-src 'self'",
    // Next.js inlines bootstrap scripts; dev mode additionally needs eval for fast refresh.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} ${clerk} ${cashfree} ${google} https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: https:",
    `connect-src 'self'${isDev ? ' ws: wss:' : ''} ${clerk} ${cashfree} ${google} ${sanity}`,
    `frame-src 'self' ${clerk} ${cashfree}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${cashfree}`,
    "frame-ancestors 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];
  return directives.join('; ');
}

/** @type {import('next').NextConfig} */const nextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1', '192.168.1.4'],
  images: {
    // Sanity's CDN already serves optimized images; the Node optimizer isn't available on Cloudflare Workers.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.sanity.io' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  // Next.js 16: moved out of experimental
  serverExternalPackages: ['mongoose'],
  // Silence Turbopack warning (no custom webpack needed for GLSL at runtime)
  turbopack: {},
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SANITY_PROJECT_ID: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    NEXT_PUBLIC_SANITY_DATASET: process.env.NEXT_PUBLIC_SANITY_DATASET,
  },
  async redirects() {
    return [
      {
        // x-forwarded-proto is set by the hosting proxy; local dev has no header so nothing redirects.
        source: '/:path*',
        has: [
          { type: 'header', key: 'x-forwarded-proto', value: 'http' },
          { type: 'host', value: '(?<host>.+)' },
        ],
        destination: 'https://:host/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      // payment= lets the Cashfree checkout iframe use the Payment Request API (e.g. wallets).
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://sdk.cashfree.com" "https://api.cashfree.com" "https://sandbox.cashfree.com" "https://payments.cashfree.com" "https://payments-test.cashfree.com")' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ];
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // Studio is excluded so Sanity's own tooling keeps working
        source: '/((?!studio).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
