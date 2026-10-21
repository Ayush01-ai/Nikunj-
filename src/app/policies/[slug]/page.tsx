import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';
import { client } from '@/cms/lib/client';
import { SITE_SETTINGS_QUERY } from '@/cms/lib/queries';
import type { SiteSettings } from '@/types';

interface PolicyPageProps {
  params: Promise<{ slug: string }>;
}

const policies: Record<string, { title: string; content: string[] }> = {
  return: {
    title: 'Return Policy',
    content: [
      'We want you to be completely satisfied with your purchase. Items may be returned within 7 days of delivery.',
      'Eligibility: Items must be unused and in their original packaging. Items damaged during shipping are eligible for a full refund or replacement. Customised items are non-returnable unless defective.',
      'How to Return: Contact us via WhatsApp or email within 7 days of receiving your order with your order ID and reason for return. Our team will guide you through the process.',
      'Refunds: Approved refunds are processed within 5-7 business days to the original payment method.',
    ],
  },
  shipping: {
    title: 'Shipping Policy',
    content: [
      'We take pride in delivering your divine ornaments safely and swiftly.',
      'Delivery Timelines: Standard Delivery 5-7 business days. Express Delivery 2-3 business days where available.',
      'Free Delivery: Enjoy free standard delivery on orders above Rs.999.',
      'Packaging: All items are carefully packed to ensure they arrive in perfect condition.',
      'Tracking: Once your order is dispatched, you will receive a tracking number via SMS or WhatsApp.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    content: [
      'Your privacy is important to us. This policy explains how we collect, use, and protect your information.',
      'Information We Collect: Name, phone number, and email address when you place an order. Delivery address for shipping. Payment information is processed securely via Cashfree and is never stored by us. If a refund is due on a Cash on Delivery order, the UPI ID or bank account you share is used only to send that refund.',
      'How We Use Your Information: To process and fulfil orders, send order updates, and respond to your queries. If you enter your mobile number at checkout but do not complete the order, we may contact you once on WhatsApp to help you finish it.',
      'We Do Not sell or share your personal data with third parties for marketing purposes or store your payment credentials.',
      'Cookies: We use essential cookies to keep you signed in and to remember your cart. We count visits and pages viewed (without cookies or personal identifiers) to improve the store, and with your consent we also use Google Analytics cookies to understand how visitors use the site. Choosing "Essential only" in the cookie banner turns off all visit counting; clear your browser storage to change your choice.',
      'Reviews: If you submit a review, your phone number is used only to verify it and is never shown publicly.',
      'Data Security: We use industry-standard encryption. You may request deletion of your data by contacting us.',
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    content: [
      'By using this website and placing an order with Nikunj Sakhi, you agree to these terms.',
      'Products: We make every effort to display product colours, sizes and details accurately. Because our ornaments and attars are handcrafted, small variations in colour, finish and fragrance are natural and are not defects.',
      'Pricing & Payment: All prices are in Indian Rupees (INR) and include applicable taxes unless stated otherwise. Prices are confirmed at checkout. Payments are processed securely by Cashfree; Cash on Delivery is available where shown.',
      'Orders: An order is confirmed once payment is received (or once a Cash on Delivery order is accepted). We may cancel an order in case of a pricing error, stock unavailability, or suspected fraud, and will refund any amount paid in full.',
      'Shipping, Returns & Refunds: These are governed by our Shipping Policy and Return Policy, which form part of these terms.',
      'Reviews: Reviews you submit may be displayed on the website after moderation. We may decline to publish any review at our discretion.',
      'Intellectual Property: All images, designs and content on this website belong to Nikunj Sakhi and may not be reused without permission.',
      'Governing Law: These terms are governed by the laws of India. For any questions, contact us via WhatsApp or email.',
    ],
  },
};

export const revalidate = false; // on-demand only (see /api/revalidate); no queue for time-based ISR

export function generateStaticParams() {
  return Object.keys(policies).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PolicyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const policy = policies[slug];
  return {
    title: policy?.title ?? 'Policy',
    description: 'Nikunj Sakhi ' + (policy?.title ?? 'Policy'),
  };
}

export default async function PolicyPage({ params }: PolicyPageProps) {
  const { slug } = await params;
  const policy = policies[slug];
  if (!policy) notFound();
  const settings = await client.fetch<SiteSettings>(SITE_SETTINGS_QUERY).catch(() => null);

  return (
    <>
      <Navbar settings={settings} />
      <main className="min-h-screen bg-cream">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {policy ? (
            <>
              <span className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-3">
                Legal
              </span>
              <h1 className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep mb-8">
                {policy.title}
              </h1>
              <div className="space-y-5">
                {policy.content.map((para, i) => (
                  <p key={i} className="font-crimson text-base text-[var(--text-mid)] leading-relaxed">
                    {para.replace('Rs.999', `Rs.${settings?.freeDeliveryThreshold || 999}`)}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold shadow-gold-sm">
                <SacredIcon name="lotus" size={32} />
              </div>
              <h1 className="font-cinzel text-xl text-deep mb-4 font-semibold">Page Not Found</h1>
              <p className="font-crimson italic text-[var(--text-mid)] mb-6">
                The policy you are looking for does not exist.
              </p>
              <Link href="/" className="btn-gold">
                Return Home
              </Link>
            </div>
          )}

          <div className="mt-12 pt-8 border-t border-[var(--border)] flex flex-wrap gap-6">
            <Link href="/policies/return" className="font-cinzel text-xs tracking-wider text-gold hover:text-gold-dark transition-colors">
              Return Policy
            </Link>
            <Link href="/policies/shipping" className="font-cinzel text-xs tracking-wider text-gold hover:text-gold-dark transition-colors">
              Shipping Policy
            </Link>
            <Link href="/policies/privacy" className="font-cinzel text-xs tracking-wider text-gold hover:text-gold-dark transition-colors">
              Privacy Policy
            </Link>
            <Link href="/policies/terms" className="font-cinzel text-xs tracking-wider text-gold hover:text-gold-dark transition-colors">
              Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </main>
      <Footer settings={settings} />
    </>
  );
}
