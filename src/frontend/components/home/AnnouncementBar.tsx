'use client';

import React from 'react';
import { getWhatsAppHref, normalizeWhatsAppNumber } from '@/frontend/lib/whatsapp';

interface AnnouncementBarProps {
  text?: string;
  whatsappNumber?: string;
  instagramHandle?: string;
}

export function AnnouncementBar({ text, whatsappNumber, instagramHandle }: AnnouncementBarProps) {
  if (!text && !whatsappNumber && !instagramHandle) return null;

  const cleanWhatsapp = normalizeWhatsAppNumber(whatsappNumber);
  const waUrl = getWhatsAppHref(
    whatsappNumber,
    'Namaste! 🙏 I would like to know more about Nikunj Sakhi divine ornaments.',
  );

  // If text from CMS already includes the coupon code, show it; otherwise ensure the coupon message is prominently included
  const hasCouponMention = text && /first100/i.test(text);

  return (
    <aside
      aria-label="Announcement"
      className="bg-gold-dark text-white text-center py-2 px-3 sm:px-4 font-cinzel text-[11px] sm:text-xs tracking-wider"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
        <span>✦ Free delivery on orders above ₹399</span>
        <span aria-hidden="true" className="text-white/60">|</span>
        <span>
          Use coupon code for discount &ndash; <strong className="font-bold underline decoration-white/80 underline-offset-2">First100</strong> (first 100 customers only)
        </span>
        {cleanWhatsapp && (
          <>
            <span aria-hidden="true" className="text-white/60">|</span>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white/80 transition-colors inline-flex items-center gap-1 font-medium"
            >
              WhatsApp Us
            </a>
          </>
        )}
        {instagramHandle && (
          <>
            <span aria-hidden="true" className="text-white/60">|</span>
            <a
              href={`https://www.instagram.com/${instagramHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white/80 transition-colors"
            >
              @{instagramHandle}
            </a>
          </>
        )}
        <span aria-hidden="true">✦</span>
      </div>
    </aside>
  );
}
