'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Zap, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import SafeImage from '@/frontend/components/ui/SafeImage';
import { safeImageUrl, IMAGE_PLACEHOLDER } from '@/cms/lib/image';
import { useCartStore } from '@/frontend/store/cartStore';
import type { Product } from '@/types';
import { Button } from '@/frontend/components/ui/button';
import { SacredPlaceholder } from '@/frontend/components/ui/SacredIcon';
import { colourAtImage, colourImageIndex, getProductHref, productGallery, toCartItem } from '@/frontend/lib/product';
import { defaultVariant, getVariantPricing } from '@/cms/lib/pricing';
import { ColorSelector, PriceBlock, QuantitySelector, VariantSelector } from '@/frontend/components/products/ProductOptions';

interface ProductQuickModalProps {
  product: Product;
  onClose: () => void;
}

export function ProductQuickModal({ product, onClose }: ProductQuickModalProps) {
  const router = useRouter();
  const [selectedSize, setSelectedSize] = useState<string>(defaultVariant(product)?.label || '');
  const [selectedColor, setSelectedColor] = useState<string>(product.colors?.[0]?.label || '');
  const [quantity, setQuantity] = useState(1);
  const images = useMemo(() => productGallery(product), [product]);
  const [currentImg, setCurrentImgRaw] = useState(() => Math.max(0, colourImageIndex(images, product, product.colors?.[0]?.label)));
  const { addItem } = useCartStore();

  const pricing = getVariantPricing(product, selectedSize || undefined, selectedColor || undefined);

  const setCurrentImg = (next: number | ((p: number) => number)) => {
    const index = typeof next === 'function' ? next(currentImg) : next;
    setCurrentImgRaw(index);
    const colour = colourAtImage(images, product, index);
    if (colour) setSelectedColor(colour);
  };

  const selectColour = (label: string) => {
    setSelectedColor(label);
    const index = colourImageIndex(images, product, label);
    if (index >= 0) setCurrentImgRaw(index);
    setQuantity((q) => Math.max(1, Math.min(q, getVariantPricing(product, selectedSize || undefined, label).stock || 1)));
  };
  const outOfStock = pricing.stock <= 0;

  const selectSize = (label: string) => {
    setSelectedSize(label);
    setQuantity((q) => Math.max(1, Math.min(q, getVariantPricing(product, label, selectedColor || undefined).stock || 1)));
  };

  const addToCart = useCallback(() => {
    if (outOfStock) return false;
    addItem(toCartItem(product, { size: selectedSize, color: selectedColor, quantity }));
    return true;
  }, [product, selectedSize, selectedColor, quantity, addItem, outOfStock]);

  const handleAddToCart = () => {
    if (!addToCart()) return;
    toast.success(`${product.name} added to cart 🙏`);
    onClose();
  };

  const handleBuyNow = () => {
    if (!addToCart()) return;
    onClose();
    router.push('/checkout');
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto relative"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close quick view"
            className="absolute top-4 right-4 z-10 w-8 h-8 bg-cream flex items-center justify-center text-[var(--text-mid)] hover:text-gold transition-colors"
          >
            <X size={16} />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Image Gallery */}
            <div className="relative aspect-square bg-cream">
              {images[currentImg]?.asset ? (
                <SafeImage
                  src={safeImageUrl(images[currentImg], 600, 600, 85) || IMAGE_PLACEHOLDER}
                  alt={images[currentImg].alt || product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <SacredPlaceholder size={56} label={product.deity || product.name} className="absolute inset-0 bg-cream" />
              )}

              {/* Nav arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImg((p) => (p === 0 ? images.length - 1 : p - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 flex items-center justify-center hover:bg-white transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentImg((p) => (p === images.length - 1 ? 0 : p + 1))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 flex items-center justify-center hover:bg-white transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentImg(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentImg ? 'bg-gold w-4' : 'bg-white/60'}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="p-6 flex flex-col">
              <p className="font-cinzel text-[9px] tracking-[0.3em] uppercase text-gold mb-2">
                {product.deity}
              </p>
              <h2 className="font-crimson text-2xl font-semibold text-deep mb-3 leading-tight">
                {product.name}
              </h2>

              {/* Price */}
              <PriceBlock price={pricing.price} mrp={pricing.mrp} discount={pricing.discount} quantity={quantity} size="sm" />

              {product.shortDescription && (
                <p className="text-sm text-[var(--text-mid)] mb-5 leading-relaxed">
                  {product.shortDescription}
                </p>
              )}

              <VariantSelector product={product} value={selectedSize} onChange={selectSize} size="sm" />
              <ColorSelector colors={product.colors} value={selectedColor} onChange={selectColour} size="sm" />

              <div className="mb-6">
                <QuantitySelector value={quantity} max={pricing.stock} onChange={setQuantity} size="sm" />
                {outOfStock && <p className="mt-2 text-xs text-red-500 font-cinzel tracking-wider">✗ Out of Stock</p>}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 mt-auto">
                <button onClick={handleAddToCart} disabled={outOfStock} className="btn-outline-gold w-full disabled:opacity-40 disabled:cursor-not-allowed">
                  <ShoppingBag size={14} /> Add to Cart
                </button>
                <Button onClick={handleBuyNow} disabled={outOfStock} className="w-full">
                  <Zap size={14} /> Buy Now
                </Button>
                <Link
                  href={getProductHref(product)}
                  onClick={onClose}
                  className="flex items-center justify-center gap-1.5 font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] hover:text-gold transition-colors py-1"
                >
                  View Full Details <ExternalLink size={12} />
                </Link>
              </div>

              {/* Trust row */}
              <div className="flex justify-around mt-5 pt-4 border-t border-[var(--border)]">
                {['🔒 Secure', '🚚 Fast Delivery', '✨ Authentic'].map((t) => (
                  <span key={t} className="font-cinzel text-[9px] tracking-wider text-[var(--text-mid)] uppercase">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
