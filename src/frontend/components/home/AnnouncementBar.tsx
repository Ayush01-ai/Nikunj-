'use client';

import React from 'react';
import Link from 'next/link';

interface AnnouncementBarProps {
  text?: string;
  whatsappNumber?: string;
  instagramHandle?: string;
}

export function AnnouncementBar({ text, whatsappNumber, instagramHandle }: AnnouncementBarProps) {
  // U5: Don't render a blank bar when no content is configured
  if (!text && !whatsappNumber && !instagramHandle) return null;

  return (
    <div className="bg-gold-dark text-white text-center py-2 px-4 font-cinzel text-xs tracking-widest">
      <p>
        {text || (
          <>
            ✦ Free delivery on orders above ₹999 &nbsp;|&nbsp;
            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white/80 transition-colors"
              >
                WhatsApp Us
              </a>
            )}
            {instagramHandle && (
              <>
                &nbsp;|&nbsp;
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
            &nbsp; ✦
          </>
        )}
      </p>
    </div>
  );
}
