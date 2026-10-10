'use client';

import Image from 'next/image';

interface NikunjSakhiLogoProps {
  className?: string;
  variant?: 'light' | 'dark';
}

export function NikunjSakhiLogo({ className = 'w-48', variant = 'light' }: NikunjSakhiLogoProps) {
  const sizing = /(^|\s)(\w+:)?h-/.test(className) ? `${className} w-auto` : `${className} h-auto`;

  const image = (
    <Image
      // Dark surfaces get a tone-lifted copy of the artwork so the teal lettering and tagline stay legible.
      src={variant === 'dark' ? '/nikunj-sakhi-logo-v3-dark.webp' : '/nikunj-sakhi-logo-v3.webp'}
      alt="Nikunj Sakhi - Serve with Devotion"
      width={774}
      height={522}
      priority={variant === 'light'}
      className={`${sizing} object-contain`}
    />
  );

  return image;
}