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

const title = 'Laddu Gopal Size Guide – How to Measure Your Thakur Ji';
const description =
  'Find the right poshak, mukut and bedding size for your Laddu Gopal. Measure the idol height, match it to sizes 0–7, or send us a photo on WhatsApp.';

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/laddu-gopal-size-guide' },
  openGraph: { title, description, url: '/laddu-gopal-size-guide' },
  twitter: { card: 'summary_large_image', title, description },
};

// Approximate seated heights; makers vary, so shoppers are asked to confirm on WhatsApp when unsure.
const SIZES = [
  { size: '0', inches: '2 – 2.5″', cm: '5 – 6.5 cm' },
  { size: '1', inches: '2.5 – 3″', cm: '6.5 – 7.5 cm' },
  { size: '2', inches: '3 – 3.5″', cm: '7.5 – 9 cm' },
  { size: '3', inches: '3.5 – 4″', cm: '9 – 10 cm' },
  { size: '4', inches: '4 – 4.5″', cm: '10 – 11.5 cm' },
  { size: '5', inches: '5 – 5.5″', cm: '12.5 – 14 cm' },
  { size: '6', inches: '6 – 6.5″', cm: '15 – 16.5 cm' },
  { size: '7', inches: '7″ and above', cm: '18 cm and above' },
];

const FAQS = [
  {
    q: 'How do I measure my Laddu Gopal?',
    a: 'Seat Thakur Ji on a flat surface and measure straight up from the base to the top of the head (not including any mukut). Use a ruler or tape in inches or centimetres.',
  },
  {
    q: 'My Laddu Gopal is between two sizes. Which should I choose?',
    a: 'Choose the larger size for poshak and bedding so it sits comfortably. For mukuts and malas, message us a photo and we will suggest the best fit.',
  },
  {
    q: 'Is the size number the same in every shop?',
    a: 'Not always — idol makers in different regions number their sizes a little differently. That is why we recommend checking the height in inches as well as the size number.',
  },
];

export default async function SizeGuidePage() {
  const settings = await sanityFetch<SiteSettings>('size-guide', SITE_SETTINGS_QUERY);
  const whatsappNumber = settings?.whatsappNumber || '919118698641';
  const waMessage = 'Namaste! 🙏 Please help me choose the right size for my Laddu Gopal.';

  const faqData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  return (
    <>
      {settings?.announcementActive && (
        <AnnouncementBar text={settings.announcement} whatsappNumber={whatsappNumber} instagramHandle={settings.instagramHandle} />
      )}
      <Navbar settings={settings} />

      <main className="min-h-screen bg-cream">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData).replace(/</g, '\\u003c') }} />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <span className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-3">Size Guide</span>
          <h1 className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep mb-6">Laddu Gopal Size Guide</h1>

          <p className="font-crimson text-base sm:text-lg text-[var(--text-mid)] leading-relaxed">
            Laddu Gopal poshaks, mukuts and bedding are sold by size number. Measure the height of your seated Thakur Ji
            and match it with the chart below. These measurements are approximate — if you are unsure, send us a photo
            on WhatsApp and we will tell you the right size.
          </p>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full border border-gold/25 bg-white/80 text-left">
              <caption className="sr-only">Approximate Laddu Gopal height for each size</caption>
              <thead className="bg-gold/10">
                <tr>
                  <th scope="col" className="font-cinzel text-xs tracking-wider text-deep px-4 py-3">Size</th>
                  <th scope="col" className="font-cinzel text-xs tracking-wider text-deep px-4 py-3">Idol height (inches)</th>
                  <th scope="col" className="font-cinzel text-xs tracking-wider text-deep px-4 py-3">Idol height (cm)</th>
                </tr>
              </thead>
              <tbody className="font-crimson text-base text-[var(--text-mid)]">
                {SIZES.map((s) => (
                  <tr key={s.size} className="border-t border-gold/15">
                    <th scope="row" className="px-4 py-2.5 font-semibold text-deep">No. {s.size}</th>
                    <td className="px-4 py-2.5">{s.inches}</td>
                    <td className="px-4 py-2.5">{s.cm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-crimson text-sm italic text-[var(--text-mid)]">
            Heights are approximate and measured from the base to the top of the head, without a mukut.
          </p>

          <h2 className="font-cinzel text-xl font-semibold text-deep mt-12 mb-5">Common questions</h2>
          <div className="space-y-5">
            {FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-cinzel text-sm font-semibold text-deep">{f.q}</h3>
                <p className="font-crimson text-base text-[var(--text-mid)] leading-relaxed mt-1">{f.a}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-white/80 border border-gold/25 p-6 rounded-xs">
            <h2 className="font-cinzel text-lg font-semibold text-deep mb-2">Still not sure?</h2>
            <p className="font-crimson text-base text-[var(--text-mid)] leading-relaxed">
              <a href={getWhatsAppHref(whatsappNumber, waMessage)} target="_blank" rel="noopener noreferrer" className="text-gold-dark underline">
                Send us a photo on WhatsApp
              </a>{' '}
              with a ruler next to your Thakur Ji. Then browse{' '}
              <Link prefetch={false} href="/collections/poshak-vastra" className="text-gold-dark underline">poshak</Link>,{' '}
              <Link prefetch={false} href="/collections/deity-shringar" className="text-gold-dark underline">shringar</Link> and{' '}
              <Link prefetch={false} href="/collections/bedding-set" className="text-gold-dark underline">bedding sets</Link>.
            </p>
          </div>
        </div>
      </main>

      <Footer settings={settings} />
      <WhatsAppFloat number={whatsappNumber} message={waMessage} />
    </>
  );
}
