'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { CoverFlowCarousel } from '@/frontend/components/ui/3-d-coverflow-carousel';
import { LayoutGrid, Flame, Sparkles } from 'lucide-react';
import type { Product } from '@/types';

interface FeaturedProductsProps {
  allProducts: Product[];
  featured: Product[];
  bestsellers: Product[];
  newArrivals: Product[];
}

type Tab = 'all' | 'bestsellers' | 'new';

const tabs = [
  { id: 'all' as Tab, label: 'All Products', icon: LayoutGrid },
  { id: 'bestsellers' as Tab, label: 'Bestsellers', icon: Flame },
  { id: 'new' as Tab, label: 'New Arrivals', icon: Sparkles },
];

export function FeaturedProducts({ allProducts, featured, bestsellers, newArrivals }: FeaturedProductsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.05 });

  const productMap: Record<Tab, Product[]> = {
    all: allProducts,
    bestsellers,
    new: newArrivals,
  };

  const currentProducts = productMap[activeTab] || [];

  return (
    <section id="products" className="py-20 px-4 sm:px-6 lg:px-8 bg-cream scroll-mt-16 md:scroll-mt-20" ref={ref}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6 }}
            className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-3 font-semibold"
          >
            Divine Ornaments
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-cinzel text-2xl sm:text-3xl text-deep font-semibold mb-3 tracking-wide"
          >
            Sacred Collections
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="font-crimson italic text-base text-[var(--text-mid)]"
          >
            Each piece crafted with devotion and divine artistry
          </motion.p>
        </div>

        {/* Tab Filter */}
        <div className="flex gap-3 justify-center flex-wrap mb-10" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-5 py-2.5 font-cinzel text-[10px] tracking-widest uppercase
                  border transition-all duration-200 rounded-xs shadow-xs
                  ${isActive
                    ? 'bg-gold-dark border-gold-dark text-white shadow-gold-sm'
                    : 'bg-white/80 border-[var(--border)] text-[var(--text-mid)] hover:border-gold hover:text-gold-dark'
                  }
                `}
              >
                <Icon size={12} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Products Coverflow — animated on tab change */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {currentProducts.length > 0 ? (
              <CoverFlowCarousel
                products={currentProducts}
                sectionLabel={tabs.find((tab) => tab.id === activeTab)?.label || 'Products'}
              />
            ) : (
              <div className="text-center py-20 text-[var(--text-mid)] font-crimson italic text-lg">
                No products found. Add products in the admin panel.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
