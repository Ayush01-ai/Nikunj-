import type { Metadata } from 'next';
import { sanityFetch } from '@/cms/lib/sanityFetch';
import { SITE_SETTINGS_QUERY } from '@/cms/lib/queries';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { AnnouncementBar } from '@/frontend/components/home/AnnouncementBar';
import { WhatsAppFloat } from '@/frontend/components/ui/WhatsAppFloat';
import { CartSidebar } from '@/frontend/components/cart/CartSidebar';
import { ContactContent } from './ContactContent';
import type { SiteSettings } from '@/types';

export const revalidate = false; // on-demand only (see /api/revalidate)
export const fetchCache = 'force-cache'; // build-time Sanity reads are frozen into this deployment

export const metadata: Metadata = {
  title: 'Contact Us & Support | Nikunj Sakhi',
  description:
    'Contact Nikunj Sakhi devotee support for deity ornaments, idol measurements, custom orders, returns, and tracking. Email: Nikunj.sakhi14@gmail.com, WhatsApp: +91 91186 98641.',
  openGraph: {
    title: 'Contact Us & Devotee Support | Nikunj Sakhi',
    description:
      'We are here to assist with deity jewellery sizes, orders, tracking, and divine craftsmanship inquiries. Email: Nikunj.sakhi14@gmail.com',
  },
};

export default async function ContactPage() {
  const settings = await sanityFetch<SiteSettings>('contact', SITE_SETTINGS_QUERY);
  const whatsappNumber = settings?.whatsappNumber || '919118698641';

  return (
    <>
      {settings?.announcementActive && (
        <AnnouncementBar
          text={settings.announcement}
          whatsappNumber={whatsappNumber}
          instagramHandle={settings.instagramHandle}
        />
      )}
      <Navbar settings={settings} />
      <CartSidebar />

      <main>
        <ContactContent settings={settings} />
      </main>

      <Footer settings={settings} />
      <WhatsAppFloat
        number={whatsappNumber}
        message="Namaste! 🙏 I need assistance regarding Nikunj Sakhi divine ornaments."
      />
    </>
  );
}
