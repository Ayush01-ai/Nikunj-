import { Suspense } from 'react';
import { sanityFetch } from '@/cms/lib/sanityFetch';
import {
  HERO_SLIDES_QUERY,
  CATEGORIES_QUERY,
  FEATURED_PRODUCTS_QUERY,
  HOME_PRODUCTS_QUERY,
  BESTSELLERS_QUERY,
  NEW_ARRIVALS_QUERY,
  TESTIMONIALS_QUERY,
  SITE_SETTINGS_QUERY,
} from '@/cms/lib/queries';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { HeroSection } from '@/frontend/components/home/HeroSection';
import { AnnouncementBar } from '@/frontend/components/home/AnnouncementBar';
import { CategoryGrid } from '@/frontend/components/home/CategoryGrid';
import { FeaturedProducts } from '@/frontend/components/home/FeaturedProducts';
import { WhyUs } from '@/frontend/components/home/WhyUs';
import { AboutSection } from '@/frontend/components/home/AboutSection';
import { InstagramStrip } from '@/frontend/components/home/InstagramStrip';
import { FeedbackForm } from '@/frontend/components/home/FeedbackForm';
import { WhatsAppFloat } from '@/frontend/components/ui/WhatsAppFloat';
import { CartSidebar } from '@/frontend/components/cart/CartSidebar';
import type { HeroSlide, Category, Product, Testimonial, SiteSettings } from '@/types';

export const revalidate = 3600;

async function getHomeData() {
  const [heroSlides, categories, allProducts, featuredProducts, bestsellers, newArrivals, testimonials, settings] =
    await Promise.all([
      sanityFetch<HeroSlide[]>('home', HERO_SLIDES_QUERY),
      sanityFetch<Category[]>('home', CATEGORIES_QUERY),
      sanityFetch<Product[]>('home', HOME_PRODUCTS_QUERY),
      sanityFetch<Product[]>('home', FEATURED_PRODUCTS_QUERY),
      sanityFetch<Product[]>('home', BESTSELLERS_QUERY),
      sanityFetch<Product[]>('home', NEW_ARRIVALS_QUERY),
      sanityFetch<Testimonial[]>('home', TESTIMONIALS_QUERY),
      sanityFetch<SiteSettings>('home', SITE_SETTINGS_QUERY),
    ]);

  return { heroSlides, categories, allProducts, featuredProducts, bestsellers, newArrivals, testimonials, settings };
}

export default async function HomePage() {
  const { heroSlides, categories, allProducts, featuredProducts, bestsellers, newArrivals, testimonials, settings } =
    await getHomeData();

  const whatsappNumber = settings?.whatsappNumber || '919999999999';

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
        <HeroSection slides={heroSlides} settings={settings} />


        <CategoryGrid categories={categories} />
        <FeaturedProducts
          allProducts={allProducts}
          featured={featuredProducts}
          bestsellers={bestsellers}
          newArrivals={newArrivals}
        />
        {settings?.showWhyUs !== false && <WhyUs />}
        {settings?.showInstagram !== false && <InstagramStrip instagramHandle={settings?.instagramHandle} />}
        {(settings?.showReviews !== false || settings?.showFeedbackForm !== false) && (
          <FeedbackForm
            reviews={testimonials}
            showReviews={settings?.showReviews !== false}
            showForm={settings?.showFeedbackForm !== false}
          />
        )}
        <AboutSection />
      </main>

      <Footer settings={settings} />
      <WhatsAppFloat
        number={whatsappNumber}
        message="Namaste! 🙏 I'd like to know more about Nikunj Sakhi ornaments."
      />
    </>
  );
}
