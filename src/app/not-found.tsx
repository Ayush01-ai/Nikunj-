import Link from 'next/link';
import type { Metadata } from 'next';
import { client } from '@/cms/lib/client';
import { SITE_SETTINGS_QUERY } from '@/cms/lib/queries';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';
import type { SiteSettings } from '@/types';

export const metadata: Metadata = {
  title: 'Page Not Found',
  robots: { index: false },
};

export default async function NotFound() {
  const settings = await client.fetch<SiteSettings>(SITE_SETTINGS_QUERY).catch(() => null);

  return (
    <>
      <Navbar settings={settings} />
      <main className="min-h-[70vh] bg-cream flex items-center justify-center px-4 py-20">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold-dark">
            <SacredIcon name="lotus" size={32} />
          </div>
          <p className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold-dark mb-2">Error 404</p>
          <h1 className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep mb-3">Page Not Found</h1>
          <p className="font-crimson italic text-[var(--text-mid)] mb-8">
            The page you are looking for may have moved or no longer exists.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/collections" className="btn-gold">
              Shop All
            </Link>
            <Link href="/" className="btn-outline-gold">
              Return Home
            </Link>
          </div>
        </div>
      </main>
      <Footer settings={settings} />
    </>
  );
}
