import { MetadataRoute } from 'next';
import { client } from '@/cms/lib/client';
import { ALL_PRODUCT_SLUGS_QUERY, ALL_CATEGORY_SLUGS_QUERY, ALL_TYPE_PATHS_QUERY } from '@/cms/lib/queries';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nikunjsakhi.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let productSlugs: { slug: string; _updatedAt: string }[] = [];
  let categorySlugs: { slug: string; _updatedAt: string }[] = [];
  let typePaths: { slug: string; category: string }[] = [];
  try {
    [productSlugs, categorySlugs, typePaths] = await Promise.all([
      client.fetch<{ slug: string; _updatedAt: string }[]>(ALL_PRODUCT_SLUGS_QUERY),
      client.fetch<{ slug: string; _updatedAt: string }[]>(ALL_CATEGORY_SLUGS_QUERY),
      client.fetch<{ slug: string; category: string }[]>(ALL_TYPE_PATHS_QUERY),
    ]);
  } catch { /* return static routes only */ }

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/collections`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    ...['privacy', 'terms', 'return', 'shipping'].map((slug) => ({
      url: `${BASE_URL}/policies/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];

  const productRoutes: MetadataRoute.Sitemap = productSlugs.map(({ slug, _updatedAt }) => ({
    url: `${BASE_URL}/products/${slug}`,
    lastModified: _updatedAt ? new Date(_updatedAt) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categorySlugs.map(({ slug }) => ({
    url: `${BASE_URL}/collections/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const typeRoutes: MetadataRoute.Sitemap = typePaths
    .filter(({ category }) => Boolean(category))
    .map(({ slug, category }) => ({
      url: `${BASE_URL}/collections/${category}/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

  return [...staticRoutes, ...productRoutes, ...categoryRoutes, ...typeRoutes];
}
