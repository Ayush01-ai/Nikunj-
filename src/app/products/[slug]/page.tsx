import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { client } from '@/cms/lib/client';
import {
  PRODUCT_BY_SLUG_QUERY,
  RELATED_PRODUCTS_QUERY,
  PRODUCT_REVIEWS_QUERY,
  ALL_PRODUCT_SLUGS_QUERY,
  SITE_SETTINGS_QUERY,
} from '@/cms/lib/queries';
import { urlFor } from '@/cms/lib/image';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { AnnouncementBar } from '@/frontend/components/home/AnnouncementBar';
import { ProductDetail } from '@/frontend/components/products/ProductDetail';
import { ProductCard } from '@/frontend/components/products/ProductCard';
import { CartSidebar } from '@/frontend/components/cart/CartSidebar';
import { WhatsAppFloat } from '@/frontend/components/ui/WhatsAppFloat';
import { PortableText } from '@portabletext/react';
import type { Product, SiteSettings, Testimonial } from '@/types';

export const revalidate = 60;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  try {
    const slugs = await client.fetch<{ slug: string }[]>(ALL_PRODUCT_SLUGS_QUERY);
    return slugs.map(({ slug }) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await client.fetch<Product>(PRODUCT_BY_SLUG_QUERY, { slug });
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
  let product: Product | null = null;
  try {
    product = await client.fetch<Product>(PRODUCT_BY_SLUG_QUERY, { slug });
  } catch { return null; }
  if (!product) return null;

  let relatedProducts: Product[] = [];
  let reviews: Testimonial[] = [];
  let settings: SiteSettings | null = null;
  try {
    [relatedProducts, reviews, settings] = await Promise.all([
      client.fetch<Product[]>(RELATED_PRODUCTS_QUERY, {
        categoryId: product.category._id,
        productId: product._id,
      }),
      client.fetch<Testimonial[]>(PRODUCT_REVIEWS_QUERY, { productId: product._id }),
      client.fetch<SiteSettings>(SITE_SETTINGS_QUERY),
    ]);
  } catch { /* use empty defaults */ }

  return { product, relatedProducts, reviews, settings };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const data = await getData(slug);
  if (!data) notFound();

  const { product, relatedProducts, reviews, settings } = data;
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
          <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto flex flex-wrap items-center gap-2 font-cinzel text-[10px] tracking-widest uppercase">
            {breadcrumbs.map((b) => (
              <span key={b.href} className="flex items-center gap-2">
                <Link href={b.href} className="text-[var(--text-mid)] hover:text-gold transition-colors">{b.name}</Link>
                <span className="text-gold/50" aria-hidden="true">›</span>
              </span>
            ))}
            <span className="text-gold" aria-current="page">{product.name}</span>
          </nav>
        </div>

        {/* Product Detail */}
        <ProductDetail product={product} settings={settings} />

        {/* Product Description */}
        {product.description && (
          <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white border-t border-[var(--border)]">
            <div className="max-w-3xl mx-auto">
              <h2 className="font-cinzel text-lg text-deep font-semibold mb-6 pb-3 border-b border-[var(--border)]">
                Product Details
              </h2>
              <div className="prose prose-sm max-w-none font-crimson text-[var(--text-mid)]">
                <PortableText value={product.description as any} />
              </div>

              {/* Specifications */}
              {product.specifications && product.specifications.length > 0 && (
                <div className="mt-8">
                  <h3 className="font-cinzel text-sm text-deep font-semibold mb-4">Specifications</h3>
                  <dl className="grid grid-cols-2 gap-2">
                    {product.specifications.map((spec) => (
                      <div key={spec.key} className="flex flex-col border-b border-[var(--border)] pb-2">
                        <dt className="font-cinzel text-[10px] tracking-wider uppercase text-gold text-xs">{spec.key}</dt>
                        <dd className="font-crimson text-sm text-[var(--text-mid)] mt-0.5">{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* Care Instructions */}
              {product.careInstructions && (
                <div className="mt-8 bg-cream p-5 border-l-4 border-gold">
                  <h3 className="font-cinzel text-sm text-deep font-semibold mb-2">Care Instructions</h3>
                  <p className="font-crimson text-sm text-[var(--text-mid)]">{product.careInstructions}</p>
                </div>
              )}
            </div>
          </section>
        )}

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
                    <p className="text-gold text-sm mb-1" aria-label={`${r.rating} out of 5 stars`}>
                      {'★'.repeat(r.rating)}
                      <span className="text-gray-300">{'★'.repeat(5 - r.rating)}</span>
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
          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-10">
                <span className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-2">
                  You May Also Like
                </span>
                <h2 className="font-cinzel text-2xl font-semibold text-deep">
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
      </main>

      <Footer settings={settings} />
      <WhatsAppFloat
        number={settings?.whatsappNumber || '919999999999'}
        message={`Namaste! 🙏 I'm interested in "${product.name}". Please share more details.`}
      />
    </>
  );
}
