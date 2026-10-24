import type { Metadata } from 'next';
import { CatalogPage, generateCatalogMetadata } from '@/frontend/components/products/CatalogPage';

export const revalidate = false; // on-demand only (see /api/revalidate); no queue for time-based ISR
export const fetchCache = 'force-cache'; // build-time Sanity reads are frozen into this deployment

export async function generateMetadata(): Promise<Metadata> {
  return generateCatalogMetadata();
}

export default function CollectionsPage() {
  return <CatalogPage />;
}
