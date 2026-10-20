import React from 'react';

export const PRODUCT_TYPE_ICONS = [
  'all',
  'crown',
  'necklace',
  'bangle',
  'earring',
  'anklet',
  'flute',
  'dress',
  'turban',
  'throne',
  'swing',
  'fragrance',
  'incense',
  'diya',
  'set',
] as const;

export type ProductTypeIconName = (typeof PRODUCT_TYPE_ICONS)[number];

const KEYWORDS: [RegExp, ProductTypeIconName][] = [
  [/mukut|crown|kireet/i, 'crown'],
  [/haar|mala|necklace|kanthi/i, 'necklace'],
  [/bangle|kangan|chudi|kada/i, 'bangle'],
  [/kundal|earring|jhumk/i, 'earring'],
  [/payal|anklet|pajeb/i, 'anklet'],
  [/bansuri|flute|murli/i, 'flute'],
  [/pagdi|patka|turban/i, 'turban'],
  [/poshak|dress|vastra|outfit/i, 'dress'],
  [/singhasan|throne|asan/i, 'throne'],
  [/jhula|swing|palna/i, 'swing'],
  [/attar|ittar|itra|perfume/i, 'fragrance'],
  [/agarbatti|incense|dhoop|sambrani|cone/i, 'incense'],
  [/shringar|set/i, 'set'],
];

export function iconForTypeName(name: string, override?: string): ProductTypeIconName {
  if (override && (PRODUCT_TYPE_ICONS as readonly string[]).includes(override)) {
    return override as ProductTypeIconName;
  }
  return KEYWORDS.find(([re]) => re.test(name))?.[1] ?? 'diya';
}

/** Two-tone teal/gold glyphs that match the brand logo. */
export function ProductTypeIcon({
  name,
  size = 28,
  className = '',
}: {
  name: ProductTypeIconName;
  size?: number;
  className?: string;
}) {
  const teal = '#0f6d6a';
  const gold = '#c9922a';
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'all':
      return (
        <svg {...common}>
          <rect x="5" y="5" width="9" height="9" rx="2" stroke={teal} fill={`${teal}22`} />
          <rect x="18" y="5" width="9" height="9" rx="2" stroke={gold} fill={`${gold}22`} />
          <rect x="5" y="18" width="9" height="9" rx="2" stroke={gold} fill={`${gold}22`} />
          <rect x="18" y="18" width="9" height="9" rx="2" stroke={teal} fill={`${teal}22`} />
        </svg>
      );
    case 'crown':
      return (
        <svg {...common}>
          <path d="M5 23 7 10l5 6 4-9 4 9 5-6 2 13Z" stroke={gold} fill={`${gold}2e`} />
          <path d="M6 26h20" stroke={teal} />
          <circle cx="16" cy="7" r="1.6" fill={teal} stroke="none" />
          <circle cx="16" cy="19.5" r="1.8" stroke={teal} />
        </svg>
      );
    case 'necklace':
      return (
        <svg {...common}>
          <path d="M6 6c0 9 4.5 14 10 14s10-5 10-14" stroke={gold} />
          <path d="M9 7c0 6.5 3 10.5 7 10.5S23 13.5 23 7" stroke={teal} strokeDasharray="1 2.4" />
          <path d="M16 20l-3 4 3 4 3-4Z" stroke={teal} fill={`${teal}2e`} />
        </svg>
      );
    case 'bangle':
      return (
        <svg {...common}>
          <ellipse cx="13" cy="16" rx="8" ry="8" stroke={gold} fill={`${gold}14`} />
          <ellipse cx="19" cy="16" rx="8" ry="8" stroke={teal} />
          <circle cx="13" cy="8" r="1.4" fill={gold} stroke="none" />
          <circle cx="19" cy="24" r="1.4" fill={teal} stroke="none" />
        </svg>
      );
    case 'earring':
      return (
        <svg {...common}>
          <circle cx="16" cy="6" r="2" stroke={teal} />
          <path d="M16 8v3" stroke={teal} />
          <path d="M9 18a7 7 0 0 1 14 0Z" stroke={gold} fill={`${gold}2e`} />
          <path d="M10 21.5v2.5M13 22v3.5M16 22v4M19 22v3.5M22 21.5v2.5" stroke={gold} />
        </svg>
      );
    case 'anklet':
      return (
        <svg {...common}>
          <path d="M5 14c3 3 7 4.5 11 4.5S24 17 27 14" stroke={teal} />
          {[8, 12, 16, 20, 24].map((x, i) => (
            <g key={x}>
              <path d={`M${x} ${15.5 + (i === 2 ? 3 : i % 2 ? 2.3 : 1)}v2`} stroke={gold} />
              <circle cx={x} cy={19.5 + (i === 2 ? 3 : i % 2 ? 2.3 : 1)} r="1.6" fill={gold} stroke="none" />
            </g>
          ))}
        </svg>
      );
    case 'flute':
      return (
        <svg {...common}>
          <path d="M5 25 25 7" stroke={gold} strokeWidth="3.2" />
          <path d="M5 25 25 7" stroke="#fff8e8" strokeWidth="1" />
          {[10, 13.5, 17, 20.5].map((x) => (
            <circle key={x} cx={x} cy={30 - x - 0.5} r="0.9" fill={teal} stroke="none" />
          ))}
          <path d="M23 9c2-3 4-3 5-2-1 2-3 3-5 2Z" stroke={teal} fill={`${teal}2e`} />
        </svg>
      );
    case 'dress':
      return (
        <svg {...common}>
          <path d="M12 4h8l-1 5 6 17H7l6-17Z" stroke={teal} fill={`${teal}1f`} />
          <path d="M8.5 22h15" stroke={gold} />
          <path d="M13 9h6" stroke={gold} />
        </svg>
      );
    case 'turban':
      return (
        <svg {...common}>
          <path d="M5 21c0-7 5-12 11-12s11 5 11 12Z" stroke={teal} fill={`${teal}1f`} />
          <path d="M6 17c5 1 10-3 20 1M8 13c4 1 8-2 14 0" stroke={gold} />
          <path d="M16 9c-1-3 1-6 3-6-1 2 0 3 1 4" stroke={gold} />
          <path d="M4 21h24" stroke={teal} />
        </svg>
      );
    case 'throne':
      return (
        <svg {...common}>
          <path d="M9 17V8c0-2 3-4 7-4s7 2 7 4v9" stroke={gold} fill={`${gold}1f`} />
          <path d="M6 17h20v4H6Z" stroke={teal} fill={`${teal}22`} />
          <path d="M8 21v6M24 21v6" stroke={teal} />
        </svg>
      );
    case 'swing':
      return (
        <svg {...common}>
          <path d="M4 4h24" stroke={teal} />
          <path d="M9 4v15M23 4v15" stroke={gold} strokeDasharray="1.5 2" />
          <path d="M6 19h20l-2 5H8Z" stroke={teal} fill={`${teal}22`} />
          <path d="M14 15h4" stroke={gold} />
        </svg>
      );
    case 'fragrance':
      return (
        <svg {...common}>
          <path d="M13 6h6v4h-6Z" stroke={teal} />
          <path d="M11 10h10l2 5v9a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3v-9Z" stroke={gold} fill={`${gold}22`} />
          <path d="M16 15c-2 2.5-2 4.5 0 6 2-1.5 2-3.5 0-6Z" stroke={teal} fill={`${teal}2e`} />
        </svg>
      );
    case 'incense':
      return (
        <svg {...common}>
          <path d="M16 27V12" stroke={gold} strokeWidth="2" />
          <path d="M16 11c-2-2 2-3 0-5s2-3 0-4" stroke={teal} />
          <path d="M8 27h16" stroke={teal} />
          <circle cx="16" cy="12" r="1.2" fill="#e5563b" stroke="none" />
        </svg>
      );
    case 'set':
      return (
        <svg {...common}>
          <path d="M5 13 7 6l3 3.5L12 5l2 4.5L17 6l2 7Z" stroke={gold} fill={`${gold}2e`} />
          <path d="M14 16c0 5.5 3 9 6.5 9S27 21.5 27 16" stroke={teal} />
          <circle cx="20.5" cy="25" r="1.6" fill={gold} stroke="none" />
          <circle cx="8" cy="22" r="4" stroke={teal} />
        </svg>
      );
    case 'diya':
    default:
      return (
        <svg {...common}>
          <path d="M16 4c-2 3.5-3.5 5.5-3.5 8a3.5 3.5 0 0 0 7 0c0-2.5-1.5-4.5-3.5-8Z" stroke={gold} fill={`${gold}33`} />
          <path d="M4 18c0 5 5.5 8 12 8s12-3 12-8Z" stroke={teal} fill={`${teal}1f`} />
          <path d="M11 28h10" stroke={teal} />
        </svg>
      );
  }
}
