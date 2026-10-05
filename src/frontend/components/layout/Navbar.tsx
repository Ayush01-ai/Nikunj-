'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Search, Heart, Menu, X, User, ChevronDown } from 'lucide-react';
import { useCartStore } from '@/frontend/store/cartStore';
import { useAuthStore } from '@/frontend/store/authStore';
import { useSiteSettings } from '@/frontend/providers/Providers';
import { SearchModal } from '@/frontend/components/ui/SearchModal';
import { NikunjSakhiLogo } from '@/frontend/components/ui/NikunjSakhiLogo';
import type { SiteSettings } from '@/types';

interface NavbarProps {
  settings: SiteSettings | null;
}

const navLinks = [
  { href: '/#collections', label: 'Collections' },
  { href: '/#products', label: 'Featured' },
  { href: '/#about', label: 'About Us' },
  { href: '/#reviews', label: 'Reviews' },
  { href: '/#feedback', label: 'Contact' },
];

export function Navbar({ settings }: NavbarProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [shopOpen, setShopOpen] = useState(false);
  const [mobileShopOpen, setMobileShopOpen] = useState(false);
  const shopCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { menu } = useSiteSettings();
  const { items, openCart } = useCartStore();
  const { user } = useAuthStore();

  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const isShopRoute = pathname.startsWith('/collections') || pathname.startsWith('/products');
  const visibleLinks = navLinks.filter(
    (link) =>
      !(link.href === '/#reviews' && settings?.showReviews === false) &&
      !(link.href === '/#feedback' && settings?.showFeedbackForm === false),
  );

  const openShop = () => {
    if (shopCloseTimer.current) clearTimeout(shopCloseTimer.current);
    setShopOpen(true);
  };
  const scheduleCloseShop = () => {
    shopCloseTimer.current = setTimeout(() => setShopOpen(false), 150);
  };

  useEffect(() => {
    setShopOpen(false);
    setMobileShopOpen(false);
  }, [pathname]);

  // Arriving from another page (e.g. /collections → /#feedback): images and animations load after the
  // initial jump and push sections down, so re-align a few times until the user scrolls themselves.
  useEffect(() => {
    if (pathname !== '/') return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    const align = () => document.getElementById(id)?.scrollIntoView({ block: 'start' });
    const timers = [50, 400, 1000, 2000].map((ms) => setTimeout(align, ms));
    const stop = () => timers.forEach(clearTimeout);
    const opts = { once: true, passive: true } as const;
    window.addEventListener('wheel', stop, opts);
    window.addEventListener('touchstart', stop, opts);
    window.addEventListener('keydown', stop, opts);
    return () => {
      stop();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [pathname]);

  useEffect(() => {
    if (!shopOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShopOpen(false); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [shopOpen]);

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 40);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // B6: Close mobile menu on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [mobileOpen]);

  useEffect(() => {
    if (pathname !== '/') {
      setActiveSection('');
      return;
    }

    const sectionIds = navLinks
      .map((link) => link.href.split('#')[1])
      .filter((id): id is string => Boolean(id));

    const updateActiveSection = () => {
      const scrollPoint = window.scrollY + 140;
      let current = '';

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.offsetTop <= scrollPoint) current = id;
      }

      setActiveSection(current);
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('hashchange', updateActiveSection);
    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('hashchange', updateActiveSection);
    };
  }, [pathname]);

  const handleSectionNav = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (pathname !== '/') return;

    const sectionId = href.split('#')[1];
    if (!sectionId) return;

    const target = document.getElementById(sectionId);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `/#${sectionId}`);
    setActiveSection(sectionId);
  };

  return (
    <>
      <motion.nav
        className={`
          sticky top-0 z-50 w-full transition-all duration-500
          ${scrolled
            ? 'bg-cream/95 backdrop-blur-md shadow-gold-sm border-b border-[var(--border)]'
            : 'bg-cream/90 backdrop-blur-sm border-b border-[var(--border)]'
          }
        `}
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">

            {/* Logo */}
            <Link href="/" className="flex items-center group flex-shrink-0" aria-label="Nikunj Sakhi – Home">
              <NikunjSakhiLogo className="w-52 sm:w-64" variant="light" />
            </Link>

            {/* Desktop Nav Links */}
            <ul className="hidden lg:flex items-center gap-8 list-none ml-auto mr-6">
              <li onMouseEnter={openShop} onMouseLeave={scheduleCloseShop}>
                <button
                  type="button"
                  aria-expanded={shopOpen}
                  aria-controls="shop-menu"
                  onClick={() => setShopOpen((o) => !o)}
                  className={`nav-link inline-flex items-center gap-1 text-xs font-semibold tracking-widest cursor-pointer ${isShopRoute ? 'text-gold-dark after:w-full' : ''}`}
                >
                  Shop <ChevronDown size={12} className={`transition-transform ${shopOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </li>
              {visibleLinks.map((link) => {
                const sectionId = link.href.split('#')[1] || '';
                const isActive = pathname === '/' && activeSection === sectionId;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={(event) => handleSectionNav(event, link.href)}
                      className={`nav-link text-xs font-semibold tracking-widest ${isActive ? 'text-gold-dark after:w-full' : ''}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-3 lg:border-l lg:border-[var(--border)] lg:pl-6">
              {/* Search */}
              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Search products"
                className="p-2 text-[var(--text-mid)] hover:text-gold transition-colors cursor-pointer rounded-xs focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                <Search size={18} />
              </button>

              {/* Wishlist */}
              <Link
                href="/wishlist"
                aria-label="Wishlist"
                className="hidden sm:flex p-2 text-[var(--text-mid)] hover:text-gold transition-colors cursor-pointer rounded-xs focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                <Heart size={18} />
              </Link>

              {/* Auth */}
              <Link
                href={user ? '/account' : '/login'}
                aria-label="Account"
                className="hidden sm:flex p-2 text-[var(--text-mid)] hover:text-gold transition-colors cursor-pointer rounded-xs focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                <User size={18} />
              </Link>

              {/* Cart Button */}
              <button
                onClick={openCart}
                aria-label={`Cart (${cartCount} items)`}
                className="relative flex items-center gap-2 border border-gold text-gold-dark bg-transparent px-4 py-2.5 font-cinzel text-xs tracking-widest uppercase hover:bg-gold-dark hover:text-white transition-colors cursor-pointer rounded-xs focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                <ShoppingBag size={16} />
                <span className="hidden sm:inline font-semibold">Cart</span>
                {cartCount > 0 && (
                  <motion.span
                    key={cartCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-1.5 bg-gold-dark text-white rounded-full w-5 h-5 text-[10px] font-bold flex items-center justify-center font-lato shadow-xs"
                  >
                    {cartCount}
                  </motion.span>
                )}
              </button>

              {/* Hamburger */}
              <button
                className="lg:hidden p-2 text-[var(--text-mid)] cursor-pointer rounded-xs focus-visible:ring-2 focus-visible:ring-gold/50"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Shop mega-menu */}
        <AnimatePresence>
          {shopOpen && (
            <motion.div
              id="shop-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              onMouseEnter={openShop}
              onMouseLeave={scheduleCloseShop}
              className="hidden lg:block absolute left-0 right-0 top-full bg-cream border-b border-[var(--border)] shadow-gold-sm"
            >
              <div className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-8">
                {menu.map((cat) => (
                  <div key={cat._id}>
                    <Link
                      href={`/collections/${cat.slug}`}
                      className="font-cinzel text-xs font-semibold tracking-widest uppercase text-gold-dark hover:text-gold transition-colors"
                    >
                      {cat.name}
                    </Link>
                    <ul className="mt-3 space-y-2">
                      {cat.types.map((type) => (
                        <li key={type._id}>
                          <Link
                            href={`/collections/${cat.slug}/${type.slug}`}
                            className="font-crimson text-[15px] text-[var(--text-mid)] hover:text-gold transition-colors"
                          >
                            {type.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="flex flex-col justify-between border-l border-[var(--border)] pl-8">
                  <p className="font-crimson italic text-sm text-[var(--text-mid)]">
                    Handcrafted shringar and pooja essentials for your beloved deity.
                  </p>
                  <Link href="/collections" className="btn-outline-gold self-start mt-4">
                    Shop All
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[200] bg-cream flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.35 }}
          >
            <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
              <NikunjSakhiLogo className="w-36" variant="light" />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-gold"
              >
                <X size={28} />
              </button>
            </div>

            <nav className="flex flex-col items-center flex-1 gap-8 overflow-y-auto py-10">
              <div className="w-full max-w-xs text-center">
                <button
                  type="button"
                  aria-expanded={mobileShopOpen}
                  onClick={() => setMobileShopOpen((o) => !o)}
                  className="inline-flex items-center gap-2 font-cinzel text-xl tracking-[0.2em] text-deep hover:text-gold transition-colors"
                >
                  Shop <ChevronDown size={18} className={`transition-transform ${mobileShopOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {mobileShopOpen && (
                  <div className="mt-4 space-y-4 text-left border-y border-[var(--border)] py-4">
                    <Link href="/collections" onClick={() => setMobileOpen(false)} className="block font-cinzel text-xs tracking-widest uppercase text-gold-dark">
                      Shop All
                    </Link>
                    {menu.map((cat) => (
                      <div key={cat._id}>
                        <Link
                          href={`/collections/${cat.slug}`}
                          onClick={() => setMobileOpen(false)}
                          className="block font-cinzel text-xs tracking-widest uppercase text-gold-dark"
                        >
                          {cat.name}
                        </Link>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {cat.types.map((type) => (
                            <Link
                              key={type._id}
                              href={`/collections/${cat.slug}/${type.slug}`}
                              onClick={() => setMobileOpen(false)}
                              className="font-crimson text-sm text-[var(--text-mid)] border border-[var(--border)] px-3 py-1 hover:border-gold hover:text-gold"
                            >
                              {type.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {visibleLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Link
                    href={link.href}
                    className="font-cinzel text-xl tracking-[0.2em] text-deep hover:text-gold transition-colors"
                    onClick={(event) => {
                      handleSectionNav(event, link.href);
                      setMobileOpen(false);
                    }}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </nav>

            <div className="p-6 border-t border-[var(--border)] flex justify-center gap-6">
              <Link href="/login" className="font-cinzel text-xs tracking-widest text-[var(--text-mid)]" onClick={() => setMobileOpen(false)}>
                Account
              </Link>
              <Link href="/wishlist" className="font-cinzel text-xs tracking-widest text-[var(--text-mid)]" onClick={() => setMobileOpen(false)}>
                Wishlist
              </Link>
              <Link href="/track-order" className="font-cinzel text-xs tracking-widest text-[var(--text-mid)]" onClick={() => setMobileOpen(false)}>
                Track Order
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Modal */}
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
