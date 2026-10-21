import { ScrollText, Sparkles, RotateCcw } from 'lucide-react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { client } from '@/cms/lib/client';
import { sanityFetch } from '@/cms/lib/sanityFetch';
import {
  PRODUCT_BY_SLUG_QUERY,
  RELATED_PRODUCTS_QUERY,
  DIFFERENT_PRODUCTS_QUERY,
  PRODUCT_REVIEWS_QUERY,
  ALL_PRODUCT_SLUGS_QUERY,
  SITE_SETTINGS_QUERY,
} from '@/cms/lib/queries';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { BackButton } from '@/frontend/components/ui/BackButton';
import { Footer } from '@/frontend/components/layout/Footer';
import { AnnouncementBar } from '@/frontend/components/home/AnnouncementBar';
import { ProductDetail } from '@/frontend/components/products/ProductDetail';
import { ProductCard } from '@/frontend/components/products/ProductCard';
import { CartSidebar } from '@/frontend/components/cart/CartSidebar';
import { WhatsAppFloat } from '@/frontend/components/ui/WhatsAppFloat';
import { PortableText, type PortableTextBlock } from '@portabletext/react';
import type { Product, SiteSettings, Testimonial } from '@/types';
import { pickDiverse, seedFrom } from '@/cms/lib/suggestions';

export const revalidate = false; // on-demand only (see /api/revalidate); no queue for time-based ISR

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  try {
    const slugs = await client.fetch<{ slug: string }[]>(ALL_PRODUCT_SLUGS_QUERY, {}, { next: { revalidate: false, tags: ['sanity'] } });
    return slugs.map(({ slug }) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await client.fetch<Product>(PRODUCT_BY_SLUG_QUERY, { slug }, { next: { revalidate: false, tags: ['sanity'] } });
  if (!product) return {};

  const imageUrl = product.images?.find((img) => img?.asset?.url)?.asset.url ?? '/og-default.jpg';

  return {
    title: product.seoTitle || product.name,
    description: product.seoDescription || product.shortDescription,
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      title: product.name,
      description: product.shortDescription || '',
      images: [{ url: imageUrl }],
    },
  };
}

async function getData(slug: string) {
  // A fetch error propagates (not null) so a Sanity outage can't be cached as a 404.
  const product = await sanityFetch<Product | null>('product', PRODUCT_BY_SLUG_QUERY, { slug });
  if (!product) return null;

  let relatedProducts: Product[] = [];
  let differentProducts: Product[] = [];
  let reviews: Testimonial[] = [];
  let settings: SiteSettings | null = null;
  // Each section degrades on its own, so one failing query can't hide reviews or suggestions.
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  let different: Product[];
  [relatedProducts, different, reviews, settings] = await Promise.all([
    safe(
      client.fetch<Product[]>(RELATED_PRODUCTS_QUERY, {
        categoryId: product.category?._id ?? '',
        productTypeId: product.productType?._id ?? '',
        deityId: product.deityRef?._id ?? '',
        productId: product._id,
      }, { next: { revalidate: false, tags: ['sanity'] } }),
      [],
    ),
    safe(client.fetch<Product[]>(DIFFERENT_PRODUCTS_QUERY, { categoryId: product.category?._id ?? '', productId: product._id }, { next: { revalidate: false, tags: ['sanity'] } }), []),
    safe(client.fetch<Testimonial[]>(PRODUCT_REVIEWS_QUERY, { productId: product._id }, { next: { revalidate: false, tags: ['sanity'] } }), []),
    safe(client.fetch<SiteSettings | null>(SITE_SETTINGS_QUERY, {}, { next: { revalidate: false, tags: ['sanity'] } }), null),
  ]);
  const seed = seedFrom(product._id);
  relatedProducts = (relatedProducts ?? []).slice(0, 4);
  different = different ?? [];
  // Too few close matches: top up with popular picks so the section is never thin.
  if (relatedProducts.length < 4) {
    relatedProducts = [...relatedProducts, ...pickDiverse(different, 4 - relatedProducts.length, seed + 1)];
  }
  differentProducts = pickDiverse(different, 4, seed, relatedProducts.map((p) => p._id));

  return { product, relatedProducts, differentProducts, reviews: reviews ?? [], settings };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const data = await getData(slug);
  if (!data) notFound();

  const { product, relatedProducts, differentProducts, reviews, settings } = data;
  const averageRating = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://nikunjsakhi.com';
  const productUrl = `${siteUrl}/products/${product.slug.current}`;
  const categorySlug = product.category?.slug?.current;
  const typeSlug = product.productType?.slug?.current;
  const breadcrumbs = [
    { name: 'Home', href: '/' },
    { name: 'Shop', href: '/collections' },
    ...(categorySlug ? [{ name: product.category.name, href: `/collections/${categorySlug}` }] : []),
    ...(categorySlug && typeSlug && product.productType
      ? [{ name: product.productType.name, href: `/collections/${categorySlug}/${typeSlug}` }]
      : []),
  ];
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    sku: product.sku,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'INR',
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: productUrl,
    },
    image: product.images?.map((img) => img.asset?.url).filter(Boolean),
    brand: { '@type': 'Brand', name: 'Nikunj Sakhi' },
    ...(reviews.length > 0 && {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: averageRating, reviewCount: reviews.length },
    }),
  };
  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      ...breadcrumbs.map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: b.name,
        item: b.href === '/' ? siteUrl : `${siteUrl}${b.href}`,
      })),
      { '@type': 'ListItem', position: breadcrumbs.length + 1, name: product.name, item: productUrl },
    ],
  };
  // Escape '<' so CMS text containing </script> cannot break out of the JSON-LD block
  const toJsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <>
      {settings?.announcementActive && (
        <AnnouncementBar
          text={settings.announcement}
          whatsappNumber={settings.whatsappNumber}
          instagramHandle={settings.instagramHandle}
        />
      )}
      <Navbar settings={settings} />
      <CartSidebar />

      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbData) }}
      />

      <main className="min-h-screen bg-cream">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-[var(--border)] px-4 sm:px-6 lg:px-8 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
          <BackButton fallbackHref={breadcrumbs[breadcrumbs.length - 1]?.href ?? '/collections'} />
          <nav aria-label="Breadcrumb" className="min-w-0 flex flex-wrap items-center gap-2 font-cinzel text-[10px] tracking-widest uppercase">
            {breadcrumbs.map((b) => (
              <span key={b.href} className="flex items-center gap-2">
                <Link href={b.href} className="text-[var(--text-mid)] hover:text-gold transition-colors">{b.name}</Link>
                <span className="text-gold/50" aria-hidden="true">›</span>
              </span>
            ))}
            <span className="text-gold" aria-current="page">{product.name}</span>
          </nav>
          </div>
        </div>

        {/* Product Detail */}
        <ProductDetail product={product} settings={settings} />

        {/* Product Details · Care Instructions · Return Policy */}
        <section aria-label="Product information" className="py-12 px-4 sm:px-6 lg:px-8 bg-white border-t border-[var(--border)]">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Product Details */}
            <article className="border border-[var(--border)] bg-cream/40 flex flex-col">
              <h2 className="heading-highlight text-sm tracking-[0.15em] px-5 py-3">
                <ScrollText size={16} aria-hidden="true" /> Product Details
              </h2>
              <div className="p-5 flex-1">
                {product.description ? (
                  <div className="prose prose-sm max-w-none font-crimson text-[var(--text-mid)]">
                    <PortableText value={product.description as PortableTextBlock[]} />
                  </div>
                ) : (
                  product.shortDescription && (
                    <p className="font-crimson text-base text-[var(--text-mid)] leading-relaxed">{product.shortDescription}</p>
                  )
                )}
                {(product.material || product.weight || (product.specifications && product.specifications.length > 0)) && (
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    {product.material && (
                      <div className="flex flex-col border-b border-[var(--border)] pb-2">
                        <dt className="font-cinzel text-[10px] tracking-wider uppercase text-gold">Material</dt>
                        <dd className="font-crimson text-sm text-[var(--text-mid)] mt-0.5">{product.material}</dd>
                      </div>
                    )}
                    {product.weight && (
                      <div className="flex flex-col border-b border-[var(--border)] pb-2">
                        <dt className="font-cinzel text-[10px] tracking-wider uppercase text-gold">Weight</dt>
                        <dd className="font-crimson text-sm text-[var(--text-mid)] mt-0.5">{product.weight}g</dd>
                      </div>
                    )}
                    {product.specifications?.map((spec) => (
                      <div key={spec.key} className="flex flex-col border-b border-[var(--border)] pb-2">
                        <dt className="font-cinzel text-[10px] tracking-wider uppercase text-gold">{spec.key}</dt>
                        <dd className="font-crimson text-sm text-[var(--text-mid)] mt-0.5">{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {!product.description && !product.shortDescription && !product.material && !product.specifications?.length && (
                  <p className="font-crimson italic text-sm text-[var(--text-mid)]">Lovingly handcrafted for your deity seva.</p>
                )}
              </div>
            </article>

            {/* Care Instructions */}
            <article className="border border-[var(--border)] bg-cream/40 flex flex-col">
              <h2 className="heading-highlight text-sm tracking-[0.15em] px-5 py-3">
                <Sparkles size={16} aria-hidden="true" /> Care Instructions
              </h2>
              <div className="p-5 flex-1">
                <p className="font-crimson text-base text-[var(--text-mid)] leading-relaxed whitespace-pre-line">
                  {product.careInstructions ||
                    'Store in a clean, dry place away from moisture and direct sunlight. Handle gently and wipe with a soft dry cloth. Keep away from water, perfume and harsh chemicals.'}
                </p>
              </div>
            </article>

            {/* Return Policy */}
            <article className="border border-[var(--border)] bg-cream/40 flex flex-col">
              <h2 className="heading-highlight text-sm tracking-[0.15em] px-5 py-3">
                <RotateCcw size={16} aria-hidden="true" /> Return Policy
              </h2>
              <div className="p-5 flex-1 flex flex-col">
                <p className="font-crimson text-base text-[var(--text-mid)] leading-relaxed whitespace-pre-line flex-1">
                  {product.returnPolicy ||
                    'Easy returns within 7 days of delivery. Items must be unused and in original packaging. Damaged-in-transit items get a full refund or replacement. Customised items are non-returnable unless defective.'}
                </p>
                <Link
                  href="/policies/return"
                  className="mt-4 self-start font-cinzel text-[10px] tracking-widest uppercase text-gold-dark hover:text-gold underline underline-offset-4"
                >
                  Read full return policy →
                </Link>
              </div>
            </article>
          </div>
        </section>

        {/* Customer Reviews */}
        {reviews.length > 0 && (
          <section aria-labelledby="product-reviews" className="py-12 px-4 sm:px-6 lg:px-8 bg-white border-t border-[var(--border)]">
            <div className="max-w-3xl mx-auto">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-6 pb-3 border-b border-[var(--border)]">
                <h2 id="product-reviews" className="font-cinzel text-lg text-deep font-semibold">
                  Customer Reviews
                </h2>
                <p className="font-lato text-sm text-[var(--text-mid)]">
                  <span className="text-gold" aria-hidden="true">★</span>{' '}
                  <span className="font-semibold text-deep">{averageRating}</span> / 5 · {reviews.length}{' '}
                  {reviews.length === 1 ? 'review' : 'reviews'}
                </p>
              </div>
              <ul className="space-y-5">
                {reviews.map((r) => (
                  <li key={r._id} className="border-b border-[var(--border)] pb-5 last:border-0">
                    <p className="text-gold text-sm mb-1" role="img" aria-label={`${r.rating} out of 5 stars`}>
                      <span aria-hidden="true">{'★'.repeat(r.rating)}</span>
                      <span aria-hidden="true" className="text-gray-300">{'★'.repeat(5 - r.rating)}</span>
                    </p>
                    <p className="font-crimson text-base text-[var(--text-mid)] leading-relaxed">{r.review}</p>
                    <p className="mt-2 font-lato text-xs text-deep font-semibold">
                      {r.customerName}
                      {r.location && <span className="font-normal text-[var(--text-mid)]"> · {r.location}</span>}
                      {r.isVerified && <span className="ml-2 font-normal text-green-700">✓ Verified purchase</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream" aria-labelledby="related-heading">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-10">
                <span className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-2">
                  You May Also Like
                </span>
                <h2 id="related-heading" className="font-cinzel text-2xl font-semibold text-deep">
                  Related Products
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {relatedProducts.map((p, i) => (
                  <ProductCard key={p._id} product={p} index={i} inView />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Suggestions from other categories */}
        {differentProducts.length > 0 && (
          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white" aria-labelledby="different-heading">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-10">
                <span className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-2">
                  Explore Something Different
                </span>
                <h2 id="different-heading" className="font-cinzel text-2xl font-semibold text-deep">
                  Devotees Also Loved
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {differentProducts.map((p, i) => (
                  <ProductCard key={p._id} product={p} index={i} inView />
                ))}
              </div>
              <p className="mt-10 text-center">
                <Link href="/collections" className="font-cinzel text-[10px] tracking-widest uppercase text-gold-dark hover:text-deep">
                  View all collections →
                </Link>
              </p>
            </div>
          </section>
        )}
      </main>

      <Footer settings={settings} />
      <WhatsAppFloat
        number={settings?.whatsappNumber || '919999999999'}
        message={`Namaste! 🙏 I'm interested in "${product.name}". Please share more details.`}
      />
    </>
  );
}
