import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nikunjsakhi.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/studio/', '/api/', '/checkout/', '/confirmation/', '/account/', '/login/', '/wishlist/', '/deliver/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
