import type { Metadata } from 'next';
import { CatalogPage, generateCatalogMetadata } from '@/frontend/components/products/CatalogPage';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return generateCatalogMetadata();
}

export default function CollectionsPage() {
  return <CatalogPage />;
}
