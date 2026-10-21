'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Heart, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import SafeImage from '@/frontend/components/ui/SafeImage';
import { safeImageUrl, IMAGE_PLACEHOLDER } from '@/cms/lib/image';
import { useCartStore } from '@/frontend/store/cartStore';
import { useWishlistStore, useWishlistHydrated } from '@/frontend/store/wishlistStore';
import { ProductQuickModal } from '@/frontend/components/products/ProductQuickModal';
import { SacredPlaceholder } from '@/frontend/components/ui/SacredIcon';
import { getProductHref, needsChoice, toCartItem } from '@/frontend/lib/product';
import { lowestPricing } from '@/cms/lib/pricing';
import type { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  index?: number;
  inView?: boolean;
}

export function ProductCard({ product, index = 0, inView = true }: ProductCardProps) {
  const [hovered, setHovered] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { addItem } = useCartStore();
  const { toggleWishlist, isWishlisted } = useWishlistStore();
  const wishlistReady = useWishlistHydrated();
  const wished = wishlistReady && isWishlisted(product._id);

  const images = React.useMemo(() => {
    const seen = new Set<string>();
    return [...(product.images || []), ...(product.colors || []).map((c) => c.image)]
      .filter((img): img is NonNullable<typeof img> => !!img?.asset)
      .filter((img) => {
        const key = img.asset._id || img.asset.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [product.images, product.colors]);
  const [imgIndex, setImgIndex] = useState(0);
  const activeImage = images[imgIndex] || images[0];
  const hasMany = images.length > 1;

  const stepImage = (e: React.MouseEvent, dir: 1 | -1) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex((i) => (i + dir + images.length) % images.length);
  };

  const pricing = lowestPricing(product);
  const discount = pricing.discount;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (needsChoice(product)) {
      setModalOpen(true);
      return;
    }
    addItem(toCartItem(product));
    toast.success(`${product.name} added to cart 🙏`);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product._id);
    toast.success(wished ? 'Removed from wishlist' : 'Added to wishlist ❤️');
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: (index % 8) * 0.07 }}
        className="group relative bg-white border border-[var(--border)] overflow-hidden hover:-translate-y-1.5 hover:shadow-divine transition-all duration-300"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Image */}
        <Link href={getProductHref(product)} className="block relative overflow-hidden product-image-ratio bg-cream">
          {activeImage ? (
            <>
              {images.map((img, i) => (
                <SafeImage
                  key={img.asset?._id || i}
                  src={safeImageUrl(img, 500, 625) || IMAGE_PLACEHOLDER}
                  alt={img.alt || product.name}
                  fill
                  loading={i === 0 ? undefined : 'lazy'}
                  className={`object-cover transition-opacity duration-500 ${i === imgIndex ? 'opacity-100' : 'opacity-0'}`}
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                />
              ))}

              {hasMany && (
                <>
                  <button
                    type="button"
                    onClick={(e) => stepImage(e, -1)}
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-[2] w-8 h-8 rounded-full bg-white/90 text-deep shadow-xs flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-gold hover:text-white transition-all cursor-pointer focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gold/50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => stepImage(e, 1)}
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-[2] w-8 h-8 rounded-full bg-white/90 text-deep shadow-xs flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-gold hover:text-white transition-all cursor-pointer focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gold/50"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <div className={`absolute left-1/2 -translate-x-1/2 z-[2] flex gap-1.5 transition-all duration-200 ${hovered ? 'bottom-12' : 'bottom-2.5'}`} aria-hidden="true">
                    {images.map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${i === imgIndex ? 'w-4 bg-gold' : 'w-1.5 bg-white/80'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <SacredPlaceholder
              label={product.deity || product.name}
              className="absolute inset-0 bg-gradient-to-br from-cream to-cream-200"
            />
          )}

          {/* Badges */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
            {product.isNewArrival && (
              <span className="bg-teal text-white text-[9px] font-cinzel tracking-wider px-2 py-0.5">
                NEW
              </span>
            )}
            {product.isBestseller && (
              <span className="bg-gold text-white text-[9px] font-cinzel tracking-wider px-2 py-0.5">
                BESTSELLER
              </span>
            )}
            {discount > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-cinzel tracking-wider px-2 py-0.5">
                -{discount}%
              </span>
            )}
          </div>

          {/* Wishlist */}
          <button
            onClick={handleWishlist}
            aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
            className={`
              absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center
              transition-all duration-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100
              ${wished ? 'text-red-500' : 'text-[var(--text-mid)]'}
              hover:scale-110 cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-gold/50
            `}
          >
            <Heart size={14} fill={wished ? 'currentColor' : 'none'} />
          </button>

          {/* Quick view overlay */}
          <motion.div
            className="absolute inset-x-0 bottom-0 z-[3] bg-deep/80 backdrop-blur-sm py-3 flex items-center justify-center"
            initial={{ y: '100%' }}
            animate={{ y: hovered ? '0%' : '100%' }}
            transition={{ duration: 0.2 }}
          >
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setModalOpen(true); }}
              className="flex items-center gap-1.5 text-white font-cinzel text-[9px] tracking-widest uppercase hover:text-gold-light transition-colors cursor-pointer"
            >
              <Eye size={12} /> Quick View
            </button>
          </motion.div>
        </Link>

        {/* Info */}
        <div className="p-4">
          <p className="font-cinzel text-[9px] tracking-[0.2em] uppercase text-gold mb-1 font-semibold">
            {product.deity}
          </p>
          <Link href={getProductHref(product)}>
            <h3 className="font-crimson text-base font-semibold text-deep leading-snug mb-2 hover:text-gold-dark transition-colors line-clamp-2">
              {product.name}
            </h3>
          </Link>
          {product.shortDescription && (
            <p className="text-[11px] text-[var(--text-mid)] leading-relaxed mb-3 line-clamp-2">
              {product.shortDescription}
            </p>
          )}

          {/* Price */}
          <div className="flex items-center gap-2 mb-3">
            <span className="font-cinzel text-sm sm:text-base font-bold text-gold-dark tracking-wide">
              {pricing.hasRange && <span className="text-[10px] font-normal text-[var(--text-mid)] mr-1">From</span>}
              ₹{pricing.price.toLocaleString('en-IN')}
            </span>
            {pricing.mrp && pricing.mrp > pricing.price && (
              <span className="text-xs text-gray-400 line-through">
                ₹{pricing.mrp.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleAddToCart}
              aria-label={`Add ${product.name} to cart`}
              className="flex-1 bg-transparent text-gold-dark border border-gold font-cinzel text-[9px] tracking-widest uppercase py-2.5 hover:bg-gold hover:text-white transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              Add to Cart
            </button>
            <Link
              href={getProductHref(product)}
              aria-label={`View details for ${product.name}`}
              className="flex-1 bg-gold text-white font-cinzel text-[9px] tracking-widest uppercase py-2.5 text-center hover:bg-gold-dark transition-colors flex items-center justify-center cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              View Details
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Quick Modal */}
      {modalOpen && (
        <ProductQuickModal
          product={product}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
