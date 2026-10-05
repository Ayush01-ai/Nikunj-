'use client';

import React, { useState, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';

interface FilterOption {
  _id: string;
  name: string;
  slug: { current: string };
  productCount?: number;
}

interface TypeOption extends FilterOption {
  category?: { slug: { current: string } };
}

// Hide options with no products, but always keep the active one visible.
const withProducts = <T extends FilterOption>(items: T[], active?: string) =>
  items.filter((i) => i.productCount === undefined || i.productCount > 0 || i.slug.current === active);

const countLabel = (n?: number) => (n === undefined ? '' : ` (${n})`);

const PRICE_RANGES = [
  { label: 'All', min: 0, max: 0 },
  { label: 'Under ₹500', min: 0, max: 499 },
  { label: '₹500 – ₹999', min: 500, max: 999 },
  { label: '₹1000 – ₹2499', min: 1000, max: 2499 },
  { label: '₹2500+', min: 2500, max: 0 },
];

const SORT_OPTIONS = [
  { label: 'Featured', value: 'featured' },
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
];

// B3: Hoisted component — defined outside ProductFilters so React preserves its identity across renders
interface FiltersContentProps {
  categories: FilterOption[];
  deities: FilterOption[];
  productTypes: TypeOption[];
  fragrances: FilterOption[];
  activeCategory?: string;
  activeDeity?: string;
  activeProductType?: string;
  activeFragrance?: string;
  showDeity: boolean;
  showFragrance: boolean;
  featuredOnly: boolean;
  bestsellerOnly: boolean;
  newArrivalOnly: boolean;
  currentSort: string;
  currentMin: string;
  currentMax: string;
  onPush: (updates: Record<string, string>) => void;
  onNavigate: (path: string) => void;
}

function FiltersContent({
  categories,
  deities,
  productTypes,
  fragrances,
  activeCategory,
  activeDeity,
  activeProductType,
  activeFragrance,
  showDeity,
  showFragrance,
  featuredOnly,
  bestsellerOnly,
  newArrivalOnly,
  currentSort,
  currentMin,
  currentMax,
  onPush,
  onNavigate,
}: FiltersContentProps) {
  const visibleTypes = withProducts(productTypes, activeProductType);
  return (
    <div className="space-y-7">
      {/* Categories */}
      <div>
        <p className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-[var(--text-mid)] mb-3">Categories</p>
        <ul className="space-y-1">
          <li>
            <button
              onClick={() => onNavigate('/collections')}
              className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                !activeCategory ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
              }`}
            >
              All Products
            </button>
          </li>
          {withProducts(categories, activeCategory).map((cat) => (
            <li key={cat._id}>
              <button
                onClick={() => onNavigate(`/collections/${cat.slug.current}`)}
                className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                  activeCategory === cat.slug.current ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
                }`}
              >
                {cat.name}{countLabel(cat.productCount)}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Product Type */}
      {visibleTypes.length > 0 && (
        <div>
          <p className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-[var(--text-mid)] mb-3">Product Type</p>
          <ul className="space-y-1">
            {activeCategory && (
              <li>
                <button
                  onClick={() => onNavigate(`/collections/${activeCategory}`)}
                  className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                    !activeProductType ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
                  }`}
                >
                  All Types
                </button>
              </li>
            )}
            {visibleTypes.map((item) => {
              const categorySlug = item.category?.slug.current ?? activeCategory;
              if (!categorySlug) return null;
              return (
                <li key={item._id}>
                  <button
                    onClick={() => onNavigate(`/collections/${categorySlug}/${item.slug.current}`)}
                    className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                      activeProductType === item.slug.current ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
                    }`}
                  >
                    {item.name}{countLabel(item.productCount)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Deity */}
      {showDeity && deities.length > 0 && (
      <div>
        <p className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-[var(--text-mid)] mb-3">Deity</p>
        <ul className="space-y-1">
          <li>
            <button
              onClick={() => onPush({ deity: '' })}
              className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                !activeDeity ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
              }`}
            >
              All Deities
            </button>
          </li>
          {deities.map((item) => (
            <li key={item._id}>
              <button
                onClick={() => onPush({ deity: item.slug.current })}
                className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                  activeDeity === item.slug.current ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
                }`}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
      )}

      {/* Fragrance */}
      {showFragrance && fragrances.length > 0 && (
      <div>
        <p className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-[var(--text-mid)] mb-3">Fragrance</p>
        <ul className="space-y-1">
          <li>
            <button
              onClick={() => onPush({ fragrance: '' })}
              className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                !activeFragrance ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
              }`}
            >
              All Fragrances
            </button>
          </li>
          {fragrances.map((item) => (
            <li key={item._id}>
              <button
                onClick={() => onPush({ fragrance: item.slug.current })}
                className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                  activeFragrance === item.slug.current ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
                }`}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
      )}

      {/* Collections flags */}
      <div>
        <p className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-[var(--text-mid)] mb-3">Highlights</p>
        <ul className="space-y-1">
          <li>
            <button
              onClick={() => onPush({ featuredOnly: featuredOnly ? '' : 'true' })}
              className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                featuredOnly ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
              }`}
            >
              Featured Product
            </button>
          </li>
          <li>
            <button
              onClick={() => onPush({ bestsellerOnly: bestsellerOnly ? '' : 'true' })}
              className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                bestsellerOnly ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
              }`}
            >
              Best Seller
            </button>
          </li>
          <li>
            <button
              onClick={() => onPush({ newArrivalOnly: newArrivalOnly ? '' : 'true' })}
              className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                newArrivalOnly ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
              }`}
            >
              New Arrival
            </button>
          </li>
        </ul>
      </div>

      {/* Price range */}
      <div>
        <p className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-[var(--text-mid)] mb-3">Price Range</p>
        <ul className="space-y-1">
          {PRICE_RANGES.map((range) => {
            const isActive = range.min === Number(currentMin || 0) && range.max === Number(currentMax || 0);
            return (
              <li key={range.label}>
                <button
                  onClick={() => onPush({ minPrice: range.min ? String(range.min) : '', maxPrice: range.max ? String(range.max) : '' })}
                  className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                    isActive ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
                  }`}
                >
                  {range.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Sort */}
      <div>
        <p className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-[var(--text-mid)] mb-3">Sort By</p>
        <ul className="space-y-1">
          {SORT_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                onClick={() => onPush({ sort: opt.value })}
                className={`font-crimson text-sm w-full text-left px-2 py-1 transition-colors ${
                  currentSort === opt.value ? 'text-gold font-semibold' : 'text-[var(--text-mid)] hover:text-gold'
                }`}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface ProductFiltersProps {
  categories: FilterOption[];
  deities: FilterOption[];
  productTypes: TypeOption[];
  fragrances: FilterOption[];
  activeCategory?: string;
  activeProductType?: string;
  showDeity?: boolean;
  showFragrance?: boolean;
}

// Query params that only make sense within the current category/type.
const SCOPED_PARAMS = ['deity', 'fragrance', 'page'];

export function ProductFilters({
  categories,
  deities,
  productTypes,
  fragrances,
  activeCategory,
  activeProductType,
  showDeity = true,
  showFragrance = true,
}: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  const push = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setMobileOpen(false);
  }, [router, pathname, searchParams]);

  const navigate = useCallback((path: string) => {
    const params = new URLSearchParams(searchParams.toString());
    SCOPED_PARAMS.forEach((k) => params.delete(k));
    const qs = params.toString();
    router.push(qs ? `${path}?${qs}` : path);
    setMobileOpen(false);
  }, [router, searchParams]);

  const currentSort = searchParams.get('sort') || 'featured';
  const currentMin = searchParams.get('minPrice') || '';
  const currentMax = searchParams.get('maxPrice') || '';
  const activeDeity = searchParams.get('deity') || '';
  const activeFragrance = searchParams.get('fragrance') || '';
  const featuredOnly = searchParams.get('featuredOnly') === 'true';
  const bestsellerOnly = searchParams.get('bestsellerOnly') === 'true';
  const newArrivalOnly = searchParams.get('newArrivalOnly') === 'true';

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden flex items-center gap-2 font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-4"
        onClick={() => setMobileOpen(true)}
      >
        <SlidersHorizontal size={14} /> Filters & Sort
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-white p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <span className="font-cinzel text-xs font-semibold text-deep">Filters</span>
              {/* U4: aria-label for accessibility */}
              <button onClick={() => setMobileOpen(false)} aria-label="Close filters"><X size={16} /></button>
            </div>
            <FiltersContent
              categories={categories}
              deities={deities}
              productTypes={productTypes}
              fragrances={fragrances}
              activeCategory={activeCategory}
              activeDeity={activeDeity}
              activeProductType={activeProductType}
              activeFragrance={activeFragrance}
              featuredOnly={featuredOnly}
              bestsellerOnly={bestsellerOnly}
              newArrivalOnly={newArrivalOnly}
              currentSort={currentSort}
              currentMin={currentMin}
              currentMax={currentMax}
              onPush={push}
              onNavigate={navigate}
              showDeity={showDeity}
              showFragrance={showFragrance}
            />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <FiltersContent
          categories={categories}
          deities={deities}
          productTypes={productTypes}
          fragrances={fragrances}
          activeCategory={activeCategory}
          activeDeity={activeDeity}
          activeProductType={activeProductType}
          activeFragrance={activeFragrance}
          featuredOnly={featuredOnly}
          bestsellerOnly={bestsellerOnly}
          newArrivalOnly={newArrivalOnly}
          currentSort={currentSort}
          currentMin={currentMin}
          currentMax={currentMax}
          onPush={push}
          onNavigate={navigate}
          showDeity={showDeity}
          showFragrance={showFragrance}
        />
      </div>
    </>
  );
}
