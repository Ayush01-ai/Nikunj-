import { permanentRedirect } from 'next/navigation';
import { groq } from 'next-sanity';
import { client } from '@/cms/lib/client';

// Legacy /products?category=…&productType=… listing → clean /collections routes.
const LEGACY_LOOKUP_QUERY = groq`{
  "category": *[_type == "category" && isActive == true && slug.current == $category][0].slug.current,
  "typeCategory": *[_type == "productType" && isActive != false && slug.current == $type][0].category->slug.current
}`;

interface LegacyProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacyProductsPage({ searchParams }: LegacyProductsPageProps) {
  const sp = await searchParams;
  const get = (key: string) => (typeof sp[key] === 'string' ? (sp[key] as string) : '');
  const categoryParam = get('category');
  const typeParam = get('productType');

  let lookup: { category: string | null; typeCategory: string | null } = { category: null, typeCategory: null };
  if (categoryParam || typeParam) {
    try {
      lookup = await client.fetch(LEGACY_LOOKUP_QUERY, { category: categoryParam, type: typeParam });
    } catch { /* fall back to /collections */ }
  }

  const category = lookup.typeCategory ?? lookup.category;
  const type = lookup.typeCategory ? typeParam : '';

  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string' && value && key !== 'category' && key !== 'productType') rest.set(key, value);
  }

  const path = ['/collections', category, type].filter(Boolean).map((s, i) => (i === 0 ? s : encodeURIComponent(s as string))).join('/');
  const qs = rest.toString();
  permanentRedirect(qs ? `${path}?${qs}` : path);
}
