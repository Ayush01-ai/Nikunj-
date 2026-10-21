'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Heart, ShoppingBag, Trash2, Zap } from 'lucide-react';
import { useWishlistStore, useWishlistHydrated } from '@/frontend/store/wishlistStore';
import { useCartStore } from '@/frontend/store/cartStore';
import { client } from '@/cms/lib/client';
import SafeImage from '@/frontend/components/ui/SafeImage';
import { safeImageUrl, IMAGE_PLACEHOLDER } from '@/cms/lib/image';
import { WISHLIST_PRODUCTS_QUERY } from '@/cms/lib/queries';
import { getProductHref, needsChoice, toCartItem } from '@/frontend/lib/product';
import { formatINR, lowestPricing } from '@/cms/lib/pricing';
import { ProductQuickModal } from '@/frontend/components/products/ProductQuickModal';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { BackButton } from '@/frontend/components/ui/BackButton';
import { Footer } from '@/frontend/components/layout/Footer';
import { SacredPlaceholder } from '@/frontend/components/ui/SacredIcon';
import type { Product } from '@/types';
import toast from 'react-hot-toast';

export default function WishlistPage() {
  const { ids, toggleWishlist } = useWishlistStore();
  const hydrated = useWishlistHydrated();
  const router = useRouter();
  const { addItem } = useCartStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickView, setQuickView] = useState<Product | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (ids.length === 0) { setLoading(false); setProducts([]); return; }
    setLoading(true);
    client.fetch<Product[]>(WISHLIST_PRODUCTS_QUERY, { ids })
      .then(setProducts)
      .finally(() => setLoading(false));
  }, [ids, hydrated]);

  // Products with options open the same quick view used on the shop pages.
  const handleAddToCart = (product: Product, buyNow = false) => {
    if (needsChoice(product)) {
      setQuickView(product);
      return;
    }
    if ((product.stock ?? 0) <= 0) {
      toast.error('Sorry, this item is out of stock');
      return;
    }
    addItem(toCartItem(product));
    if (buyNow) {
      router.push('/checkout');
      return;
    }
    toast.success('Added to cart 🙏');
  };

  return (
    <>
      <Navbar settings={null} />
      <div className="min-h-screen bg-cream">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <BackButton fallbackHref="/collections" className="mb-6" />
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Heart size={22} className="text-gold" />
          <h1 className="font-cinzel text-2xl font-semibold text-deep">
            My Wishlist
            {ids.length > 0 && (
              <span className="ml-3 font-lato text-sm font-normal text-[var(--text-mid)]">
                ({ids.length} item{ids.length !== 1 ? 's' : ''})
              </span>
            )}
          </h1>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton aspect-[4/5] rounded" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <Heart size={48} className="text-gold/20 mx-auto mb-4" />
            <h2 className="font-cinzel text-lg text-deep mb-2">Your wishlist is empty</h2>
            <p className="font-crimson italic text-[var(--text-mid)] mb-6">
              Save your favorite divine ornaments here
            </p>
            <Link href="/collections" className="btn-gold">Explore Products</Link>
          </div>
        ) : (
          <AnimatePresence>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((product) => (
                <motion.div
                  key={product._id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white border border-[var(--border)] group relative"
                >
                  {/* Image */}
                  <Link href={getProductHref(product)} className="block">
                    <div className="product-image-ratio relative bg-cream overflow-hidden">
                      {product.images?.[0]?.asset ? (
                        <SafeImage
                          src={safeImageUrl(product.images[0], 400, 500) || IMAGE_PLACEHOLDER}
                          alt={product.name}
                          fill
                          sizes="(max-width: 768px) 50vw, 25vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <SacredPlaceholder size={36} label={product.deity || product.name} className="absolute inset-0 bg-cream" />
                      )}
                    </div>
                  </Link>

                  {/* Quick view */}
                  <button
                    onClick={() => setQuickView(product)}
                    className="absolute top-2 left-2 w-8 h-8 bg-white/90 flex items-center justify-center text-deep hover:bg-gold hover:text-white transition-colors"
                    aria-label={`Quick view ${product.name}`}
                  >
                    <Eye size={14} />
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => toggleWishlist(product._id)}
                    className="absolute top-2 right-2 w-8 h-8 bg-white/90 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                    aria-label="Remove from wishlist"
                  >
                    <Trash2 size={14} />
                  </button>

                  {/* Info */}
                  <div className="p-3">
                    <p className="font-cinzel text-[9px] tracking-widest uppercase text-gold mb-1">{product.deity}</p>
                    <Link href={getProductHref(product)} className="font-crimson text-sm font-semibold text-deep line-clamp-2 hover:text-gold transition-colors block mb-2">
                      {product.name}
                    </Link>
                    <div className="flex items-center gap-2 mb-3">
                      {(() => {
                        const lp = lowestPricing(product);
                        return (
                          <>
                            <span className="font-cinzel text-sm font-bold text-gold-dark">
                              {lp.hasRange ? 'From ' : ''}{formatINR(lp.price)}
                            </span>
                            {lp.mrp && (
                              <span className="font-lato text-[10px] text-[var(--text-mid)] line-through">{formatINR(lp.mrp)}</span>
                            )}
                            {lp.discount > 0 && (
                              <span className="font-cinzel text-[9px] text-red-600 font-semibold">{lp.discount}% OFF</span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleAddToCart(product)}
                        className="w-full btn-outline-gold !bg-cream !text-[10px] !py-2 !px-2 !font-semibold flex items-center justify-center gap-1.5"
                      >
                        <ShoppingBag size={12} /> {needsChoice(product) ? 'Choose & Add' : 'Add to Cart'}
                      </button>
                      <button
                        onClick={() => handleAddToCart(product, true)}
                        className="w-full btn-gold !text-[10px] !py-2 !px-2 flex items-center justify-center gap-1.5"
                      >
                        <Zap size={12} /> Buy Now
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
      </div>
      {quickView && <ProductQuickModal product={quickView} onClose={() => setQuickView(null)} />}
      <Footer settings={null} />
    </>
  );
}
