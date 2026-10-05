'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Heart, ShoppingBag, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { urlFor } from '@/cms/lib/image';
import { useCartStore } from '@/frontend/store/cartStore';
import { useWishlistStore } from '@/frontend/store/wishlistStore';
import { ProductQuickModal } from '@/frontend/components/products/ProductQuickModal';
import { SacredPlaceholder } from '@/frontend/components/ui/SacredIcon';
import { getProductHref, needsChoice, toCartItem } from '@/frontend/lib/product';
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
  const wished = isWishlisted(product._id);

  const images = product.images || [];
  const primaryImage = images[0];
  const hoverImage = images[1] || images[0];

  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

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
          {primaryImage?.asset ? (
            <>
              {/* Primary image */}
              <Image
                src={urlFor(primaryImage).width(500).height(625).quality(80).url()}
                alt={primaryImage.alt || product.name}
                fill
                className={`object-cover transition-all duration-700 ${hovered && hoverImage !== primaryImage ? 'opacity-0' : 'opacity-100'}`}
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              />
              {/* Hover image */}
              {hoverImage && hoverImage !== primaryImage && (
                <Image
                  src={urlFor(hoverImage).width(500).height(625).quality(80).url()}
                  alt={hoverImage.alt || product.name}
                  fill
                  className={`object-cover transition-all duration-700 absolute inset-0 ${hovered ? 'opacity-100' : 'opacity-0'}`}
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                />
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
            className="absolute inset-x-0 bottom-0 bg-deep/80 backdrop-blur-sm py-3 flex items-center justify-center gap-2"
            initial={{ y: '100%' }}
            animate={{ y: hovered ? '0%' : '100%' }}
            transition={{ duration: 0.2 }}
          >
            <button
              onClick={(e) => { e.preventDefault(); setModalOpen(true); }}
              className="flex items-center gap-1.5 text-white font-cinzel text-[9px] tracking-widest uppercase hover:text-gold-light transition-colors cursor-pointer"
            >
              <Eye size={12} /> Quick View
            </button>
            <span className="text-white/30">|</span>
            <button
              onClick={handleAddToCart}
              className="flex items-center gap-1.5 text-white font-cinzel text-[9px] tracking-widest uppercase hover:text-gold-light transition-colors cursor-pointer"
            >
              <ShoppingBag size={12} /> Add to Cart
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
              ₹{product.price.toLocaleString('en-IN')}
            </span>
            {product.originalPrice && (
              <span className="text-xs text-gray-400 line-through">
                ₹{product.originalPrice.toLocaleString('en-IN')}
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
