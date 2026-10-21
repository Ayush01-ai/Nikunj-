import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { client } from '@/cms/lib/client';
import { safeImageUrl, IMAGE_PLACEHOLDER } from '@/cms/lib/image';
import {
  PRODUCTS_QUERY,
  PRODUCTS_COUNT_QUERY,
  CATALOG_CATEGORIES_QUERY,
  CATALOG_TYPES_QUERY,
  DEITIES_QUERY,
  FRAGRANCES_QUERY,
  SITE_SETTINGS_QUERY,
  toSearchPattern,
} from '@/cms/lib/queries';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { BackButton } from '@/frontend/components/ui/BackButton';
import { Footer } from '@/frontend/components/layout/Footer';
import { AnnouncementBar } from '@/frontend/components/home/AnnouncementBar';
import { ProductCard } from '@/frontend/components/products/ProductCard';
import { ProductFilters } from '@/frontend/components/products/ProductFilters';
import { CartSidebar } from '@/frontend/components/cart/CartSidebar';
import { WhatsAppFloat } from '@/frontend/components/ui/WhatsAppFloat';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';
import { ProductTypeIcon, iconForTypeName } from '@/frontend/components/ui/ProductTypeIcon';
import type { Product, Category, Deity, ProductType, Fragrance, SiteSettings } from '@/types';

export interface CatalogSearchParams {
  deity?: string;
  fragrance?: string;
  featuredOnly?: string;
  bestsellerOnly?: string;
  newArrivalOnly?: string;
  search?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
  page?: string;
}

interface CatalogPageProps {
  categorySlug?: string;
  typeSlug?: string;
  searchParams: CatalogSearchParams;
}

const PAGE_SIZE = 12;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nikunjsakhi.com';

async function safeFetch<T>(query: string, params: Record<string, string | number | boolean>, fallback: T): Promise<T> {
  try {
    return await client.fetch<T>(query, params);
  } catch {
    return fallback;
  }
}

async function getCatalogContext(categorySlug?: string, typeSlug?: string) {
  const [categories, types] = await Promise.all([
    safeFetch<Category[]>(CATALOG_CATEGORIES_QUERY, {}, []),
    safeFetch<ProductType[]>(CATALOG_TYPES_QUERY, { category: categorySlug ?? '' }, []),
  ]);
  const category = categorySlug ? categories.find((c) => c.slug.current === categorySlug) : undefined;
  const type = typeSlug ? types.find((t) => t.slug.current === typeSlug) : undefined;
  return { categories, types, category, type };
}

export async function generateCatalogMetadata(categorySlug?: string, typeSlug?: string): Promise<Metadata> {
  const { category, type } = await getCatalogContext(categorySlug, typeSlug);
  const path = ['/collections', categorySlug, typeSlug].filter(Boolean).join('/');

  if (type && category) {
    return {
      title: `${type.name} — ${category.name}`,
      description: type.description || `Shop ${type.name} in ${category.name} at Nikunj Sakhi.`,
      alternates: { canonical: path },
    };
  }
  if (category) {
    return {
      title: category.seoTitle || category.name,
      description: category.seoDescription || category.description || `Shop ${category.name} at Nikunj Sakhi.`,
      alternates: { canonical: path },
    };
  }
  return {
    title: 'Shop Products',
    description: 'Browse all handcrafted divine god ornaments, deity shringar and pooja essentials.',
    alternates: { canonical: '/collections' },
  };
}

export async function CatalogPage({ categorySlug, typeSlug, searchParams }: CatalogPageProps) {
  const { categories, types, category, type } = await getCatalogContext(categorySlug, typeSlug);
  if (categorySlug && !category) notFound();
  if (typeSlug && !type) notFound();

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const params = {
    category: categorySlug ?? '',
    productType: typeSlug ?? '',
    deity: searchParams.deity || '',
    fragrance: searchParams.fragrance || '',
    search: toSearchPattern(searchParams.search || ''),
    minPrice: parseInt(searchParams.minPrice || '0', 10) || 0,
    maxPrice: parseInt(searchParams.maxPrice || '0', 10) || 0,
    featuredOnly: searchParams.featuredOnly === 'true',
    bestsellerOnly: searchParams.bestsellerOnly === 'true',
    newArrivalOnly: searchParams.newArrivalOnly === 'true',
    sort: searchParams.sort || 'default',
    from,
    to: from + PAGE_SIZE,
  };

  const [products, totalCount, deities, fragrances, settings] = await Promise.all([
    safeFetch<Product[]>(PRODUCTS_QUERY, params, []),
    safeFetch<number>(PRODUCTS_COUNT_QUERY, params, 0),
    safeFetch<Deity[]>(DEITIES_QUERY, {}, []),
    safeFetch<Fragrance[]>(FRAGRANCES_QUERY, {}, []),
    safeFetch<SiteSettings | null>(SITE_SETTINGS_QUERY, {}, null),
  ]);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Show only filters relevant to the current type (or any type in the category).
  const facets = new Set((type ? [type] : types).flatMap((t) => t.appliesFacets ?? []));
  const showDeity = facets.size === 0 || facets.has('deity');
  const showFragrance = facets.size === 0 || facets.has('fragrance');

  const basePath = ['/collections', categorySlug, typeSlug].filter(Boolean).join('/');
  const searchTerm = (searchParams.search || '').trim();
  const title = type?.name ?? category?.name ?? (searchTerm ? `Results for “${searchTerm}”` : 'All Collections');
  // Root shop shows every type that has products; a category page shows its own types.
  const typeTiles = types.filter((t) => (t.productCount ?? 0) > 0);
  const allHref = categorySlug ? `/collections/${categorySlug}` : '/collections';
  const typeHref = (t: ProductType) => {
    const cat = categorySlug ?? t.category?.slug?.current;
    return cat ? `/collections/${cat}/${t.slug.current}` : '/collections';
  };

  const breadcrumbs = [
    { name: 'Home', href: '/' },
    { name: 'Shop', href: '/collections' },
    ...(category ? [{ name: category.name, href: `/collections/${category.slug.current}` }] : []),
    ...(category && type ? [{ name: type.name, href: basePath }] : []),
  ];
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: `${SITE_URL}${b.href === '/' ? '' : b.href}`,
    })),
  };

  const pageHref = (p: number) => {
    const qs = new URLSearchParams(
      Object.entries({ ...searchParams, page: String(p) }).filter(([, v]) => Boolean(v)) as [string, string][],
    ).toString();
    return `${basePath}?${qs}`;
  };

  return (
    <>
      {settings?.announcementActive && (
        <AnnouncementBar
          text={settings.announcement}
          whatsappNumber={settings.whatsappNumber}
          instagramHandle={settings.instagramHandle}
        />
      )}
      <Navbar settings={settings} />
      <CartSidebar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, '\\u003c') }}
      />

      <main className="min-h-screen bg-cream">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-[var(--border)] px-4 sm:px-6 lg:px-8 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
          <BackButton fallbackHref={breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].href : '/'} />
          <nav aria-label="Breadcrumb" className="min-w-0 flex flex-wrap items-center gap-2 font-cinzel text-[10px] tracking-widest uppercase">
            {breadcrumbs.map((b, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <span key={b.href} className="flex items-center gap-2">
                  {isLast ? (
                    <span className="text-gold" aria-current="page">{b.name}</span>
                  ) : (
                    <Link href={b.href} className="text-[var(--text-mid)] hover:text-gold transition-colors">{b.name}</Link>
                  )}
                  {!isLast && <span className="text-gold/50" aria-hidden="true">›</span>}
                </span>
              );
            })}
          </nav>
          </div>
        </div>

        {/* Page Header */}
        <div className="relative bg-white border-b border-[var(--border)] py-10 px-4 sm:px-6 lg:px-8 text-center overflow-hidden">
          {category?.bannerImage?.asset && !type && (
            <Image
              src={safeImageUrl(category.bannerImage, 1600, 400, 75) || IMAGE_PLACEHOLDER}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-20"
            />
          )}
          <div className="relative">
            <span className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-2">
              {type && category ? category.name : 'Divine Ornaments & Pooja Essentials'}
            </span>
            <h1 className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep mb-2">{title}</h1>
            <p className="font-crimson italic text-[var(--text-mid)]">
              {totalCount} {totalCount === 1 ? 'product' : 'products'} found
            </p>
          </div>
        </div>

        {/* Product-type tiles: "All" first, then each type that has products */}
        {typeTiles.length > 0 && (
          <div className="bg-white border-b border-[var(--border)]">
            <ul
              aria-label="Shop by product type"
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex gap-3 sm:gap-5 overflow-x-auto list-none scrollbar-hide"
            >
              {[
                { key: 'all', name: category ? `All ${category.name}` : 'All Products', href: allHref, active: !typeSlug, image: undefined, icon: 'all' as const, count: undefined as number | undefined },
                ...typeTiles.map((t) => ({
                  key: t._id,
                  name: t.name,
                  href: t.slug.current === typeSlug ? allHref : typeHref(t),
                  active: t.slug.current === typeSlug,
                  image: t.image,
                  icon: iconForTypeName(t.name, t.icon),
                  count: t.productCount,
                })),
              ].map((tile) => (
                <li key={tile.key} className="flex-shrink-0">
                  <Link
                    href={tile.href}
                    aria-current={tile.active ? 'page' : undefined}
                    className="group flex flex-col items-center gap-2 w-[76px] sm:w-20 text-center"
                  >
                    <span
                      className={`relative w-16 h-16 rounded-full overflow-hidden flex items-center justify-center border-2 transition-all duration-300 group-hover:-translate-y-0.5 ${
                        tile.active
                          ? 'border-gold bg-gold/15 shadow-gold-sm'
                          : 'border-[var(--border)] bg-cream group-hover:border-gold/60'
                      }`}
                    >
                      {tile.image?.asset ? (
                        <Image
                          src={safeImageUrl(tile.image, 128, 128) || IMAGE_PLACEHOLDER}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <ProductTypeIcon name={tile.icon} size={30} className="group-hover:scale-110 transition-transform duration-300" />
                      )}
                    </span>
                    <span className={`font-cinzel text-[10px] tracking-wider leading-tight ${tile.active ? 'text-gold-dark font-semibold' : 'text-[var(--text-mid)] group-hover:text-gold'}`}>
                      {tile.name}
                      {tile.count ? <span className="block text-[9px] text-[var(--text-light,#9a8a78)] font-lato tracking-normal">{tile.count} {tile.count === 1 ? 'item' : 'items'}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            <aside className="w-full lg:w-64 flex-shrink-0">
              <Suspense fallback={<div className="skeleton h-96" />}>
                <ProductFilters
                  categories={categories}
                  deities={deities}
                  productTypes={types}
                  fragrances={fragrances}
                  activeCategory={categorySlug}
                  activeProductType={typeSlug}
                  showDeity={showDeity}
                  showFragrance={showFragrance}
                />
              </Suspense>
            </aside>

            <div className="flex-1">
              {products.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                    {products.map((product, i) => (
                      <ProductCard key={product._id} product={product} index={i} inView />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <nav aria-label="Pagination" className="flex justify-center gap-2 mt-12">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <Link
                          key={p}
                          href={pageHref(p)}
                          aria-current={p === page ? 'page' : undefined}
                          className={`w-10 h-10 flex items-center justify-center border font-cinzel text-xs transition-all ${
                            p === page
                              ? 'bg-gold border-gold text-white'
                              : 'border-[var(--border)] text-[var(--text-mid)] hover:border-gold hover:text-gold'
                          }`}
                        >
                          {p}
                        </Link>
                      ))}
                    </nav>
                  )}
                </>
              ) : (
                <div className="text-center py-24">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold shadow-gold-sm">
                    <SacredIcon name="lotus" size={32} />
                  </div>
                  <p className="font-cinzel text-lg text-[var(--text-mid)] mb-2 font-semibold">No products found</p>
                  <p className="font-crimson italic text-[var(--text-mid)]">
                    {category ? `New ${title} pieces are coming soon.` : 'Try a different filter or browse all collections.'}
                  </p>
                  <Link href={category ? basePath : '/collections'} className="btn-gold mt-6 inline-block">
                    {category ? 'Clear Filters' : 'Browse All'}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer settings={settings} />
      <WhatsAppFloat
        number={settings?.whatsappNumber || '919999999999'}
        message="Namaste! 🙏 I'd like to know more about your divine ornaments."
      />
    </>
  );
}
