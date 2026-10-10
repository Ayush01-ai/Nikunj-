'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type IconProps = { className?: string };

const TEAL = '#0f6d6a';
const GOLD = '#c9922a';
const GOLD_LIGHT = '#f3d48a';

/** Artisan hands shaping a sacred ornament. */
function CraftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="17" r="8" fill={GOLD_LIGHT} stroke={GOLD} strokeWidth="2" />
      <path d="M24 11.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill={GOLD} />
      <path d="M6 33c4-1 7.5-4.5 10-4.5h6.5a2.5 2.5 0 010 5H17" fill="none" stroke={TEAL} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 33c-4-1-7.5-4.5-10-4.5h-6.5a2.5 2.5 0 000 5H31" fill="none" stroke={TEAL} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 33v7h8l6-3h8l6 3h8v-7" fill={TEAL} fillOpacity=".15" stroke={TEAL} strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Faceted gem — pure, genuine materials. */
function GemIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M14 8h20l9 11-19 23L5 19z" fill={TEAL} fillOpacity=".18" stroke={TEAL} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M5 19h38M14 8l5 11 5-11 5 11 5-11M19 19l5 23 5-23" fill="none" stroke={TEAL} strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 8l5 11h10l5-11z" fill={GOLD_LIGHT} stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M40 4v6M37 7h6" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Lotus with a blessing diya flame. */
function BlessingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M24 4c2.6 3 3.4 6.3 0 9-3.4-2.7-2.6-6 0-9z" fill={GOLD} />
      <path d="M24 16c-3 4-4.5 9-4.5 13.5 0 4 2 7.5 4.5 9 2.5-1.5 4.5-5 4.5-9C28.5 25 27 20 24 16z" fill={GOLD_LIGHT} stroke={GOLD} strokeWidth="2" strokeLinejoin="round" />
      <path d="M22 30c-5-3-11-2.5-15 1.5 3.5 5 10 7 15 6.5M26 30c5-3 11-2.5 15 1.5-3.5 5-10 7-15 6.5" fill={TEAL} fillOpacity=".18" stroke={TEAL} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M8 43h32" stroke={TEAL} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Delivery van carrying a gift parcel. */
function DeliveryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M3 13h25v20H3z" fill={GOLD_LIGHT} stroke={GOLD} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M15.5 13v20M3 21h25" stroke={GOLD} strokeWidth="1.8" />
      <path d="M28 19h9l7 8v6H28z" fill={TEAL} fillOpacity=".18" stroke={TEAL} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M32 19v7h11" fill="none" stroke={TEAL} strokeWidth="1.8" />
      <circle cx="12" cy="36" r="4" fill="#fff" stroke={TEAL} strokeWidth="2.4" />
      <circle cx="36" cy="36" r="4" fill="#fff" stroke={TEAL} strokeWidth="2.4" />
    </svg>
  );
}

interface TrustBadgesProps {
  freeDeliveryThreshold?: number;
}

export function TrustBadges({ freeDeliveryThreshold = 999 }: TrustBadgesProps) {
  const reduceMotion = useReducedMotion();
  const badges = [
    { Icon: CraftIcon, label: 'Sacred Craftsmanship', motion: { rotate: [0, -6, 6, 0] } },
    { Icon: GemIcon, label: 'Pure Materials', motion: { scale: [1, 1.12, 1] } },
    { Icon: BlessingIcon, label: 'Divine Blessing', motion: { y: [0, -3, 0] } },
    { Icon: DeliveryIcon, label: `Free Delivery ₹${freeDeliveryThreshold.toLocaleString('en-IN')}+`, motion: { x: [0, 3, 0] } },
  ];

  return (
    <motion.ul
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.9 } } }}
      className="mt-10 sm:mt-12 grid grid-cols-4 gap-1.5 sm:flex sm:flex-nowrap sm:justify-center sm:gap-3 lg:gap-4 w-full max-w-4xl mx-auto"
      aria-label="Why shop with Nikunj Sakhi"
    >
      {badges.map(({ Icon, label, motion: loop }, i) => (
        <motion.li
          key={label}
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
          whileHover={reduceMotion ? undefined : { y: -3 }}
          className="group flex flex-col sm:flex-row items-center gap-1 sm:gap-2.5 text-center sm:text-left bg-white/85 backdrop-blur-xs px-1.5 py-2 sm:pl-2 sm:pr-4 sm:py-1.5 rounded-2xl sm:rounded-full border border-gold/25 shadow-sm hover:border-gold/60 hover:shadow-gold-sm transition-[border-color,box-shadow] whitespace-nowrap"
        >
          <motion.span
            animate={reduceMotion ? undefined : loop}
            transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.2, delay: i * 0.4, ease: 'easeInOut' }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-cream-200 to-white ring-1 ring-gold/20 flex items-center justify-center flex-shrink-0"
          >
            <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
          </motion.span>
          <span className="font-cinzel text-[8.5px] leading-tight sm:text-[11px] lg:text-xs tracking-wide sm:tracking-wider text-[var(--text-mid)] font-semibold whitespace-normal sm:whitespace-nowrap">
            {label}
          </span>
        </motion.li>
      ))}
    </motion.ul>
  );
}
