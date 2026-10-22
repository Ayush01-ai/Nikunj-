'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';

export function AboutSection() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.05 });

  return (
    <section className="scroll-mt-16 md:scroll-mt-20 bg-[#0e2017]" id="about" ref={ref}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6 }}
        className="relative w-full aspect-[1584/672] border-y border-gold/30 overflow-hidden"
      >
        <Image
          src="/about-radha-krishna-v2.webp"
          alt="Radha Krishna embracing a peacock and calf before temple carvings — Om Krishnaya Vasudevaya Haraye Paramatmane"
          fill
          sizes="100vw"
          className="object-contain w-full h-full"
          priority
        />
        <Link prefetch={false}
          href="/collections"
          className="absolute inset-0 z-10 cursor-pointer"
          aria-label="Browse the Nikunj Sakhi collection"
        />
      </motion.div>
    </section>
  );
}
