import type { Metadata } from 'next';
import { client } from '@/cms/lib/client';
import { ALL_TYPE_PATHS_QUERY } from '@/cms/lib/queries';
import { CatalogPage, generateCatalogMetadata } from '@/frontend/components/products/CatalogPage';

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ collection: string; type: string }>;
}

export async function generateStaticParams() {
  try {
    const rows = await client.fetch<{ slug: string; category: string }[]>(ALL_TYPE_PATHS_QUERY, {}, { next: { revalidate: 3600 } });
    return rows.map(({ slug, category }) => ({ collection: category, type: slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { collection, type } = await params;
  return generateCatalogMetadata(collection, type);
}

export default async function ProductTypePage({ params }: PageProps) {
  const { collection, type } = await params;
  return <CatalogPage categorySlug={collection} typeSlug={type} />;
}
