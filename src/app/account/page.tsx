'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Package, MapPin, Heart, LogOut, ChevronRight, ShoppingBag, Truck, CheckCircle2, Clock, User as UserIcon, Mail, Phone,
} from 'lucide-react';
import { useAuthStore } from '@/frontend/store/authStore';
import { useWishlistStore } from '@/frontend/store/wishlistStore';
import { useCartStore } from '@/frontend/store/cartStore';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { SacredPlaceholder } from '@/frontend/components/ui/SacredIcon';
import { client } from '@/cms/lib/client';
import { urlFor } from '@/cms/lib/image';
import { WISHLIST_PRODUCTS_QUERY } from '@/cms/lib/queries';
import { getProductHref } from '@/frontend/lib/product';
import { lowestPricing, formatINR } from '@/cms/lib/pricing';
import type { Order, Product } from '@/types';
import { ORDER_STATUS_LABEL, ORDER_STEPS, isReturnStatus } from '@/cms/lib/orderMessages';
import toast from 'react-hot-toast';

type Tab = 'orders' | 'wishlist' | 'cart' | 'profile';

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'processing', 'shipped']);

function OrderProgress({ status }: { status: string }) {
  if (status === 'cancelled' || status === 'refunded') {
    return <p className="font-lato text-[11px] text-red-600 mt-3">{ORDER_STATUS_LABEL[status]}</p>;
  }
  if (isReturnStatus(status)) {
    return <p className="font-lato text-[11px] text-amber-700 mt-3">↩ {ORDER_STATUS_LABEL[status]}</p>;
  }
  const current = ORDER_STEPS.indexOf(status as (typeof ORDER_STEPS)[number]);
  return (
    <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Order progress">
      {ORDER_STEPS.map((step, i) => {
        const done = current >= i;
        return (
          <li key={step} className="flex flex-col gap-1.5">
            <span className={`h-1.5 rounded-full transition-colors ${done ? 'bg-teal' : 'bg-[var(--border)]'}`} />
            <span className={`font-lato text-[10px] leading-tight ${done ? 'text-teal font-semibold' : 'text-[var(--text-mid)]'}`}>
              {ORDER_STATUS_LABEL[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StatCard({
  icon: Icon, label, value, onClick, accent,
}: { icon: React.ElementType; label: string; value: number | string; onClick: () => void; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group bg-white border border-[var(--border)] p-4 text-left hover:border-gold hover:shadow-gold-sm transition-all"
    >
      <span className={`inline-flex w-9 h-9 items-center justify-center rounded-full ${accent} mb-3 transition-transform group-hover:scale-110`}>
        <Icon size={17} />
      </span>
      <p className="font-cinzel text-2xl font-semibold text-deep leading-none">{value}</p>
      <p className="font-lato text-[11px] uppercase tracking-wider text-[var(--text-mid)] mt-1">{label}</p>
    </button>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const wishlistIds = useWishlistStore((s) => s.ids);
  const toggleWishlist = useWishlistStore((s) => s.toggleWishlist);
  const cartItems = useCartStore((s) => s.items);
  const cartSubtotal = useCartStore((s) => s.subtotal());
  const openCart = useCartStore((s) => s.openCart);

  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [loadingWishlist, setLoadingWishlist] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login?next=/account');
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoadingOrders(true);
    // Session identity comes from the HttpOnly `ns_token` cookie, sent automatically.
    fetch('/api/orders', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) {
          logout();
          toast.error('Session expired. Please log in again.');
          return { data: [] };
        }
        return r.json();
      })
      .then((d) => setOrders(d.data || []))
      .catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoadingOrders(false));
  }, [isAuthenticated, logout]);

  useEffect(() => {
    if (wishlistIds.length === 0) { setWishlist([]); return; }
    setLoadingWishlist(true);
    client.fetch<Product[]>(WISHLIST_PRODUCTS_QUERY, { ids: wishlistIds })
      .then(setWishlist)
      .catch(() => setWishlist([]))
      .finally(() => setLoadingWishlist(false));
  }, [wishlistIds]);

  const stats = useMemo(() => ({
    total: orders.length,
    active: orders.filter((o) => ACTIVE_STATUSES.has(o.status)).length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
  }), [orders]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    logout();
    toast.success('Logged out');
    router.push('/');
  };

  if (!user) return null;

  const cartCount = cartItems.reduce((n, i) => n + i.quantity, 0);
  const contact = user.email || (user.phone ? `+91 ${user.phone}` : '');

  const tabs = [
    { id: 'orders' as Tab, label: 'Orders', icon: Package, count: stats.total },
    { id: 'wishlist' as Tab, label: 'Wishlist', icon: Heart, count: wishlistIds.length },
    { id: 'cart' as Tab, label: 'Cart', icon: ShoppingBag, count: cartCount },
    { id: 'profile' as Tab, label: 'Profile', icon: UserIcon },
  ];

  return (
    <>
      <Navbar settings={null} />
      <div className="min-h-screen bg-cream pt-8">
        <div className="max-w-5xl mx-auto px-4 py-10">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4 min-w-0">
              {user.avatar ? (
                <Image src={user.avatar} alt="" width={56} height={56} className="rounded-full border-2 border-gold/40" />
              ) : (
                <span className="w-14 h-14 shrink-0 rounded-full bg-gradient-to-br from-teal to-gold text-white flex items-center justify-center font-cinzel text-xl">
                  {(user.name || user.email || 'D').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <h1 className="font-cinzel text-2xl font-semibold text-deep truncate">
                  {user.name ? `Jai Shri Radhe, ${user.name.split(' ')[0]}` : 'My Account'}
                </h1>
                {contact && <p className="font-crimson italic text-[var(--text-mid)] truncate">{contact}</p>}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="shrink-0 flex items-center gap-2 font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] hover:text-red-600 transition-colors"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard icon={Package} label="Total orders" value={loadingOrders ? '–' : stats.total} onClick={() => setActiveTab('orders')} accent="bg-teal/10 text-teal" />
            <StatCard icon={Truck} label="In progress" value={loadingOrders ? '–' : stats.active} onClick={() => setActiveTab('orders')} accent="bg-gold/15 text-gold-dark" />
            <StatCard icon={Heart} label="Wishlist" value={wishlistIds.length} onClick={() => setActiveTab('wishlist')} accent="bg-rose-50 text-rose-500" />
            <StatCard icon={ShoppingBag} label="In cart" value={cartCount} onClick={() => setActiveTab('cart')} accent="bg-emerald-50 text-emerald-600" />
          </div>

          {/* Tabs */}
          <div role="tablist" className="flex gap-1 border-b border-[var(--border)] mb-6 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 whitespace-nowrap font-cinzel text-[10px] tracking-widest uppercase transition-colors ${
                  activeTab === tab.id ? 'border-b-2 border-gold text-gold -mb-px' : 'text-[var(--text-mid)] hover:text-gold'
                }`}
              >
                <tab.icon size={13} /> {tab.label}
                {tab.count ? <span className="ml-1 rounded-full bg-gold/15 px-1.5 text-[9px] text-gold-dark">{tab.count}</span> : null}
              </button>
            ))}
          </div>

          {/* Orders */}
          {activeTab === 'orders' && (
            loadingOrders ? (
              <div className="grid gap-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded" />)}</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16">
                <Package size={40} className="text-gold/30 mx-auto mb-4" />
                <p className="font-crimson italic text-[var(--text-mid)]">No orders yet.</p>
                <Link href="/collections" className="btn-gold mt-4 inline-block">Shop Now</Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {orders.map((order) => (
                  <motion.div key={order._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Link
                      href={`/track-order?id=${encodeURIComponent(order.orderId)}`}
                      aria-label={`Track order ${order.orderId}, status ${ORDER_STATUS_LABEL[order.status] ?? order.status}`}
                      className="block bg-white border border-[var(--border)] p-5 hover:border-gold-dark focus-visible:border-gold-dark transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex -space-x-3 shrink-0">
                            {order.items.slice(0, 3).map((item, i) => (
                              <span key={i} className="relative w-11 h-11 rounded-full overflow-hidden border-2 border-white bg-cream">
                                {item.image ? (
                                  <Image src={item.image} alt="" fill sizes="44px" className="object-cover" />
                                ) : (
                                  <SacredPlaceholder className="w-full h-full" />
                                )}
                              </span>
                            ))}
                          </div>
                          <div className="min-w-0">
                            <p className="font-cinzel text-xs font-semibold text-gold-dark">{order.orderId}</p>
                            <p className="font-lato text-xs text-[var(--text-mid)] mt-0.5 truncate">
                              {order.items.length} item{order.items.length > 1 ? 's' : ''} · {formatINR(order.total)} ·{' '}
                              {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`font-cinzel text-[9px] uppercase tracking-wider px-2 py-1 ${
                            order.status === 'delivered' ? 'bg-green-100 text-green-700'
                              : order.status === 'cancelled' || order.status === 'refunded' ? 'bg-red-100 text-red-700'
                              : isReturnStatus(order.status) ? 'bg-amber-100 text-amber-800'
                              : 'bg-gold/10 text-gold-dark'
                          }`}>
                            {ORDER_STATUS_LABEL[order.status] ?? order.status}
                          </span>
                          <ChevronRight size={14} className="text-[var(--text-mid)]" aria-hidden="true" />
                        </div>
                      </div>
                      <OrderProgress status={order.status} />
                    </Link>
                  </motion.div>
                ))}
                {stats.delivered > 0 && (
                  <p className="flex items-center gap-2 font-lato text-xs text-[var(--text-mid)]">
                    <CheckCircle2 size={13} className="text-green-600" /> {stats.delivered} order{stats.delivered > 1 ? 's' : ''} delivered
                  </p>
                )}
              </div>
            )
          )}

          {/* Wishlist */}
          {activeTab === 'wishlist' && (
            wishlistIds.length === 0 ? (
              <div className="text-center py-16">
                <Heart size={40} className="text-gold/30 mx-auto mb-4" />
                <p className="font-crimson italic text-[var(--text-mid)]">Your wishlist is empty.</p>
                <Link href="/collections" className="btn-gold mt-4 inline-block">Explore Collections</Link>
              </div>
            ) : loadingWishlist ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="skeleton aspect-[4/5] rounded" />)}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {wishlist.map((p) => {
                    const pricing = lowestPricing(p);
                    return (
                      <div key={p._id} className="group bg-white border border-[var(--border)] hover:border-gold transition-colors">
                        <Link href={getProductHref(p)} className="block relative aspect-[4/5] bg-cream overflow-hidden">
                          {p.images?.[0]?.asset ? (
                            <Image src={urlFor(p.images[0]).width(400).height(500).url()} alt={p.name} fill sizes="(max-width:640px) 50vw, 25vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <SacredPlaceholder className="w-full h-full" />
                          )}
                        </Link>
                        <div className="p-3">
                          <Link href={getProductHref(p)} className="font-lato text-sm text-deep line-clamp-1 hover:text-gold">{p.name}</Link>
                          <div className="flex items-center justify-between mt-1">
                            <span className="font-cinzel text-sm text-gold-dark">{formatINR(pricing.price)}</span>
                            <button type="button" onClick={() => toggleWishlist(p._id)} aria-label={`Remove ${p.name} from wishlist`} className="text-rose-500 hover:scale-110 transition-transform">
                              <Heart size={15} fill="currentColor" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-center mt-6">
                  <Link href="/wishlist" className="btn-outline-gold inline-block">Open Full Wishlist</Link>
                </div>
              </>
            )
          )}

          {/* Cart */}
          {activeTab === 'cart' && (
            cartItems.length === 0 ? (
              <div className="text-center py-16">
                <ShoppingBag size={40} className="text-gold/30 mx-auto mb-4" />
                <p className="font-crimson italic text-[var(--text-mid)]">Your cart is empty.</p>
                <Link href="/collections" className="btn-gold mt-4 inline-block">Start Shopping</Link>
              </div>
            ) : (
              <div className="bg-white border border-[var(--border)]">
                <ul className="divide-y divide-[var(--border)]">
                  {cartItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-4 p-4">
                      <span className="relative w-16 h-16 shrink-0 bg-cream overflow-hidden">
                        {item.image ? <Image src={item.image} alt="" fill sizes="64px" className="object-cover" /> : <SacredPlaceholder className="w-full h-full" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <Link href={item.href || `/products/${item.slug}`} className="font-lato text-sm text-deep line-clamp-1 hover:text-gold">{item.name}</Link>
                        <p className="font-lato text-[11px] text-[var(--text-mid)]">
                          {[item.selectedSize, item.selectedColor].filter(Boolean).join(' · ')}{(item.selectedSize || item.selectedColor) ? ' · ' : ''}Qty {item.quantity}
                        </p>
                      </div>
                      <span className="font-cinzel text-sm text-gold-dark">{formatINR(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-[var(--border)] bg-cream/50">
                  <p className="font-lato text-sm text-deep">Subtotal: <strong className="font-cinzel">{formatINR(cartSubtotal)}</strong></p>
                  <div className="flex gap-2">
                    <button type="button" onClick={openCart} className="btn-outline-gold">Edit Cart</button>
                    <Link href="/checkout" className="btn-gold">Checkout</Link>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Profile */}
          {activeTab === 'profile' && (
            <div className="bg-white border border-[var(--border)] p-6 grid sm:grid-cols-2 gap-5">
              <div>
                <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-1">Name</p>
                <p className="font-lato text-sm text-deep">{user.name || '—'}</p>
              </div>
              <div>
                <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-1 flex items-center gap-1"><Mail size={11} /> Email</p>
                <p className="font-lato text-sm text-deep">{user.email || '—'}</p>
              </div>
              <div>
                <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-1 flex items-center gap-1"><Phone size={11} /> Phone</p>
                <p className="font-lato text-sm text-deep">{user.phone ? `+91 ${user.phone}` : '—'}</p>
              </div>
              <div>
                <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-1 flex items-center gap-1"><Clock size={11} /> Sign-in methods</p>
                <p className="font-lato text-sm text-deep capitalize">{(user.authProviders?.length ? user.authProviders : ['phone']).join(', ')}</p>
              </div>
              <div className="sm:col-span-2 flex items-start gap-2 font-lato text-xs text-[var(--text-mid)]">
                <MapPin size={13} className="mt-0.5 shrink-0" /> Delivery addresses are entered and saved during checkout.
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer settings={null} />
    </>
  );
}
