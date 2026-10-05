'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Eye, Heart, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';
import { getImageUrl } from '@/cms/lib/image';
import { useCartStore } from '@/frontend/store/cartStore';
import { useWishlistStore } from '@/frontend/store/wishlistStore';
import { ProductQuickModal } from '@/frontend/components/products/ProductQuickModal';
import { getProductHref, needsChoice, toCartItem } from '@/frontend/lib/product';
import type { Product } from '@/types';

interface CoverFlowCarouselProps {
  products: Product[];
  sectionLabel?: string;
  autoplay?: boolean;
  autoplayDelay?: number;
}

export function CoverFlowCarousel({
  products,
  sectionLabel = 'Featured Collection',
  autoplay = true,
  autoplayDelay = 5000,
}: CoverFlowCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const touchStartX = useRef(0);
  const router = useRouter();
  const { addItem, openCart } = useCartStore();
  const { toggleWishlist, isWishlisted } = useWishlistStore();
  const total = products.length;

  const nextSlide = useCallback(() => setCurrentIndex((index) => (index + 1) % total), [total]);
  const prevSlide = useCallback(() => setCurrentIndex((index) => (index - 1 + total) % total), [total]);

  useEffect(() => {
    if (!autoplay || isHovered || total <= 1) return;
    const interval = window.setInterval(nextSlide, autoplayDelay);
    return () => window.clearInterval(interval);
  }, [autoplay, autoplayDelay, isHovered, nextSlide, total]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') prevSlide();
      if (event.key === 'ArrowRight') nextSlide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nextSlide, prevSlide]);

  if (!total) return null;

  const currentProduct = products[currentIndex];
  const backgroundImage = currentProduct.images?.[0]?.asset
    ? getImageUrl(currentProduct.images[0], { width: 1600, quality: 70 })
    : undefined;

  const addToCart = (product: Product) => {
    if (!product.stock || product.inStock === false) {
      toast.error('This item is currently out of stock.');
      return;
    }
    if (needsChoice(product)) {
      setQuickViewProduct(product);
      return;
    }
    const image = product.images?.[0]?.asset ? getImageUrl(product.images[0], { width: 500, quality: 80 }) : '';
    addItem(toCartItem(product, { image }));
    openCart();
    toast.success(`${product.name} added to cart`);
  };

  return (
    <section
      aria-label={sectionLabel}
      className="relative isolate min-h-[700px] overflow-hidden bg-deep py-14 text-white sm:min-h-[760px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
      onTouchEnd={(event) => {
        const difference = event.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(difference) > 45) difference < 0 ? nextSlide() : prevSlide();
      }}
    >
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {backgroundImage && <img src={backgroundImage} alt="" className="h-full w-full scale-110 object-cover opacity-40 blur-3xl" />}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(69,54,25,0.38),rgba(25,20,18,0.96)_72%)]" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4">
        <div className="relative flex h-[500px] w-full items-center justify-center [perspective:1400px] sm:h-[520px]">
          {products.map((product, index) => {
            const offset = (index - currentIndex + total) % total;
            const isCenter = offset === 0;
            // The active item must always stay in the centre. Without this explicit
            // branch, the first item in a 3+ product carousel was positioned off-screen.
            const side = isCenter ? 0 : offset === 1 ? 1 : offset === total - 1 ? -1 : offset === 2 ? 2 : offset === total - 2 ? -2 : 3;
            const image = product.images?.[0]?.asset ? getImageUrl(product.images[0], { width: 700, height: 1000 }) : '';
            const wished = isWishlisted(product._id);
            const visible = Math.abs(side) <= 2;

            return (
              <article
                key={product._id}
                onClick={() => isCenter ? router.push(getProductHref(product)) : setCurrentIndex(index)}
                className={`absolute h-[455px] w-[280px] overflow-hidden rounded-2xl border border-white/20 bg-stone-900 transition-all duration-700 ease-out sm:h-[500px] sm:w-[330px] cursor-pointer`}
                style={{
                  transform: `translateX(${side * (Math.abs(side) === 1 ? 104 : 180)}%) scale(${isCenter ? 1 : Math.abs(side) === 1 ? 0.86 : 0.72}) rotateY(${side * -15}deg)`,
                  opacity: visible ? (isCenter ? 1 : Math.abs(side) === 1 ? 0.9 : 0.5) : 0,
                  zIndex: isCenter ? 30 : Math.abs(side) === 1 ? 20 : 10,
                  filter: isCenter ? 'brightness(1)' : 'brightness(.9)',
                  boxShadow: isCenter ? '0 25px 60px rgba(0,0,0,.8), 0 0 35px rgba(201,164,89,.25)' : '0 15px 35px rgba(0,0,0,.45)',
                }}
              >
                {image ? <img src={image} alt={product.images[0]?.alt || product.name} className="absolute inset-0 h-full w-full object-cover object-center" /> : <div className="absolute inset-0 bg-gradient-to-br from-gold-dark to-deep" />}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90" />

                {!isCenter && visible && (
                  <div className="absolute inset-x-0 bottom-0 px-4 pb-5 text-center">
                    <p className="truncate font-cinzel text-sm font-semibold text-white">{product.name}</p>
                    <p className="font-cinzel text-xs text-gold-light">₹{product.price.toLocaleString('en-IN')}</p>
                  </div>
                )}

                <div className={`relative flex h-full flex-col justify-between p-5 text-center transition-all duration-500 ${isCenter ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
                  <div className="flex items-center justify-between text-xs font-cinzel tracking-wider text-white/90">
                    <span className="rounded-full bg-black/70 px-3 py-1 backdrop-blur-sm">{product.isBestseller ? 'Bestseller' : product.isNewArrival ? 'New arrival' : product.deity || 'Divine ornament'}</span>
                    <button
                      onClick={(event) => { event.stopPropagation(); toggleWishlist(product._id); toast.success(wished ? 'Removed from wishlist' : 'Added to wishlist'); }}
                      aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
                      className={`rounded-full border border-white/20 bg-black/45 p-2.5 backdrop-blur-sm transition hover:border-gold hover:bg-black/65 ${wished ? 'text-red-400' : 'text-white'}`}
                    >
                      <Heart size={16} fill={wished ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  <div className="-mx-5 -mb-5 bg-gradient-to-t from-black/90 via-black/75 to-transparent px-5 pb-5 pt-10">
                    <p className="mb-1 font-cinzel text-xs font-semibold tracking-wider text-gold-light">{product.category?.name || 'Sacred collection'}</p>
                    <h2 className="font-cinzel text-xl font-semibold leading-tight text-white">{product.name}</h2>
                    <p className="mb-4 mt-1 font-cinzel text-lg font-bold text-gold-light">₹{product.price.toLocaleString('en-IN')}</p>
                    <div className="flex gap-2">
                      <button onClick={(event) => { event.stopPropagation(); addToCart(product); }} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 bg-gold-dark px-3 text-xs font-cinzel font-semibold tracking-wider text-white transition hover:bg-gold-800 shadow-sm">
                        <ShoppingBag size={14} /> Add to cart
                      </button>
                      <Link
                        href={getProductHref(product)}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 border border-gold bg-black/70 px-3 text-xs font-cinzel font-semibold tracking-wider text-gold-light transition hover:bg-gold-dark hover:text-white shadow-sm"
                      >
                        <Eye size={14} /> View details
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button onClick={prevSlide} aria-label="Previous product" className="rounded-full border border-gold/70 bg-gold-dark/30 p-3 text-gold-light transition-colors hover:bg-gold-dark hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"><ChevronLeft size={20} /></button>
          <div className="flex">
          {products.map((product, index) => (
            <button
              key={product._id}
              onClick={() => setCurrentIndex(index)}
              aria-label={`Show ${product.name}`}
              aria-current={index === currentIndex ? 'true' : undefined}
              className="group flex h-6 min-w-6 items-center justify-center px-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <span aria-hidden="true" className={`block h-2 rounded-full transition-all ${index === currentIndex ? 'w-7 bg-gold' : 'w-2 bg-white/30 group-hover:bg-white/60'}`} />
            </button>
          ))}
          </div>
          <button onClick={nextSlide} aria-label="Next product" className="rounded-full border border-gold/70 bg-gold-dark/30 p-3 text-gold-light transition-colors hover:bg-gold-dark hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"><ChevronRight size={20} /></button>
        </div>
      </div>
      {quickViewProduct && <ProductQuickModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />}
    </section>
  );
}
