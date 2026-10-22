'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { loadSearchIndex, type SearchItem } from '@/frontend/components/ui/SearchModal';
import { getProductHref } from '@/frontend/lib/product';
import { formatINR } from '@/cms/lib/pricing';
import { pickDiverse, seedFrom } from '@/cms/lib/suggestions';

/**
 * "Suggested for you" products inside the Shop menu. On a product page it skips the product being
 * viewed and favours other categories, so shoppers discover something different.
 */
export function ShopSuggestions({ variant, count = 3, onNavigate }: { variant: 'desktop' | 'mobile'; count?: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [index, setIndex] = useState<SearchItem[] | null>(null);
  // Index (and so the picks) only loads on the client, so the server never renders a different day.
  const [day] = useState(() => Math.floor(Date.now() / 86_400_000));

  useEffect(() => {
    let alive = true;
    loadSearchIndex()
      .then((items) => alive && setIndex(items))
      .catch(() => alive && setIndex([]));
    return () => {
      alive = false;
    };
  }, []);

  const picks = useMemo(() => {
    if (!index?.length) return [];
    const slug = pathname.startsWith('/products/') ? decodeURIComponent(pathname.split('/')[2] ?? '') : '';
    const current = slug ? index.find((p) => p.slug?.current === slug || p._id === slug) : undefined;
    // Rotates daily (and per page) so the menu feels fresh without flickering on every open.
    const seed = seedFrom(`${pathname}:${day}`);
    const pool = current ? index.filter((p) => p.category !== current.category) : index;
    return pickDiverse(pool.length >= count ? pool : index, count, seed, current ? [current._id] : []);
  }, [index, pathname, count, day]);

  if (!picks.length) return null;

  if (variant === 'mobile') {
    return (
      <div>
        <p className="font-cinzel text-xs tracking-widest uppercase text-gold-dark flex items-center gap-1.5">
          <Sparkles size={12} aria-hidden="true" /> Suggested for you
        </p>
        <ul className="mt-2 flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {picks.map((p) => (
            <li key={p._id} className="snap-start shrink-0 w-28">
              <Link prefetch={false} href={getProductHref(p)} onClick={onNavigate} className="block group">
                <div className="relative w-28 h-28 bg-white border border-[var(--border)] overflow-hidden">
                  {p.image && <Image src={p.image} alt={p.name} fill sizes="112px" className="object-cover" />}
                </div>
                <p className="mt-1 font-crimson text-sm text-deep leading-tight line-clamp-2 group-hover:text-gold">{p.name}</p>
                <p className="font-lato text-xs text-gold-dark">{formatINR(p.price)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="border-l border-[var(--border)] pl-8 min-w-[220px]">
      <p className="font-cinzel text-xs font-semibold tracking-widest uppercase text-gold-dark flex items-center gap-1.5">
        <Sparkles size={12} aria-hidden="true" /> Suggested for you
      </p>
      <ul className="mt-3 space-y-3">
        {picks.map((p) => (
          <li key={p._id}>
            <Link prefetch={false} href={getProductHref(p)} onClick={onNavigate} className="flex items-center gap-3 group">
              <div className="relative w-14 h-14 shrink-0 bg-white border border-[var(--border)] overflow-hidden">
                {p.image && <Image src={p.image} alt="" fill sizes="56px" className="object-cover transition-transform group-hover:scale-105" />}
              </div>
              <div className="min-w-0">
                <p className="font-crimson text-[15px] text-deep leading-tight line-clamp-2 group-hover:text-gold transition-colors">{p.name}</p>
                <p className="font-lato text-xs text-gold-dark mt-0.5">
                  {formatINR(p.price)}
                  {p.originalPrice ? <span className="ml-1.5 line-through text-[var(--text-mid)]">{formatINR(p.originalPrice)}</span> : null}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
