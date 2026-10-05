'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { urlFor } from '@/cms/lib/image';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';
import type { Category } from '@/types';

interface CategoryGridProps {
  categories: Category[];
}

export function CategoryGrid({ categories }: CategoryGridProps) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  if (!categories || categories.length === 0) return null;

  return (
    <section id="collections" className="bg-cream py-16 px-4 sm:px-6 lg:px-8 scroll-mt-20" ref={ref}>
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

        {/* Category Grid */}
        <div className={`grid gap-5 justify-center mx-auto ${
          categories.length <= 2
            ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl'
            : categories.length === 3
            ? 'grid-cols-1 sm:grid-cols-3 max-w-2xl'
            : categories.length === 4
            ? 'grid-cols-2 sm:grid-cols-4 max-w-4xl'
            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 max-w-7xl'
        }`}>
          {categories.map((cat, i) => (
            <CategoryCard key={cat._id} category={cat} index={i} inView={inView} />
          ))}
        </div>
      </div>
    </section>
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
          group block text-center p-5 border transition-all duration-300
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
            <Image
              src={urlFor(category.image).width(128).height(128).quality(80).url()}
              alt={category.name}
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
