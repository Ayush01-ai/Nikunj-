'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Instagram, Sparkles, Heart, Crown, Gem, Camera } from 'lucide-react';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';

interface InstagramStripProps {
  instagramHandle?: string;
}

const TILES = [
  { id: 0, label: 'Radha Krishna Mukut', icon: Crown },
  { id: 1, label: 'Divine Shringar', icon: Sparkles },
  { id: 2, label: 'Sacred Adornments', icon: Gem },
  { id: 3, label: 'Bhakti & Aarti', icon: Heart },
  { id: 4, label: 'Deity Jewellery', icon: Camera },
  { id: 5, label: 'Vrindavan Grace', icon: Sparkles },
];

export function InstagramStrip({ instagramHandle }: InstagramStripProps) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  if (!instagramHandle) return null;

  const profileUrl = `https://www.instagram.com/${instagramHandle}`;

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream text-center" ref={ref}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.span
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-3 font-semibold"
        >
          Follow Our Journey
        </motion.span>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1 }}
          className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep mb-3 tracking-wide"
        >
          See Us on Instagram
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.2 }}
          className="font-crimson italic text-base text-[var(--text-mid)] mb-2"
        >
          Daily divine content, new arrivals & behind-the-scenes
        </motion.p>

        {/* Handle */}
        <motion.a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="inline-flex items-center gap-2 font-cinzel text-base sm:text-lg text-gold tracking-[0.2em] hover:text-gold-dark transition-colors mb-8 group"
        >
          <Instagram size={20} className="group-hover:scale-110 transition-transform" />
          <span>@{instagramHandle}</span>
        </motion.a>

        {/* Instagram grid cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 max-w-4xl mx-auto mb-8">
          {TILES.map((tile, i) => {
            const Icon = tile.icon;
            return (
              <motion.a
                key={tile.id}
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Visit our Instagram: ${tile.label}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="group relative aspect-square bg-gradient-to-br from-cream-100 to-cream-300 border border-gold/25 hover:border-gold p-3 flex flex-col items-center justify-center text-center transition-all duration-300 hover:shadow-gold-sm hover:-translate-y-1 rounded-xs overflow-hidden"
              >
                <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-gold-dark mb-2 group-hover:bg-gold group-hover:text-white transition-all duration-300">
                  <Icon size={18} aria-hidden="true" />
                </div>
                <span className="font-cinzel text-[8px] uppercase tracking-wider text-[var(--text-mid)] group-hover:text-deep transition-colors line-clamp-1">
                  {tile.label}
                </span>

                {/* Hover overlay with Instagram icon */}
                <div className="absolute inset-0 bg-deep/70 backdrop-blur-xs flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Instagram size={24} className="text-gold-light" />
                </div>
              </motion.a>
            );
          })}
        </div>

        <p className="font-crimson italic text-xs text-[var(--text-mid)]">
          Follow <span className="font-cinzel tracking-wider text-gold-dark font-semibold">@{instagramHandle}</span> for daily darshan & sacred craftsmanship stories
        </p>
      </div>
    </section>
  );
}
