'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Sparkles, Gem, Truck, ShieldCheck, HeartHandshake, RotateCcw } from 'lucide-react';

const whyItems = [
  { icon: Sparkles, title: 'Divine Craftsmanship', desc: 'Every ornament is handcrafted by skilled artisans with generations of sacred expertise.' },
  { icon: Gem, title: 'Pure & Authentic', desc: 'We use only authentic materials — pure silver, gold plated brass, and sacred metals.' },
  { icon: Truck, title: 'Free Delivery', desc: 'Free shipping on orders above ₹999. Fast, secure, and carefully packed.' },
  { icon: ShieldCheck, title: 'Secure Payments', desc: 'All payments are 100% secure via Cashfree, UPI, and Cash on Delivery.' },
  { icon: HeartHandshake, title: 'Made with Devotion', desc: 'Each piece is crafted with prayers and blessings for your beloved deity.' },
  { icon: RotateCcw, title: 'Easy Returns', desc: 'Hassle-free 7-day return policy. Your satisfaction is our priority.' },
];

export function WhyUs() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream overflow-hidden" ref={ref}>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-10 lg:gap-14 items-center">
        {/* Image — white background melts into the cream page via multiply blend */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="relative mx-auto w-full max-w-[260px] sm:max-w-xs lg:max-w-none"
        >
          <div
            aria-hidden="true"
            className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle,rgba(232,193,106,0.35)_0%,rgba(255,248,238,0)_70%)] blur-2xl"
          />
          <Image
            src="/promise.webp"
            alt="Krishna's flute with peacock feathers and a golden lotus"
            width={735}
            height={1225}
            sizes="(max-width: 1024px) 320px, 40vw"
            className="relative w-full h-auto mix-blend-multiply"
          />
        </motion.div>

        <div>
        {/* Header */}
        <div className="text-center lg:text-left mb-10">
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-3 font-semibold"
          >
            Why Choose Us
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1 }}
            className="font-cinzel text-2xl sm:text-3xl text-deep font-semibold mb-3 tracking-wide"
          >
            The Nikunj Sakhi Promise
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="font-crimson italic text-base text-[var(--text-mid)]"
          >
            Crafted with devotion, delivered with love
          </motion.p>
        </div>

        {/* Blocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {whyItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.15 + i * 0.08 }}
                className="flex gap-4 items-start p-5 bg-white/70 backdrop-blur-xs border border-gold/20 hover:border-gold hover:shadow-divine transition-all duration-300 group rounded-xs"
              >
                <div className="w-11 h-11 flex-shrink-0 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold-dark group-hover:bg-gold-dark group-hover:text-white transition-all duration-300">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-cinzel text-sm font-semibold text-deep group-hover:text-gold-dark mb-1 tracking-wider transition-colors">
                    {item.title}
                  </h3>
                  <p className="font-lato text-xs text-[var(--text-mid)] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
        </div>
      </div>
    </section>
  );
}

