'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { client } from '@/cms/lib/client';
import { SEARCH_PRODUCTS_QUERY } from '@/cms/lib/queries';
import { urlFor } from '@/cms/lib/image';
import { getProductHref } from '@/frontend/lib/product';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';
import type { Product } from '@/types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const latestRequest = useRef(0);

  const doSearch = useCallback(async (q: string) => {
    const requestId = ++latestRequest.current;
    if (!q.trim() || q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await client.fetch<Product[]>(SEARCH_PRODUCTS_QUERY, { query: q } as Record<string, string>);
      if (requestId === latestRequest.current) setResults(data);
    } catch {
      if (requestId === latestRequest.current) setResults([]);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  useEffect(() => {
    if (!isOpen) { setQuery(''); setResults([]); }
  }, [isOpen]);

  // B5: Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

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
              <Search size={18} className="text-gold flex-shrink-0 mr-3" />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search divine ornaments..."
                aria-label="Search divine ornaments"
                className="flex-1 font-lato text-sm text-deep outline-none placeholder:text-gray-400"
                autoComplete="off"
              />
              {loading && <Loader2 size={16} className="animate-spin text-gold mr-2" aria-hidden="true" />}
              <button onClick={onClose} className="text-[var(--text-mid)] hover:text-gold ml-2" aria-label="Close search">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-[var(--border)]">
                {results.map((product) => (
                  <Link
                    key={product._id}
                    href={getProductHref(product)}
                    onClick={onClose}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-cream transition-colors"
                  >
                    <div className="relative w-12 h-12 bg-cream flex-shrink-0 overflow-hidden">
                      {product.images?.[0]?.asset ? (
                        <Image
                          src={urlFor(product.images[0]).width(96).height(96).quality(75).url()}
                          alt={product.name}
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
                      <p className="font-cinzel text-[9px] tracking-widest text-gold uppercase">{product.deity}</p>
                      <p className="font-crimson text-sm font-semibold text-deep truncate">{product.name}</p>
                    </div>
                    <span className="font-cinzel text-sm font-bold text-gold-dark flex-shrink-0">
                      ₹{product.price.toLocaleString('en-IN')}
                    </span>
                  </Link>
                ))}
                {results.length >= 20 && (
                  <Link
                    href={`/collections?search=${encodeURIComponent(query)}`}
                    onClick={onClose}
                    className="block text-center py-3 font-cinzel text-[10px] tracking-widest uppercase text-gold hover:text-gold-dark transition-colors"
                  >
                    View All Results →
                  </Link>
                )}
              </div>
            )}

            {query.length >= 2 && !loading && results.length === 0 && (
              <div className="px-6 py-8 text-center font-crimson italic text-[var(--text-mid)]">
                No products found for "{query}"
              </div>
            )}

            {query.length === 0 && (
              <div className="px-6 py-5">
                <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-3">Popular Searches</p>
                <div className="flex flex-wrap gap-2">
                  {['Mukut', 'Haar', 'Mala Set', 'Radha Krishna', 'Laddu Gopal', 'Pooja Set'].map((term) => (
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
