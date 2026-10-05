import { Cinzel, Cinzel_Decorative, Crimson_Text, Lato, Montserrat, Great_Vibes } from 'next/font/google';

export const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cinzel',
  display: 'swap',
});

export const cinzelDecorative = Cinzel_Decorative({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-cinzel-decorative',
  display: 'swap',
});

export const crimsonText = Crimson_Text({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-crimson',
  display: 'swap',
});

export const lato = Lato({
  subsets: ['latin'],
  weight: ['300', '400', '700', '900'],
  variable: '--font-lato',
  display: 'swap',
});

export const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const greatVibes = Great_Vibes({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-great-vibes',
  display: 'swap',
});
