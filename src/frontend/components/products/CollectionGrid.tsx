'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ProductCard } from '@/frontend/components/products/ProductCard';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';
import type { Product } from '@/types';

export const PAGE_SIZE = 12;

type Params = Pick<URLSearchParams, 'get'>;

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
}

function haystack(p: Product): string[] {
  return tokens(
    [p.name, p.deity, p.productType?.name, p.category?.name, p.fragrance?.name, p.shortDescription, p.material]
      .filter(Boolean)
      .join(' '),
  );
}

/** Mirrors the former GROQ filters + ordering, but runs in the browser. */
export function filterAndSort(products: Product[], sp: Params): Product[] {
  const deity = sp.get('deity') || '';
  const fragrance = sp.get('fragrance') || '';
  const minPrice = parseInt(sp.get('minPrice') || '0', 10) || 0;
  const maxPrice = parseInt(sp.get('maxPrice') || '0', 10) || 0;
  const featuredOnly = sp.get('featuredOnly') === 'true';
  const bestsellerOnly = sp.get('bestsellerOnly') === 'true';
  const newArrivalOnly = sp.get('newArrivalOnly') === 'true';
  const sort = sp.get('sort') || 'default';
  const words = tokens((sp.get('search') || '').slice(0, 200)).slice(0, 8);

  const list = products.filter((p) => {
    if (deity && p.deityRef?.slug?.current !== deity) return false;
    if (fragrance && p.fragrance?.slug?.current !== fragrance) return false;
    if (minPrice && p.price < minPrice) return false;
    if (maxPrice && p.price > maxPrice) return false;
    if (featuredOnly && !p.isFeatured) return false;
    if (bestsellerOnly && !p.isBestseller) return false;
    if (newArrivalOnly && !p.isNewArrival) return false;
    if (words.length) {
      const hay = haystack(p);
      if (!words.every((w) => hay.some((t) => t.startsWith(w)))) return false;
    }
    return true;
  });

  const created = (p: Product) => p._createdAt ?? '';
  const byDefault = (a: Product, b: Product) =>
    (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || created(b).localeCompare(created(a));

  return list.sort((a, b) => {
    switch (sort) {
      case 'price_asc':
        return a.price - b.price || byDefault(a, b);
      case 'price_desc':
        return b.price - a.price || byDefault(a, b);
      case 'newest':
        return created(b).localeCompare(created(a)) || byDefault(a, b);
      case 'featured':
        return Number(!!b.isFeatured) - Number(!!a.isFeatured) || byDefault(a, b);
      default:
        return byDefault(a, b);
    }
  });
}

function Empty({ clearHref, hasCategory, title }: { clearHref: string; hasCategory: boolean; title: string }) {
  return (
    <div className="text-center py-24">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold shadow-gold-sm">
        <SacredIcon name="lotus" size={32} />
      </div>
      <p className="font-cinzel text-lg text-[var(--text-mid)] mb-2 font-semibold">No products found</p>
      <p className="font-crimson italic text-[var(--text-mid)]">
        {hasCategory ? `New ${title} pieces are coming soon.` : 'Try a different filter or browse all collections.'}
      </p>
      <Link prefetch={false} href={clearHref} className="btn-gold mt-6 inline-block">
        {hasCategory ? 'Clear Filters' : 'Browse All'}
      </Link>
    </div>
  );
}

interface ViewProps {
  products: Product[];
  total: number;
  page: number;
  pageHref: (p: number) => string;
  clearHref: string;
  hasCategory: boolean;
  title: string;
}

function GridView({ products, total, page, pageHref, clearHref, hasCategory, title }: ViewProps) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  return (
    <>
      <p className="font-crimson italic text-sm text-[var(--text-mid)] mb-3">
        {total} {total === 1 ? 'product' : 'products'} found
      </p>
      {products.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {products.map((product, i) => (
              <ProductCard key={product._id} product={product} index={i} inView />
            ))}
          </div>
          {totalPages > 1 && (
            <nav aria-label="Pagination" className="flex justify-center gap-2 mt-12">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link prefetch={false}
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
        <Empty clearHref={clearHref} hasCategory={hasCategory} title={title} />
      )}
    </>
  );
}

interface GridProps {
  initialProducts: Product[];
  basePath: string;
  hasCategory: boolean;
  title: string;
}

function FilteredGrid({ initialProducts, basePath, hasCategory, title }: GridProps) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const filtered = filterAndSort(initialProducts, sp);
  const page = Math.min(
    Math.max(1, parseInt(sp.get('page') || '1', 10) || 1),
    Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  );
  const from = (page - 1) * PAGE_SIZE;
  const pageHref = (p: number) => {
    const qs = new URLSearchParams(sp.toString());
    qs.set('page', String(p));
    return `${pathname}?${qs.toString()}`;
  };
  return (
    <GridView
      products={filtered.slice(from, from + PAGE_SIZE)}
      total={filtered.length}
      page={page}
      pageHref={pageHref}
      clearHref={basePath}
      hasCategory={hasCategory}
      title={title}
    />
  );
}

/** Statically rendered first page is the Suspense fallback, so crawlers and no-JS users still get products. */
export function CollectionGrid(props: GridProps) {
  const { initialProducts, basePath, hasCategory, title } = props;
  return (
    <Suspense
      fallback={
        <GridView
          products={initialProducts.slice(0, PAGE_SIZE)}
          total={initialProducts.length}
          page={1}
          pageHref={(p) => `${basePath}?page=${p}`}
          clearHref={basePath}
          hasCategory={hasCategory}
          title={title}
        />
      }
    >
      <FilteredGrid {...props} />
    </Suspense>
  );
}
