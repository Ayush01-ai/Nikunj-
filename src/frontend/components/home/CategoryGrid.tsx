'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ArrowRight, LayoutGrid } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import SafeImage from '@/frontend/components/ui/SafeImage';
import { safeImageUrl, IMAGE_PLACEHOLDER } from '@/cms/lib/image';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';
import type { Category } from '@/types';

interface CategoryGridProps {
  categories: Category[];
}

export function CategoryGrid({ categories }: CategoryGridProps) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  if (!categories) return null;

  return (
    <section id="collections" className="bg-cream py-16 px-4 sm:px-6 lg:px-8 scroll-mt-16 md:scroll-mt-20" ref={ref}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6 }}
            className="font-cinzel text-xs tracking-[0.4em] uppercase text-gold block mb-3 font-semibold"
          >
            For Every Deity
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-cinzel text-2xl sm:text-3xl text-deep font-semibold mb-3"
          >
            Browse by Deity & Category
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="font-crimson italic text-base text-[var(--text-mid)]"
          >
            Discover handcrafted ornaments for your beloved deity
          </motion.p>
        </div>

        {/* Category Grid — "View All Products" first, then every active category */}
        <div className={`grid gap-4 sm:gap-5 justify-center mx-auto ${
          categories.length + 1 <= 3
            ? 'grid-cols-1 sm:grid-cols-3 max-w-3xl'
            : categories.length + 1 === 4
            ? 'grid-cols-2 sm:grid-cols-4 max-w-4xl'
            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 max-w-7xl'
        }`}>
          <ViewAllCard inView={inView} />
          {categories.map((cat, i) => (
            <CategoryCard key={cat._id} category={cat} index={i + 1} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ViewAllCard({ inView }: { inView: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
    >
      <Link
        href="/collections"
        className="view-all-card group block h-full text-center p-5 border border-[#E8C16A] text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-gold-sm"
      >
        <div className="relative z-[1] w-16 h-16 mx-auto mb-3 rounded-full bg-white/15 ring-1 ring-[#FFF3CC]/60 flex items-center justify-center">
          <LayoutGrid size={26} className="text-[#FFF3CC] group-hover:scale-110 group-hover:rotate-90 transition-transform duration-500" aria-hidden="true" />
        </div>
        <h3 className="relative z-[1] font-cinzel text-xs font-bold tracking-wider mb-1 text-white">
          View All Products
        </h3>
        <p className="relative z-[1] text-xs text-white/85 leading-snug inline-flex items-center gap-1">
          Explore the full collection
          <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
        </p>
      </Link>
    </motion.div>
  );
}

function CategoryCard({
  category,
  index,
  inView,
}: {
  category: Category;
  index: number;
  inView: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.07 }}
    >
      <Link
        href={`/collections/${category.slug.current}`}
        className={`
          group block h-full text-center p-5 border transition-all duration-300
          hover:-translate-y-1 hover:border-gold hover:shadow-gold-sm
          ${category.isFeatured
            ? 'border-gold bg-gradient-to-b from-cream to-cream-200'
            : 'border-[var(--border)] bg-cream'
          }
        `}
      >
        {/* Icon / Image */}
        <div className="relative w-16 h-16 mx-auto mb-3 rounded-full overflow-hidden bg-gold/10 flex items-center justify-center">
          {category.image?.asset ? (
            <SafeImage
              src={safeImageUrl(category.image, 128, 128) || IMAGE_PLACEHOLDER}
              alt=""
              fill
              sizes="64px"
              className="object-cover group-hover:scale-110 transition-transform duration-500"
            />
          ) : (
            <SacredIcon name="lotus" size={28} className="text-gold group-hover:scale-110 transition-transform duration-300" />
          )}
        </div>

        <h3 className="font-cinzel text-xs font-semibold tracking-wider text-deep mb-1 group-hover:text-gold transition-colors">
          {category.name}
        </h3>
        {category.description && (
          <p className="text-xs text-[var(--text-mid)] leading-snug line-clamp-2">
            {category.description}
          </p>
        )}
      </Link>
    </motion.div>
  );
}
