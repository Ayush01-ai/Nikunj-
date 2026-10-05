'use client';

import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, EffectFade } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-fade';
import { urlFor } from '@/cms/lib/image';
import type { HeroSlide, SiteSettings } from '@/types';
import dynamic from 'next/dynamic';
import { NikunjSakhiLogo } from '@/frontend/components/ui/NikunjSakhiLogo';
import { Button } from '@/frontend/components/ui/button';
import { Sparkles, Gem, Award, Truck } from 'lucide-react';

const Scene3D = dynamic(() => import('@/frontend/components/3d/Scene3D'), { ssr: false });

interface HeroSectionProps {
  slides: HeroSlide[];
  settings: SiteSettings | null;
}

const badges = [
  { icon: Sparkles, label: 'Sacred Craftsmanship' },
  { icon: Gem, label: 'Pure Materials' },
  { icon: Award, label: 'Divine Blessing' },
  { icon: Truck, label: 'Free Delivery ₹999+' },
];

export function HeroSection({ slides, settings }: HeroSectionProps) {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const hasSlides = slides && slides.length > 0;

  return (
    <section
      ref={heroRef}
      className="relative min-h-[92vh] flex items-center justify-center overflow-hidden bg-divine-gradient border-b border-gold/20"
      id="hero"
    >
      {/* 3D Background Canvas */}
      <div className="absolute inset-0 pointer-events-none z-[1]">
        <Scene3D />
      </div>

      {/* Spotlight glow behind logo */}
      <div className="absolute inset-0 pointer-events-none z-[2]" />

      {/* Slide Background (if slides exist) */}
      {hasSlides && (
        <Swiper
          modules={[Autoplay, EffectFade]}
          effect="fade"
          autoplay={{ delay: 5000, disableOnInteraction: false }}
          loop
          className="absolute inset-0 z-[1] w-full h-full"
        >
          {slides.map((slide) => (
            <SwiperSlide key={slide._id}>
              {slide.image?.asset && (
                <Image
                  src={urlFor(slide.image).width(1600).quality(85).url()}
                  alt={slide.image.alt || slide.title}
                  fill
                  className="object-cover"
                  priority
                />
              )}
              <div className="absolute inset-0 hero-slide-overlay" />
            </SwiperSlide>
          ))}
        </Swiper>
      )}

      {/* Hero Content */}
      <motion.div
        style={{ opacity }}
        className="relative z-10 text-center max-w-4xl mx-auto px-6 py-16"
      >
        {/* Brand Logo with spotlight */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.2, ease: 'easeOut' }}
          className="relative flex justify-center mb-4"
        >
          {/* Spotlight glow behind logo */}
          <div className="absolute pointer-events-none hero-logo-spotlight" />
          <NikunjSakhiLogo
            className="relative w-[min(520px,80vw)]"
            variant={hasSlides ? 'dark' : 'light'}
          />
        </motion.div>

        {/* Slide-specific headline (only shown when CMS slides are present) */}
        {hasSlides && (
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.35 }}
            className="font-cinzel-decorative text-3xl sm:text-4xl md:text-5xl text-gold-light leading-tight mb-4"
          >
            {slides[0].title}
          </motion.h1>
        )}

        {/* Description */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.65 }}
          className="max-w-lg mx-auto mb-8"
        >
          {hasSlides ? (
            <p className="font-crimson text-base sm:text-lg text-[var(--text-mid)] leading-relaxed">
              {slides[0].description}
            </p>
          ) : (
            <>
              <h1 className="font-cinzel-decorative text-2xl sm:text-3xl md:text-4xl font-bold text-deep mb-2 leading-snug drop-shadow-sm">
                Bhakti Ka Bhaav,<br className="sm:hidden" /> Shringar Ke Saath
              </h1>
              <p className="font-crimson italic text-base sm:text-lg text-[var(--text-mid)] font-medium leading-relaxed">
                A feeling of devotion, adorned with grace.
              </p>
            </>
          )}
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.75 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button asChild className="normal-case tracking-wider text-sm font-semibold shadow-md hover:shadow-lg">
            <Link href="/collections">
              ✦ Explore Collection
            </Link>
          </Button>
          <Button asChild variant="outline" className="normal-case tracking-wider text-sm font-semibold">
            <Link href="/collections?sort=newest">
              View Offers
            </Link>
          </Button>
        </motion.div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="flex flex-wrap justify-center gap-4 sm:gap-8 mt-12"
        >
          {badges.map((badge) => {
            const IconComponent = badge.icon;
            return (
              <div
                key={badge.label}
                className="flex items-center gap-2.5 font-cinzel text-xs tracking-wider text-[var(--text-mid)] font-medium bg-white/80 backdrop-blur-xs px-3.5 py-1.5 rounded-full border border-gold/20 shadow-xs hover:border-gold/50 transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-gold/15 flex items-center justify-center text-gold-dark flex-shrink-0">
                  <IconComponent size={14} aria-hidden="true" />
                </span>
                <span>{badge.label}</span>
              </div>
            );
          })}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <span className="font-cinzel text-xs tracking-[0.3em] uppercase text-gold-dark font-medium">Scroll</span>
        <div className="w-[1px] h-12 bg-gradient-to-b from-gold to-transparent" />
      </motion.div>
    </section>
  );
}
