'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Zap, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { urlFor } from '@/cms/lib/image';
import { useCartStore } from '@/frontend/store/cartStore';
import type { Product } from '@/types';
import { Button } from '@/frontend/components/ui/button';
import { SacredPlaceholder } from '@/frontend/components/ui/SacredIcon';
import { toCartItem } from '@/frontend/lib/product';

interface ProductQuickModalProps {
  product: Product;
  onClose: () => void;
}

export function ProductQuickModal({ product, onClose }: ProductQuickModalProps) {
  const [selectedSize, setSelectedSize] = useState<string>(product.sizes?.[0]?.label || '');
  const [selectedColor, setSelectedColor] = useState<string>(product.colors?.[0]?.label || '');
  const [quantity, setQuantity] = useState(1);
  const [currentImg, setCurrentImg] = useState(0);
  const { addItem } = useCartStore();

  const images = product.images || [];
  const currentPrice = product.price + (product.sizes?.find(s => s.label === selectedSize)?.priceModifier || 0);

  const handleAddToCart = useCallback(() => {
    addItem(toCartItem(product, { size: selectedSize, color: selectedColor, quantity }));
    toast.success(`${product.name} added to cart 🙏`);
    onClose();
  }, [product, selectedSize, selectedColor, quantity, addItem, onClose]);

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
            className="absolute top-4 right-4 z-10 w-8 h-8 bg-cream flex items-center justify-center text-[var(--text-mid)] hover:text-gold transition-colors"
          >
            <X size={16} />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Image Gallery */}
            <div className="relative aspect-square bg-cream">
              {images[currentImg]?.asset ? (
                <Image
                  src={urlFor(images[currentImg]).width(600).height(600).quality(85).url()}
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
              <div className="flex items-center gap-3 mb-5">
                <span className="font-cinzel text-xl font-bold text-gold-dark">
                  ₹{currentPrice.toLocaleString('en-IN')}
                </span>
                {product.originalPrice && (
                  <span className="text-sm text-gray-400 line-through">
                    ₹{product.originalPrice.toLocaleString('en-IN')}
                  </span>
                )}
              </div>

              {product.shortDescription && (
                <p className="text-sm text-[var(--text-mid)] mb-5 leading-relaxed">
                  {product.shortDescription}
                </p>
              )}

              {/* Size Selector */}
              {product.sizes && product.sizes.length > 0 && (
                <div className="mb-4">
                  <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-2">
                    Size
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {product.sizes.map((size) => (
                      <button
                        key={size.label}
                        onClick={() => setSelectedSize(size.label)}
                        className={`
                          px-3 py-1.5 border font-cinzel text-[10px] tracking-wider uppercase transition-all
                          ${selectedSize === size.label
                            ? 'bg-gold border-gold text-white'
                            : 'bg-white border-[var(--border)] text-[var(--text-mid)] hover:border-gold'
                          }
                          ${size.stock === 0 ? 'opacity-40 cursor-not-allowed line-through' : ''}
                        `}
                        disabled={size.stock === 0}
                      >
                        {size.label}
                        {size.priceModifier !== 0 && (
                          <span className="ml-1 text-[8px]">
                            {size.priceModifier > 0 ? '+' : ''}₹{size.priceModifier}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Color Selector */}
              {product.colors && product.colors.length > 0 && (
                <div className="mb-4">
                  <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-2">
                    Color: <span className="text-gold">{selectedColor}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((color) => (
                      <button
                        key={color.label}
                        onClick={() => setSelectedColor(color.label)}
                        title={color.label}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          selectedColor === color.label ? 'border-gold scale-110' : 'border-transparent'
                        }`}
                        style={{ background: color.hex }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div className="mb-6">
                <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-2">
                  Quantity
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 border border-[var(--border)] flex items-center justify-center hover:bg-gold hover:border-gold hover:text-white transition-all"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="font-cinzel text-sm w-8 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                    className="w-9 h-9 border border-[var(--border)] flex items-center justify-center hover:bg-gold hover:border-gold hover:text-white transition-all"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-[11px] text-[var(--text-mid)]">
                    {product.stock} available
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 mt-auto">
                <button onClick={handleAddToCart} className="btn-outline-gold w-full">
                  <ShoppingBag size={14} /> Add to Cart
                </button>
                <Button
                  onClick={() => {
                    handleAddToCart();
                    window.location.href = '/checkout';
                  }}
                  className="w-full"
                >
                  <Zap size={14} /> Buy Now
                </Button>
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
