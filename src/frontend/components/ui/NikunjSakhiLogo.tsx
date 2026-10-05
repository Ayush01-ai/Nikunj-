'use client';

import Image from 'next/image';

interface NikunjSakhiLogoProps {
  className?: string;
  variant?: 'light' | 'dark';
}

export function NikunjSakhiLogo({ className = 'w-48', variant = 'light' }: NikunjSakhiLogoProps) {
  return (
    <Image
      src="/nikunj-sakhi-logo.png"
      alt="Nikunj Sakhi – Divine God Ornaments"
      width={800}
      height={420}
      priority
      className={`${className} h-auto object-contain`}
      style={{
        filter: variant === 'dark'
          ? 'drop-shadow(0 4px 24px rgba(201,146,42,0.5)) brightness(1.1)'
          : 'drop-shadow(0 4px 32px rgba(201,146,42,0.35)) drop-shadow(0 2px 8px rgba(26,10,0,0.08))',
      }}
    />
  );
}
