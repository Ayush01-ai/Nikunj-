'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { urlFor } from '@/cms/lib/image';
import type { Testimonial } from '@/types';

interface TestimonialsSectionProps {
  testimonials: Testimonial[];
}

export function TestimonialsSection({ testimonials }: TestimonialsSectionProps) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.05 });

  // Keep the #testimonials anchor so the "Reviews" nav link always has a target.
  if (!testimonials || testimonials.length === 0) {
    return (
      <section id="testimonials" className="py-16 px-4 sm:px-6 lg:px-8 bg-cream scroll-mt-16 md:scroll-mt-20 text-center">
        <span className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-3">
          What Our Devotees Say
        </span>
        <h2 className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep mb-3">Customer Reviews</h2>
        <p className="font-crimson italic text-base text-[var(--text-mid)] mb-6">
          Be the first to share your experience with Nikunj Sakhi.
        </p>
        <a href="#feedback" className="btn-outline-gold">
          Write a Review
        </a>
      </section>
    );
  }

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream scroll-mt-16 md:scroll-mt-20" id="testimonials" ref={ref}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-3"
          >
            What Our Devotees Say
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1 }}
            className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep mb-3"
          >
            Divine Testimonials
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="font-crimson italic text-base text-[var(--text-mid)]"
          >
            Thousands of satisfied devotees across India
          </motion.p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t._id}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="bg-[var(--cream)] border border-[var(--border)] p-7 relative"
            >
              {/* Quote mark */}
              <span className="absolute top-4 left-5 font-crimson text-6xl text-gold-light/60 leading-none select-none">
                &ldquo;
              </span>

              {/* Stars */}
              <div className="flex gap-0.5 mb-3 relative z-10">
                {Array.from({ length: 5 }, (_, j) => (
                  <span key={j} className={`text-sm ${j < t.rating ? 'text-gold' : 'text-gray-200'}`}>★</span>
                ))}
              </div>

              {/* Review */}
              <p className="font-crimson italic text-sm text-[var(--text-mid)] leading-7 mb-5 pt-4">
                &ldquo;{t.review}&rdquo;
              </p>

              {/* Product */}
              {t.productPurchased && (
                <p className="font-cinzel text-[9px] tracking-widest uppercase text-gold mb-3">
                  Purchased: {t.productPurchased.name}
                </p>
              )}

              {/* Author */}
              <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4">
                {t.avatar?.asset ? (
                  <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                    <Image
                      src={urlFor(t.avatar).width(80).height(80).quality(80).url()}
                      alt={t.customerName}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-light to-gold flex items-center justify-center text-white font-cinzel text-sm font-bold flex-shrink-0">
                    {t.initials || t.customerName.charAt(0)}
                  </div>
                )}
                <div>
                  <span className="font-cinzel text-xs font-semibold text-deep block">
                    {t.customerName}
                    {t.isVerified && <span className="ml-1.5 text-green-500 text-[9px]">✓ Verified</span>}
                  </span>
                  {t.location && (
                    <span className="text-[10px] text-[var(--text-mid)]">{t.location}</span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
