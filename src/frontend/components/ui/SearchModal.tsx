'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { client } from '@/cms/lib/client';
import { SEARCH_INDEX_QUERY } from '@/cms/lib/queries';
import { getProductHref } from '@/frontend/lib/product';
import { discountPercent, formatINR } from '@/cms/lib/pricing';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface SearchItem {
  _id: string;
  name: string;
  slug: { current: string };
  sku?: string;
  deity?: string;
  productType?: string;
  category?: string;
  fragrance?: string;
  price: number;
  originalPrice?: number | null;
  image?: string | null;
}

const MAX_SUGGESTIONS = 8;
const POPULAR = ['Mukut', 'Haar', 'Bangles', 'Radha Krishna', 'Laddu Gopal', 'Attar'];

// Fetched once per page session and shared by every open of the modal (and the Shop menu suggestions).
let indexPromise: Promise<SearchItem[]> | null = null;
export function loadSearchIndex() {
  if (!indexPromise) {
    indexPromise = client.fetch<SearchItem[]>(SEARCH_INDEX_QUERY).catch((err) => {
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function score(item: SearchItem, tokens: string[]): number {
  const name = normalize(item.name);
  const meta = normalize(
    [item.productType, item.category, item.deity, item.fragrance, item.sku].filter(Boolean).join(' '),
  );
  const nameWords = name.split(' ');
  const metaWords = meta.split(' ');
  let total = 0;
  for (const t of tokens) {
    if (nameWords.some((w) => w.startsWith(t))) total += 10;
    else if (name.includes(t)) total += 6;
    else if (metaWords.some((w) => w.startsWith(t))) total += 4;
    else if (meta.includes(t)) total += 2;
    else return 0; // every word must match somewhere
  }
  if (name.startsWith(tokens.join(' '))) total += 8;
  return total;
}

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-gold/20 text-deep rounded-sm">{part}</mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchItem[] | null>(null);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || index) return;
    let cancelled = false;
    setError(false);
    loadSearchIndex()
      .then((data) => { if (!cancelled) setIndex(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [isOpen, index]);

  useEffect(() => {
    if (!isOpen) { setQuery(''); setActive(-1); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const tokens = useMemo(() => normalize(query).split(' ').filter(Boolean), [query]);

  const { results, total } = useMemo(() => {
    if (!index || tokens.length === 0) return { results: [] as SearchItem[], total: 0 };
    const scored = index
      .map((item) => ({ item, s: score(item, tokens) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
    return { results: scored.slice(0, MAX_SUGGESTIONS).map((r) => r.item), total: scored.length };
  }, [index, tokens]);

  // Distinct type/category names that match, offered as quick suggestions.
  const termSuggestions = useMemo(() => {
    if (!index || tokens.length === 0) return [] as string[];
    const names = new Set<string>();
    for (const item of index) {
      for (const label of [item.productType, item.category, item.deity]) {
        if (label && tokens.every((t) => normalize(label).includes(t))) names.add(label);
      }
    }
    return Array.from(names).slice(0, 4);
  }, [index, tokens]);

  useEffect(() => { setActive(-1); }, [query]);

  const goToAll = () => {
    const q = query.trim();
    if (!q) return;
    onClose();
    router.push(`/collections?search=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && results[active]) {
        onClose();
        router.push(getProductHref(results[active]));
      } else {
        goToAll();
      }
    }
  };

  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const loading = isOpen && !index && !error;
  const showEmpty = tokens.length > 0 && index && results.length === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[400] flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search products"
            className="bg-white w-full max-w-2xl shadow-2xl"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center border-b border-[var(--border)] px-4 py-3">
              <Search size={18} className="text-gold flex-shrink-0 mr-3" aria-hidden="true" />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search mukut, haar, bangles, attar…"
                aria-label="Search all products"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="search-suggestions"
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? `search-opt-${active}` : undefined}
                className="flex-1 font-lato text-sm text-deep outline-none placeholder:text-gray-400"
                autoComplete="off"
              />
              {loading && tokens.length > 0 && <Loader2 size={16} className="animate-spin text-gold mr-2" aria-hidden="true" />}
              <button onClick={onClose} className="text-[var(--text-mid)] hover:text-gold ml-2" aria-label="Close search">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Quick term suggestions */}
            {termSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 pt-3">
                {termSuggestions.map((term) => (
                  <button
                    key={term}
                    onClick={() => setQuery(term)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-cream border border-[var(--border)] font-cinzel text-[10px] tracking-wider uppercase text-gold-dark hover:border-gold transition-colors"
                  >
                    <Search size={10} aria-hidden="true" /> {term}
                  </button>
                ))}
              </div>
            )}

            {/* Product suggestions */}
            {results.length > 0 && (
              <div
                id="search-suggestions"
                role="listbox"
                ref={listRef}
                className="max-h-[60vh] overflow-y-auto divide-y divide-[var(--border)] mt-2"
              >
                {results.map((product, i) => {
                  const off = discountPercent(product.originalPrice, product.price);
                  return (
                    <Link prefetch={false}
                      key={product._id}
                      id={`search-opt-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      href={getProductHref(product)}
                      onClick={onClose}
                      onMouseEnter={() => setActive(i)}
                      className={`flex items-center gap-4 px-4 py-3 transition-colors ${i === active ? 'bg-cream' : 'hover:bg-cream'}`}
                    >
                      <div className="relative w-12 h-12 bg-cream flex-shrink-0 overflow-hidden">
                        {product.image ? (
                          <Image
                            src={`${product.image}?w=96&h=96&fit=crop&auto=format`}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-cream-200">
                            <SacredIcon name="lotus" size={20} className="text-gold" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-cinzel text-[9px] tracking-widest text-gold uppercase truncate">
                          {[product.productType, product.deity].filter(Boolean).join(' · ') || product.category}
                        </p>
                        <p className="font-crimson text-sm font-semibold text-deep truncate">
                          <Highlight text={product.name} tokens={tokens} />
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="font-cinzel text-sm font-bold text-gold-dark block">{formatINR(product.price)}</span>
                        {off > 0 && product.originalPrice && (
                          <span className="text-[10px] text-[var(--text-mid)]">
                            <s>{formatINR(product.originalPrice)}</s> <span className="text-green-700 font-semibold">{off}% off</span>
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {results.length > 0 && (
              <button
                onClick={goToAll}
                className="w-full flex items-center justify-center gap-2 py-3 border-t border-[var(--border)] font-cinzel text-[10px] tracking-widest uppercase text-gold hover:text-gold-dark hover:bg-cream transition-colors"
              >
                View all {total} {total === 1 ? 'result' : 'results'} <ArrowRight size={12} aria-hidden="true" />
              </button>
            )}

            {showEmpty && (
              <div className="px-6 py-8 text-center font-crimson italic text-[var(--text-mid)]">
                No products found for &ldquo;{query}&rdquo;.{' '}
                <Link prefetch={false} href="/collections" onClick={onClose} className="not-italic font-cinzel text-[10px] tracking-widest uppercase text-gold hover:underline">
                  Browse all products
                </Link>
              </div>
            )}

            {error && (
              <div className="px-6 py-6 text-center font-crimson italic text-[var(--text-mid)]">
                Search is unavailable right now. Press Enter to search the shop instead.
              </div>
            )}

            {tokens.length === 0 && (
              <div className="px-6 py-5">
                <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-3">Popular Searches</p>
                <div className="flex flex-wrap gap-2">
                  {POPULAR.map((term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className="px-3 py-1.5 border border-[var(--border)] font-cinzel text-[10px] tracking-wider uppercase text-[var(--text-mid)] hover:border-gold hover:text-gold transition-all"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
