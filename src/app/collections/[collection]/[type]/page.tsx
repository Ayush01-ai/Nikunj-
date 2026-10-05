import type { Metadata } from 'next';
import { CatalogPage, generateCatalogMetadata, type CatalogSearchParams } from '@/frontend/components/products/CatalogPage';

export const revalidate = 0;

interface PageProps {
  params: Promise<{ collection: string; type: string }>;
  searchParams: Promise<CatalogSearchParams>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { collection, type } = await params;
  return generateCatalogMetadata(collection, type);
}

export default async function ProductTypePage({ params, searchParams }: PageProps) {
  const { collection, type } = await params;
  return <CatalogPage categorySlug={collection} typeSlug={type} searchParams={await searchParams} />;
}
