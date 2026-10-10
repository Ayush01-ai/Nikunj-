'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useCartStore } from '@/frontend/store/cartStore';
import { Button } from '@/frontend/components/ui/button';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';

export function CartSidebar() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, subtotal } = useCartStore();
  const [mounted, setMounted] = useState(false);

  // Mark as mounted after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCart();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeCart]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Use stable values for SSR; real values after mount
  const safeItems = mounted ? items : [];
  const safeIsOpen = mounted ? isOpen : false;
  const total = mounted ? subtotal() : 0;
  const FREE_THRESHOLD = 999;
  const deliveryCharge = total >= FREE_THRESHOLD ? 0 : 80;
  const remaining = FREE_THRESHOLD - total;

  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {safeIsOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div
        className="fixed top-0 right-0 h-screen w-full max-w-md bg-white z-[301] flex flex-col shadow-2xl"
        initial={{ x: '100%' }}
        animate={{ x: safeIsOpen ? 0 : '100%' }}
        transition={{ type: 'tween', duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        aria-modal="true"
        role="dialog"
        aria-label="Shopping cart"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)] bg-cream flex-shrink-0">
          <div className="flex items-center gap-3">
            <ShoppingBag size={18} className="text-gold" />
            <h2 className="font-cinzel text-sm tracking-widest text-gold-dark">
              Your Cart ({safeItems.reduce((s, i) => s + i.quantity, 0)})
            </h2>
          </div>
          <button
            onClick={closeCart}
            className="text-[var(--text-mid)] hover:text-gold transition-colors"
            aria-label="Close cart"
          >
            <X size={20} />
          </button>
        </div>

        {/* Free delivery progress */}
        {total > 0 && total < FREE_THRESHOLD && (
          <div className="px-6 py-3 bg-gold/5 border-b border-[var(--border)] flex-shrink-0">
            <p className="font-cinzel text-xs tracking-wider text-[var(--text-mid)] mb-1.5">
              Add ₹{remaining.toLocaleString('en-IN')} more for <span className="text-gold">FREE delivery</span>
            </p>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all duration-500"
                style={{ width: `${Math.min((total / FREE_THRESHOLD) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
        {total >= FREE_THRESHOLD && (
          <div className="px-6 py-2.5 bg-green-50 border-b border-green-100 text-center flex-shrink-0">
            <p className="font-cinzel text-xs tracking-wider text-green-700 font-semibold">
              ✓ You qualify for FREE delivery!
            </p>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <AnimatePresence initial={false}>
            {safeItems.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <ShoppingBag size={40} className="text-gray-200 mx-auto mb-4" />
                <p className="font-crimson italic text-lg text-[var(--text-mid)] mb-2">
                  Your cart is empty
                </p>
                <p className="text-xs text-gray-400 mb-6">
                  Add some divine ornaments to your cart 🙏
                </p>
                <Button onClick={closeCart}>
                  Explore Collections
                </Button>
              </motion.div>
            ) : (
              safeItems.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex gap-4 pb-4 border-b border-[var(--border)] last:border-0"
                >
                  {/* Image */}
                  <Link
                    href={item.href || `/products/${encodeURIComponent(item.slug)}`}
                    onClick={closeCart}
                    aria-label={`View ${item.name}`}
                    className="relative w-20 h-20 bg-cream flex-shrink-0 overflow-hidden"
                  >
                    {item.image ? (
                      <Image src={item.image} alt="" fill sizes="80px" className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-cream-200">
                        <SacredIcon name="lotus" size={24} className="text-gold" />
                      </div>
                    )}
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-cinzel text-[10px] tracking-wider text-gold-dark mb-0.5 truncate">
                      {[item.productType, item.deity].filter(Boolean).join(' · ')}
                    </p>
                    <h3 className="font-crimson text-sm font-semibold text-deep leading-snug line-clamp-2 mb-0.5">
                      <Link
                        href={item.href || `/products/${encodeURIComponent(item.slug)}`}
                        onClick={closeCart}
                        className="hover:text-gold-dark hover:underline underline-offset-2"
                      >
                        {item.name}
                      </Link>
                    </h3>
                    <p className="text-xs text-[var(--text-mid)] mb-1">
                      {item.selectedSize ? `Option: ${item.selectedSize}` : 'Standard'}
                      {item.selectedColor && ` · Colour: ${item.selectedColor}`}
                      {` · ₹${item.price.toLocaleString('en-IN')} each`}
                    </p>
                    <p className="font-cinzel text-sm font-bold text-gold-dark">
                      ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                      {item.originalPrice && item.originalPrice > item.price && (
                        <span className="ml-2 text-xs font-normal text-gray-400 line-through">
                          ₹{(item.originalPrice * item.quantity).toLocaleString('en-IN')}
                        </span>
                      )}
                    </p>

                    {/* Qty controls */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="w-9 h-9 disabled:opacity-40 disabled:pointer-events-none border border-[var(--border)] flex items-center justify-center hover:bg-gold-dark hover:border-gold-dark hover:text-white transition-all"
                      >
                        <Minus size={11} aria-hidden="true" />
                      </button>
                      <span className="font-cinzel text-xs w-6 text-center" aria-live="polite">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={typeof item.stock === 'number' && item.stock > 0 && item.quantity >= item.stock}
                        aria-label={`Increase quantity of ${item.name}`}
                        className="w-9 h-9 disabled:opacity-40 disabled:pointer-events-none border border-[var(--border)] flex items-center justify-center hover:bg-gold-dark hover:border-gold-dark hover:text-white transition-all"
                      >
                        <Plus size={11} aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="ml-2 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                        aria-label={`Remove ${item.name} from cart`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {safeItems.length > 0 && (
          <div className="flex-shrink-0 px-6 py-5 border-t border-[var(--border)] bg-cream space-y-3">
            {/* Summary rows */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-mid)] font-lato">Subtotal</span>
                <span className="font-cinzel text-deep">₹{total.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-mid)] font-lato">Delivery</span>
                <span className="font-cinzel text-deep">
                  {deliveryCharge === 0 ? '🎉 FREE' : `₹${deliveryCharge}`}
                </span>
              </div>
            </div>

            {/* Total */}
            <div className="flex justify-between items-center border-t border-[var(--border)] pt-3">
              <span className="font-cinzel text-sm tracking-wider text-[var(--text-mid)]">Total</span>
              <span className="font-cinzel text-xl font-bold text-gold-dark">
                ₹{(total + deliveryCharge).toLocaleString('en-IN')}
              </span>
            </div>

            {/* Checkout button */}
            <Button asChild className="w-full normal-case tracking-wider font-semibold">
              <Link
                href="/checkout"
                onClick={closeCart}
              >
                Proceed to Checkout <ArrowRight size={14} />
              </Link>
            </Button>

            <button
              onClick={closeCart}
              className="w-full text-center font-cinzel text-xs tracking-wider text-[var(--text-mid)] hover:text-gold transition-colors py-1"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
}
