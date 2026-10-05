import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/frontend/providers/Providers';
import { client } from '@/cms/lib/client';
import { SITE_SETTINGS_QUERY, NAV_MENU_QUERY } from '@/cms/lib/queries';
import { urlFor } from '@/cms/lib/image';
import { CookieConsent } from '@/frontend/components/ui/CookieConsent';
import type { NavMenuCategory, SiteSettings } from '@/types';

export const revalidate = 3600; // Revalidate hourly

async function getSiteSettings(): Promise<SiteSettings | null> {
  try {
    return await client.fetch<SiteSettings>(SITE_SETTINGS_QUERY);
  } catch {
    return null;
  }
}

async function getNavMenu(): Promise<NavMenuCategory[]> {
  try {
    return await client.fetch<NavMenuCategory[]>(NAV_MENU_QUERY);
  } catch {
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const ogImage = settings?.ogImage?.asset
    ? urlFor(settings.ogImage).width(1200).height(630).fit('crop').url()
    : '/og-default.jpg';

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://nikunjsakhi.com'),
    title: {
      default: settings?.seoTitle || 'Nikunj Sakhi – Divine God Ornaments',
      template: '%s | Nikunj Sakhi',
    },
    description:
      settings?.seoDescription ||
      'Shop handcrafted divine god ornaments, deity jewellery, mukut, haar, mala set, and pooja samagri for Radha Krishna, Kanha Ji, and Laddu Gopal.',
    keywords: [
      'god ornaments', 'deity jewellery', 'radha krishna jewellery',
      'kanha ji mukut', 'laddu gopal ornaments', 'pooja samagri',
      'divine jewellery', 'handcrafted jewellery', 'nikunj sakhi',
    ],
    authors: [{ name: 'Nikunj Sakhi' }],
    creator: 'Nikunj Sakhi',
    publisher: 'Nikunj Sakhi',
    formatDetection: { telephone: true, email: true },
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      siteName: 'Nikunj Sakhi',
      title: settings?.seoTitle || 'Nikunj Sakhi – Divine God Ornaments',
      description: settings?.seoDescription || '',
      images: [{ url: ogImage, width: 1200, height: 630, alt: 'Nikunj Sakhi – Divine God Ornaments' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: settings?.seoTitle || 'Nikunj Sakhi',
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
    },
    manifest: '/site.webmanifest',
    icons: {
      icon: [
        { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: '/apple-touch-icon.png',
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#C9922A',
};

import { cinzel, cinzelDecorative, crimsonText, lato, montserrat, greatVibes } from '@/app/fonts';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, menu] = await Promise.all([getSiteSettings(), getNavMenu()]);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cinzel.variable} ${cinzelDecorative.variable} ${crimsonText.variable} ${lato.variable} ${montserrat.variable} ${greatVibes.variable}`}
    >
      <body className="font-lato antialiased bg-cream text-deep selection:bg-gold selection:text-white">
        <Providers siteSettings={settings} menu={menu}>{children}</Providers>
        <CookieConsent gaId={process.env.NEXT_PUBLIC_GA_ID} />
      </body>
    </html>
  );
}

