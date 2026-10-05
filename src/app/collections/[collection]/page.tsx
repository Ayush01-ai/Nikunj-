import type { Metadata } from 'next';
import { CatalogPage, generateCatalogMetadata, type CatalogSearchParams } from '@/frontend/components/products/CatalogPage';

export const revalidate = 0;

interface PageProps {
  params: Promise<{ collection: string }>;
  searchParams: Promise<CatalogSearchParams>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { collection } = await params;
  return generateCatalogMetadata(collection);
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { collection } = await params;
  return <CatalogPage categorySlug={collection} searchParams={await searchParams} />;
}
