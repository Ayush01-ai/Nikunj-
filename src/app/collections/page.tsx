import type { Metadata } from 'next';
import { CatalogPage, generateCatalogMetadata, type CatalogSearchParams } from '@/frontend/components/products/CatalogPage';

export const revalidate = 3600;

interface PageProps {
  searchParams: Promise<CatalogSearchParams>;
}

export async function generateMetadata(): Promise<Metadata> {
  return generateCatalogMetadata();
}

export default async function CollectionsPage({ searchParams }: PageProps) {
  return <CatalogPage searchParams={await searchParams} />;
}
