import type { Metadata } from 'next';
import Link from 'next/link';
import { sanityFetch } from '@/cms/lib/sanityFetch';
import { SITE_SETTINGS_QUERY } from '@/cms/lib/queries';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { AnnouncementBar } from '@/frontend/components/home/AnnouncementBar';
import { WhatsAppFloat } from '@/frontend/components/ui/WhatsAppFloat';
import { getWhatsAppHref } from '@/frontend/lib/whatsapp';
import type { SiteSettings } from '@/types';

export const revalidate = false; // on-demand only (see /api/revalidate)
export const fetchCache = 'force-cache'; // build-time Sanity reads are frozen into this deployment

const title = 'About Nikunj Sakhi – Handcrafted Shringar for Laddu Gopal';
const description =
  'Nikunj Sakhi makes handcrafted shringar, poshak, bedding, attar and pooja essentials for Laddu Gopal and Radha Krishna, delivered across India.';

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/about' },
  openGraph: { title, description, url: '/about' },
  twitter: { card: 'summary_large_image', title, description },
};

const offerings = [
  { name: 'Deity Shringar', href: '/collections/deity-shringar', text: 'Mukuts, haar, malas, bangles and earrings made with crystals, pearls, zircon and kundan.' },
  { name: 'Poshak & Vastra', href: '/collections/poshak-vastra', text: 'Festive and woollen poshaks for Laddu Gopal in a range of sizes.' },
  { name: 'Bedding Sets', href: '/collections/bedding-set', text: 'Soft velvet beds with pillows and blankets so Thakur Ji rests in comfort.' },
  { name: 'Attar, Agarbatti & Dhoop', href: '/collections/pooja-incense-and-dhoop', text: 'Rose, mogra, kewda and shamama attars, plus incense for daily seva.' },
  { name: 'Pooja Essentials', href: '/collections/spiritual-and-pooja-essentials', text: 'Tulsi malas, naam jaap malas and bead bags for daily chanting.' },
  { name: 'Braj Raj', href: '/collections/braj-raaj', text: 'Sacred dust of Braj for your home mandir.' },
];

export default async function AboutPage() {
  const settings = await sanityFetch<SiteSettings>('about', SITE_SETTINGS_QUERY);
  const whatsappNumber = settings?.whatsappNumber || '919118698641';
  const freeDelivery = settings?.freeDeliveryThreshold || 399;
  const waMessage = 'Namaste! 🙏 I have a question about Nikunj Sakhi.';

  return (
    <>
      {settings?.announcementActive && (
        <AnnouncementBar text={settings.announcement} whatsappNumber={whatsappNumber} instagramHandle={settings.instagramHandle} />
      )}
      <Navbar settings={settings} />

      <main className="min-h-screen bg-cream">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <span className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-3">Our Story</span>
          <h1 className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep mb-6">About Nikunj Sakhi</h1>

          <div className="space-y-5 font-crimson text-base sm:text-lg text-[var(--text-mid)] leading-relaxed">
            <p>
              Nikunj Sakhi is a devotional store for families who lovingly serve Laddu Gopal and Radha Krishna at home.
              In Braj, the <em>sakhis</em> of the nikunj are the companions who dress and decorate Radha Krishna with
              love — the same seva we hope to help you with every day.
            </p>
            <p>
              Every mukut, haar, poshak and bedding set we sell is handmade and checked piece by piece before it is
              packed. We describe each product honestly: the materials, the sizes it fits and the real price are listed
              on every product page, so you know exactly what you will receive.
            </p>
          </div>

          <h2 className="font-cinzel text-xl font-semibold text-deep mt-12 mb-5">What we offer</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {offerings.map((o) => (
              <li key={o.href} className="bg-white/80 border border-gold/25 p-5 rounded-xs">
                <Link prefetch={false} href={o.href} className="font-cinzel text-sm font-semibold text-gold-dark hover:underline">
                  {o.name}
                </Link>
                <p className="font-crimson text-base text-[var(--text-mid)] mt-1.5 leading-snug">{o.text}</p>
              </li>
            ))}
          </ul>

          <h2 className="font-cinzel text-xl font-semibold text-deep mt-12 mb-5">Our promise to you</h2>
          <ul className="space-y-3 font-crimson text-base sm:text-lg text-[var(--text-mid)] leading-relaxed list-disc pl-5">
            <li>Free delivery across India on orders above ₹{freeDelivery}.</li>
            <li>Secure payment through Cashfree and UPI, with Cash on Delivery available.</li>
            <li>
              A simple{' '}
              <Link prefetch={false} href="/policies/return" className="text-gold-dark underline">7-day return and replacement policy</Link>{' '}
              if a piece arrives damaged or does not fit.
            </li>
            <li>
              Help choosing the right size — see our{' '}
              <Link prefetch={false} href="/laddu-gopal-size-guide" className="text-gold-dark underline">Laddu Gopal size guide</Link>{' '}
              or send us a photo of your Thakur Ji.
            </li>
          </ul>

          <div className="mt-12 bg-white/80 border border-gold/25 p-6 rounded-xs">
            <h2 className="font-cinzel text-lg font-semibold text-deep mb-2">Talk to us</h2>
            <p className="font-crimson text-base text-[var(--text-mid)] leading-relaxed">
              Questions about a size, a custom order or an existing order? Message us on{' '}
              <a href={getWhatsAppHref(whatsappNumber, waMessage)} target="_blank" rel="noopener noreferrer" className="text-gold-dark underline">WhatsApp</a>{' '}
              or visit our <Link prefetch={false} href="/contact" className="text-gold-dark underline">contact page</Link>.
            </p>
          </div>
        </div>
      </main>

      <Footer settings={settings} />
      <WhatsAppFloat number={whatsappNumber} message={waMessage} />
    </>
  );
}
