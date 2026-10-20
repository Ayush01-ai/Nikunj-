import localFont from 'next/font/local';

// All site fonts are self-hosted from src/app/_fonts (SIL Open Font License,
// see LICENSE-*.txt there) so nothing is fetched from Google at build or run time.

export const cinzel = localFont({
  src: [
    { path: './_fonts/cinzel-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './_fonts/cinzel-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './_fonts/cinzel-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './_fonts/cinzel-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './_fonts/cinzel-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-cinzel',
  display: 'swap',
});

export const cinzelDecorative = localFont({
  src: [
    { path: './_fonts/cinzel-decorative-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './_fonts/cinzel-decorative-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './_fonts/cinzel-decorative-latin-900-normal.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-cinzel-decorative',
  display: 'swap',
});

export const crimsonText = localFont({
  src: [
    { path: './_fonts/crimson-text-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './_fonts/crimson-text-latin-400-italic.woff2', weight: '400', style: 'italic' },
    { path: './_fonts/crimson-text-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './_fonts/crimson-text-latin-600-italic.woff2', weight: '600', style: 'italic' },
    { path: './_fonts/crimson-text-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './_fonts/crimson-text-latin-700-italic.woff2', weight: '700', style: 'italic' },
  ],
  variable: '--font-crimson',
  display: 'swap',
});

export const lato = localFont({
  src: [
    { path: './_fonts/lato-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: './_fonts/lato-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './_fonts/lato-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './_fonts/lato-latin-900-normal.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-lato',
  display: 'swap',
});

export const montserrat = localFont({
  src: [
    { path: './_fonts/montserrat-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: './_fonts/montserrat-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './_fonts/montserrat-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './_fonts/montserrat-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './_fonts/montserrat-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-montserrat',
  display: 'swap',
});

export const greatVibes = localFont({
  src: [{ path: './_fonts/great-vibes-latin-400-normal.woff2', weight: '400', style: 'normal' }],
  variable: '--font-great-vibes',
  display: 'swap',
});

// Devanagari-styled display face for the Anglo-Hindi "Namaste" greeting (only Devanagari text uses it).
export const yatraOne = localFont({
  src: [{ path: './_fonts/yatra-one-devanagari-400-normal.woff2', weight: '400', style: 'normal' }],
  variable: '--font-yatra',
  display: 'swap',
});
