import type { Metadata } from 'next';
import { client } from '@/cms/lib/client';
import { ALL_CATEGORY_SLUGS_QUERY } from '@/cms/lib/queries';
import { CatalogPage, generateCatalogMetadata } from '@/frontend/components/products/CatalogPage';

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ collection: string }>;
}

export async function generateStaticParams() {
  try {
    const rows = await client.fetch<{ slug: string }[]>(ALL_CATEGORY_SLUGS_QUERY, {}, { next: { revalidate: 3600 } });
    return rows.map(({ slug }) => ({ collection: slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { collection } = await params;
  return generateCatalogMetadata(collection);
}

export default async function CategoryPage({ params }: PageProps) {
  const { collection } = await params;
  return <CatalogPage categorySlug={collection} />;
}
