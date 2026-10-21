'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Zap, Heart, Share2, ChevronLeft, ChevronRight, ZoomIn, Check, Truck, Shield, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { safeImageUrl, IMAGE_PLACEHOLDER } from '@/cms/lib/image';
import { useCartStore } from '@/frontend/store/cartStore';
import { useWishlistStore, useWishlistHydrated } from '@/frontend/store/wishlistStore';
import { Button } from '@/frontend/components/ui/button';
import { SacredPlaceholder } from '@/frontend/components/ui/SacredIcon';
import { colourAtImage, colourImageIndex, productGallery, toCartItem } from '@/frontend/lib/product';
import { defaultVariant, getVariantPricing } from '@/cms/lib/pricing';
import { track } from '@/frontend/lib/analytics';
import { ColorSelector, PriceBlock, QuantitySelector, VariantSelector } from '@/frontend/components/products/ProductOptions';
import type { Product, SiteSettings } from '@/types';

interface ProductDetailProps {
  product: Product;
  settings: SiteSettings | null;
}

export function ProductDetail({ product, settings }: ProductDetailProps) {
  const router = useRouter();
  const images = useMemo(() => productGallery(product), [product]);
  const [selectedSize, setSelectedSize] = useState<string>(defaultVariant(product)?.label || '');
  const [selectedColor, setSelectedColor] = useState<string>(product.colors?.[0]?.label || '');
  const [currentImg, setCurrentImgRaw] = useState(() => Math.max(0, colourImageIndex(images, product, product.colors?.[0]?.label)));
  const [quantity, setQuantity] = useState(1);
  const [zoomed, setZoomed] = useState(false);

  const { addItem, openCart } = useCartStore();

  useEffect(() => {
    track('product_view', { productId: product._id, productName: product.name });
  }, [product._id, product.name]);
  const { toggleWishlist, isWishlisted } = useWishlistStore();
  const wishlistReady = useWishlistHydrated();
  const wished = wishlistReady && isWishlisted(product._id);

  const pricing = getVariantPricing(product, selectedSize || undefined, selectedColor || undefined);

  // Browsing to a colour's photo selects that colour (and its price).
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
  const { discount } = pricing;
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
    openCart();
  };

  const handleBuyNow = () => {
    if (!addToCart()) return;
    router.push('/checkout');
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: product.shortDescription,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard!');
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">

        {/* ─── Image Gallery ─────────────────────────────── */}
        <div className="space-y-4">
          {/* Main image */}
          <div
            className="relative aspect-square bg-cream overflow-hidden cursor-zoom-in group"
            onClick={() => setZoomed(true)}
          >
            {images[currentImg]?.asset ? (
              <Image
                src={safeImageUrl(images[currentImg], 800, 800, 90) || IMAGE_PLACEHOLDER}
                alt={images[currentImg].alt || product.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            ) : (
              <SacredPlaceholder
                size={64}
                label={product.deity || product.name}
                className="absolute inset-0 bg-divine-gradient"
              />
            )}

            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col gap-2">
              {product.isNewArrival && (
                <span className="bg-teal text-white text-[9px] font-cinzel tracking-widest px-3 py-1">NEW</span>
              )}
              {product.isBestseller && (
                <span className="bg-gold text-white text-[9px] font-cinzel tracking-widest px-3 py-1">BESTSELLER</span>
              )}
              {discount > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-cinzel tracking-widest px-3 py-1">-{discount}%</span>
              )}
            </div>

            {/* Zoom hint */}
            <div className="absolute bottom-4 right-4 bg-black/40 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ZoomIn size={16} />
            </div>

            {/* Nav arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setCurrentImg((p) => (p === 0 ? images.length - 1 : p - 1)); }}
                  aria-label="Previous image"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setCurrentImg((p) => (p === images.length - 1 ? 0 : p + 1)); }}
                  aria-label="Next image"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentImg(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === currentImg}
                  className={`relative aspect-square overflow-hidden border-2 transition-all ${
                    i === currentImg ? 'border-gold' : 'border-[var(--border)] hover:border-gold/50'
                  }`}
                >
                  {img.asset && (
                    <Image
                      src={safeImageUrl(img, 120, 120, 75) || IMAGE_PLACEHOLDER}
                      alt={img.alt || `View ${i + 1}`}
                      fill
                      sizes="20vw"
                      className="object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Product Info ──────────────────────────────── */}
        <div className="flex flex-col">
          {/* Category / Deity */}
          <p className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-gold mb-2">
            {product.deity} · {product.category?.name}
          </p>

          {/* Name */}
          <h1 className="font-crimson text-3xl sm:text-4xl font-semibold text-deep leading-tight mb-4">
            {product.name}
          </h1>

          {/* Price */}
          <PriceBlock price={pricing.price} mrp={pricing.mrp} discount={discount} quantity={quantity} />

          {/* Stock */}
          <p className={`text-xs font-cinzel tracking-wider mb-5 ${outOfStock ? 'text-red-500' : 'text-green-600'}`}>
            {pricing.stock > 10 ? '✓ In Stock' : pricing.stock > 0 ? `⚠ Only ${pricing.stock} left` : '✗ Out of Stock'}
          </p>

          {/* Short desc */}
          {product.shortDescription && (
            <p className="font-crimson text-base text-[var(--text-mid)] leading-relaxed mb-6 border-l-2 border-gold pl-4">
              {product.shortDescription}
            </p>
          )}

          <VariantSelector product={product} value={selectedSize} onChange={selectSize} />
          <ColorSelector colors={product.colors} value={selectedColor} onChange={selectColour} />

          {/* Quantity */}
          <div className="mb-6">
            <QuantitySelector value={quantity} max={pricing.stock} onChange={setQuantity} />
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <button
              onClick={handleAddToCart}
              disabled={outOfStock}
              className="flex-1 btn-outline-gold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingBag size={14} /> Add to Cart
            </button>
            <Button onClick={handleBuyNow} disabled={outOfStock} className="flex-1">
              <Zap size={14} /> {outOfStock ? 'Out of Stock' : 'Buy Now'}
            </Button>
          </div>

          {/* Wishlist & Share */}
          <div className="flex gap-3 mb-8">
            <button
              onClick={() => { toggleWishlist(product._id); toast.success(wished ? 'Removed from wishlist' : 'Added to wishlist ❤️'); }}
              className={`flex items-center gap-2 font-cinzel text-[10px] tracking-widest uppercase transition-colors ${wished ? 'text-red-500' : 'text-[var(--text-mid)] hover:text-gold'}`}
            >
              <Heart size={14} fill={wished ? 'currentColor' : 'none'} />
              {wished ? 'Wishlisted' : 'Add to Wishlist'}
            </button>
            <span className="text-[var(--border)]">|</span>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] hover:text-gold transition-colors"
            >
              <Share2 size={14} /> Share
            </button>
          </div>

          {/* Trust strips */}
          <div className="border border-[var(--border)] p-4 space-y-3">
            {[
              { icon: <Truck size={14} />, text: `Free delivery on orders above ₹${settings?.freeDeliveryThreshold || 999}` },
              { icon: <Shield size={14} />, text: 'Secure payment — 100% safe & encrypted' },
              { icon: <RotateCcw size={14} />, text: 'Easy returns within 7 days of delivery' },
              { icon: <Check size={14} />, text: 'Handcrafted with authentic sacred materials' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 font-cinzel text-[10px] tracking-wider text-[var(--text-mid)] uppercase">
                <span className="text-gold flex-shrink-0">{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>

          {/* Material & weight */}
          {(product.material || product.weight) && (
            <div className="flex gap-6 mt-5 font-cinzel text-[10px] tracking-wider uppercase text-[var(--text-mid)]">
              {product.material && <span>Material: <span className="text-gold">{product.material}</span></span>}
              {product.weight && <span>Weight: <span className="text-gold">{product.weight}g</span></span>}
            </div>
          )}

          {/* WhatsApp Order */}
          {settings?.whatsappNumber && (
            <a
              href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste! 🙏 I want to order: ${product.name}${selectedSize ? `\nVariant: ${selectedSize}` : ''}${selectedColor ? `\nColour: ${selectedColor}` : ''}\nQty: ${quantity}\nPrice: ₹${(pricing.price * quantity).toLocaleString('en-IN')}\n${process.env.NEXT_PUBLIC_SITE_URL || 'https://nikunjsakhi.com'}/products/${product.slug.current}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex items-center justify-center gap-3 bg-[#25D366] text-white font-cinzel text-[10px] tracking-widest uppercase py-3 hover:bg-[#1da955] transition-colors"
            >
              <span className="text-xl">💬</span> Order via WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Zoom Modal */}
      <AnimatePresence>
        {zoomed && (
          <motion.div
            className="fixed inset-0 z-[600] bg-black/90 flex items-center justify-center cursor-zoom-out"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomed(false)}
          >
            <div className="relative w-full max-w-3xl aspect-square mx-4">
              {images[currentImg]?.asset && (
                <Image
                  src={safeImageUrl(images[currentImg], 1200, 1200, 95) || IMAGE_PLACEHOLDER}
                  alt={product.name}
                  fill
                  className="object-contain"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
