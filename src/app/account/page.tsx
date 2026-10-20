'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Package, MapPin, Heart, LogOut, ChevronRight, ShoppingBag, Truck, CheckCircle2, Clock, User as UserIcon, Mail, Phone, Trash2, Pencil, Plus, X, Star,
} from 'lucide-react';
import { useAuthStore } from '@/frontend/store/authStore';
import { useWishlistStore } from '@/frontend/store/wishlistStore';
import { useCartStore } from '@/frontend/store/cartStore';
import { ClerkSignOutBridge } from '@/frontend/components/auth/ClerkSignOutBridge';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { SacredPlaceholder } from '@/frontend/components/ui/SacredIcon';
import { client } from '@/cms/lib/client';
import { urlFor } from '@/cms/lib/image';
import { WISHLIST_PRODUCTS_QUERY } from '@/cms/lib/queries';
import { getProductHref } from '@/frontend/lib/product';
import { lowestPricing, formatINR } from '@/cms/lib/pricing';
import type { Order, Product, ShippingAddress } from '@/types';
import { ORDER_STATUS_LABEL, ORDER_STEPS, isReturnStatus } from '@/cms/lib/orderMessages';
import toast from 'react-hot-toast';
import { RefundPanel, type RefundView } from '@/frontend/components/orders/RefundPanel';
import { DeliveryCode, type DeliveryCodeView } from '@/frontend/components/orders/DeliveryCode';

type AccountOrder = Order & { refund?: RefundView | null; delivery?: DeliveryCodeView | null };

// Same build-time pattern used elsewhere (e.g. login/whatsapp/page.tsx) — only render the
// Clerk sign-out bridge when a <ClerkProvider> ancestor is guaranteed to exist.
const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

type Tab = 'orders' | 'wishlist' | 'cart' | 'profile';

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'processing', 'shipped']);

// Local form state for the address book: '_id' is set when editing an existing address,
// and omitted (undefined) when adding a new one.
type AddressFormState = ShippingAddress;

const EMPTY_ADDRESS: AddressFormState = {
  fullName: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', landmark: '', isDefault: false,
};

function AddressFormFields({
  value, onChange,
}: { value: AddressFormState; onChange: (next: AddressFormState) => void }) {
  const field = (key: keyof AddressFormState) => ({
    value: (value[key] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value }),
  });
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <input className="divine-input text-sm" placeholder="Full name" maxLength={100} {...field('fullName')} />
      <input className="divine-input text-sm" placeholder="Phone number" maxLength={10} {...field('phone')} />
      <input className="divine-input text-sm sm:col-span-2" placeholder="Address line 1 (house no., street)" {...field('line1')} />
      <input className="divine-input text-sm sm:col-span-2" placeholder="Address line 2 (optional)" {...field('line2')} />
      <input className="divine-input text-sm" placeholder="City" {...field('city')} />
      <input className="divine-input text-sm" placeholder="State" {...field('state')} />
      <input className="divine-input text-sm" placeholder="Pincode" maxLength={6} {...field('pincode')} />
      <input className="divine-input text-sm" placeholder="Landmark (optional)" {...field('landmark')} />
      <label className="flex items-center gap-2 sm:col-span-2 font-lato text-xs text-[var(--text-mid)]">
        <input
          type="checkbox"
          checked={Boolean(value.isDefault)}
          onChange={(e) => onChange({ ...value, isDefault: e.target.checked })}
          className="w-4 h-4 accent-gold-dark"
        />
        Set as default address
      </label>
    </div>
  );
}

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
  const { user, isAuthenticated, authChecked, logout, setUser } = useAuthStore();
  const wishlistIds = useWishlistStore((s) => s.ids);
  const toggleWishlist = useWishlistStore((s) => s.toggleWishlist);
  const cartItems = useCartStore((s) => s.items);
  const deselectedIds = useCartStore((s) => s.deselectedIds);
  const toggleSelected = useCartStore((s) => s.toggleSelected);
  const selectAllCart = useCartStore((s) => s.selectAll);
  const deselectAllCart = useCartStore((s) => s.deselectAll);
  const cartSelectedItems = useCartStore((s) => s.selectedItems());
  const cartSelectedSubtotal = useCartStore((s) => s.selectedSubtotal());
  const removeCartItem = useCartStore((s) => s.removeItem);
  const openCart = useCartStore((s) => s.openCart);

  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [loadingWishlist, setLoadingWishlist] = useState(false);
  const [clerkSignOutTrigger, setClerkSignOutTrigger] = useState(0);

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Address book
  const [addressForm, setAddressForm] = useState<AddressFormState | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);

  useEffect(() => {
    // Wait for the app-wide `/api/auth/me` bootstrap check (AuthBootstrap) to finish —
    // a Clerk-only session isn't in the persisted store yet on first load, so redirecting
    // immediately on `!isAuthenticated` would incorrectly bounce a signed-in Clerk user.
    if (authChecked && !isAuthenticated) router.replace('/login?next=/account');
  }, [authChecked, isAuthenticated, router]);

  const loadOrders = useCallback(() => {
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
    loadOrders();
  }, [loadOrders]);

  // Refunds waiting for the customer's UPI / bank details — shown first, above everything else.
  const refundActions = useMemo(
    () => (orders as AccountOrder[]).filter((o) => o.refund?.canSubmitDetails && o.refund.state !== 'details_submitted'),
    [orders],
  );
  const refundsInReview = useMemo(
    () => (orders as AccountOrder[]).filter((o) => o.refund && !refundActions.includes(o) && o.refund.state !== 'success'),
    [orders, refundActions],
  );

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
    // Also end any active Clerk session (no-op if the user never signed in via Clerk) —
    // otherwise the next page load's AuthBootstrap check would silently sign them back in.
    if (CLERK_ENABLED) setClerkSignOutTrigger((n) => n + 1);
    logout();
    toast.success('Logged out');
    router.push('/');
  };

  const startEditProfile = () => {
    setProfileForm({ name: user?.name || '', phone: user?.phone || '', email: user?.email || '' });
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not update profile');
      setUser(json.user);
      toast.success('Profile updated');
      setEditingProfile(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveAddress = async () => {
    if (!addressForm) return;
    setSavingAddress(true);
    try {
      const isEdit = Boolean(addressForm._id);
      const res = await fetch('/api/account/addresses', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { ...addressForm, id: addressForm._id } : addressForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save address');
      setUser(json.user);
      toast.success(isEdit ? 'Address updated' : 'Address added');
      setAddressForm(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not save address');
    } finally {
      setSavingAddress(false);
    }
  };

  const deleteAddress = async (id: string) => {
    setDeletingAddressId(id);
    try {
      const res = await fetch(`/api/account/addresses?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not remove address');
      setUser(json.user);
      toast.success('Address removed');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not remove address');
    } finally {
      setDeletingAddressId(null);
    }
  };

  const setDefaultAddress = async (address: ShippingAddress) => {
    try {
      const res = await fetch('/api/account/addresses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...address, id: address._id, isDefault: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not update default address');
      setUser(json.user);
      toast.success('Default address updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update default address');
    }
  };

  if (!user) {
    // Keep the bridge mounted even after logout clears `user`, so a pending Clerk
    // sign-out trigger still fires instead of being unmounted away.
    return CLERK_ENABLED ? <ClerkSignOutBridge trigger={clerkSignOutTrigger} /> : null;
  }

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

          {/* Refund details needed — top of the page so it can't be missed */}
          {refundActions.length > 0 && (
            <section aria-labelledby="refund-action-title" className="mb-8 border-2 border-gold/60 bg-gold/5 p-4 sm:p-5" data-testid="account-refund-action">
              <h2 id="refund-action-title" className="font-cinzel text-sm tracking-widest uppercase text-deep">
                Action needed · Share your refund details
              </h2>
              <p className="mt-1 mb-4 font-lato text-sm text-[var(--text-mid)] leading-relaxed">
                {refundActions.length === 1 ? 'Your refund is ready to be sent.' : `You have ${refundActions.length} refunds ready to be sent.`} Please tell us the UPI ID or bank
                account where you&apos;d like to receive the money — it goes only to the account you share here.
              </p>
              <div className="space-y-4">
                {refundActions.map((o) => (
                  <div key={o.orderId}>
                    <p className="mb-2 font-lato text-xs text-[var(--text-mid)]">
                      Order <span className="font-semibold text-deep">{o.orderId}</span>
                    </p>
                    <RefundPanel orderId={o.orderId} phone="" refund={o.refund!} isLoggedIn onSaved={loadOrders} />
                  </div>
                ))}
              </div>
            </section>
          )}
          {refundActions.length === 0 && refundsInReview.length > 0 && (
            <div className="mb-8 space-y-3" data-testid="account-refund-status">
              {refundsInReview.map((o) => (
                <div key={o.orderId}>
                  <p className="mb-1 font-lato text-xs text-[var(--text-mid)]">
                    Order <span className="font-semibold text-deep">{o.orderId}</span>
                  </p>
                  <RefundPanel orderId={o.orderId} phone="" refund={o.refund!} isLoggedIn onSaved={loadOrders} />
                </div>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard icon={Package} label="My Orders" value={loadingOrders ? '–' : stats.total} onClick={() => setActiveTab('orders')} accent="bg-teal/10 text-teal" />
            <StatCard icon={Truck} label="On the way" value={loadingOrders ? '–' : stats.active} onClick={() => setActiveTab('orders')} accent="bg-gold/15 text-gold-dark" />
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
                {(orders as AccountOrder[]).map((order) => (
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
                      <div data-testid="account-delivery-code">
                        <DeliveryCode delivery={order.delivery} status={order.status} className="mt-3" />
                      </div>
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
                {cartItems.length > 1 && (
                  <label className="flex items-center gap-2 p-4 border-b border-[var(--border)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={deselectedIds.length === 0}
                      onChange={() => (deselectedIds.length === 0 ? deselectAllCart() : selectAllCart())}
                      className="w-4 h-4 accent-gold-dark"
                    />
                    <span className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)]">
                      {deselectedIds.length === 0 ? 'All items selected' : `Select all (${cartSelectedItems.length}/${cartItems.length} selected)`}
                    </span>
                  </label>
                )}
                <ul className="divide-y divide-[var(--border)]">
                  {cartItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-4 p-4">
                      <label className="shrink-0" aria-label={`Select ${item.name} for checkout`}>
                        <input
                          type="checkbox"
                          checked={!deselectedIds.includes(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          className="w-4 h-4 accent-gold-dark"
                        />
                      </label>
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
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.id)}
                        aria-label={`Remove ${item.name} from cart`}
                        className="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-[var(--border)] bg-cream/50">
                  <p className="font-lato text-sm text-deep">
                    Subtotal {deselectedIds.length > 0 && `(${cartSelectedItems.length} item${cartSelectedItems.length === 1 ? '' : 's'})`}:{' '}
                    <strong className="font-cinzel">{formatINR(cartSelectedSubtotal)}</strong>
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={openCart} className="btn-outline-gold">Edit Cart</button>
                    {cartSelectedItems.length > 0 ? (
                      <Link href="/checkout" className="btn-gold">Checkout ({cartSelectedItems.length})</Link>
                    ) : (
                      <span className="btn-gold opacity-40 pointer-events-none" aria-disabled="true">Checkout</span>
                    )}
                  </div>
                </div>
              </div>
            )
          )}

          {/* Profile */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="bg-white border border-[var(--border)] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-cinzel text-sm font-semibold text-deep">Personal Details</h2>
                  {!editingProfile && (
                    <button
                      type="button"
                      onClick={startEditProfile}
                      className="flex items-center gap-1.5 font-cinzel text-[10px] tracking-widest uppercase text-gold-dark hover:text-gold transition-colors"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  )}
                </div>

                {editingProfile ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-1 block">Name</label>
                      <input
                        className="divine-input text-sm w-full"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                        maxLength={80}
                      />
                    </div>
                    <div>
                      <label className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-1 block">Email</label>
                      <input
                        type="email"
                        className="divine-input text-sm w-full"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-1 block">Phone</label>
                      <input
                        className="divine-input text-sm w-full"
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                        maxLength={10}
                      />
                    </div>
                    <div className="sm:col-span-2 flex gap-2 mt-1">
                      <button type="button" onClick={saveProfile} disabled={savingProfile} className="btn-gold disabled:opacity-50">
                        {savingProfile ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button type="button" onClick={() => setEditingProfile(false)} disabled={savingProfile} className="btn-outline-gold">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-1 flex items-center gap-1"><UserIcon size={11} /> Name</p>
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
                  </div>
                )}
              </div>

              {/* Address book */}
              <div className="bg-white border border-[var(--border)] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-cinzel text-sm font-semibold text-deep flex items-center gap-1.5"><MapPin size={14} /> Saved Addresses</h2>
                  {!addressForm && (
                    <button
                      type="button"
                      onClick={() => setAddressForm({ ...EMPTY_ADDRESS })}
                      className="flex items-center gap-1.5 font-cinzel text-[10px] tracking-widest uppercase text-gold-dark hover:text-gold transition-colors"
                    >
                      <Plus size={12} /> Add Address
                    </button>
                  )}
                </div>

                {addressForm && (
                  <div className="border border-[var(--border)] p-4 mb-4 bg-cream/40">
                    <AddressFormFields value={addressForm} onChange={setAddressForm} />
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={saveAddress} disabled={savingAddress} className="btn-gold disabled:opacity-50">
                        {savingAddress ? 'Saving…' : addressForm._id ? 'Update Address' : 'Save Address'}
                      </button>
                      <button type="button" onClick={() => setAddressForm(null)} disabled={savingAddress} className="btn-outline-gold flex items-center gap-1">
                        <X size={13} /> Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!user.addresses || user.addresses.length === 0 ? (
                  <p className="font-crimson italic text-sm text-[var(--text-mid)]">
                    No saved addresses yet. Add one here, or save it during checkout.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {user.addresses.map((addr) => (
                      <li key={addr._id} className="border border-[var(--border)] p-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-lato text-sm text-deep font-semibold flex items-center gap-2">
                            {addr.fullName}
                            {addr.isDefault && (
                              <span className="flex items-center gap-1 font-cinzel text-[9px] uppercase tracking-wider text-gold-dark bg-gold/15 px-1.5 py-0.5 rounded-full">
                                <Star size={9} fill="currentColor" /> Default
                              </span>
                            )}
                          </p>
                          <p className="font-lato text-xs text-[var(--text-mid)] mt-1">
                            {[addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                          </p>
                          <p className="font-lato text-xs text-[var(--text-mid)]">+91 {addr.phone}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0 font-cinzel text-[9px] uppercase tracking-wider">
                          <div className="flex gap-3">
                            <button type="button" onClick={() => setAddressForm(addr)} className="text-gold-dark hover:text-gold flex items-center gap-1">
                              <Pencil size={11} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAddress(addr._id!)}
                              disabled={deletingAddressId === addr._id}
                              className="text-red-500 hover:text-red-700 flex items-center gap-1 disabled:opacity-50"
                            >
                              <Trash2 size={11} /> Remove
                            </button>
                          </div>
                          {!addr.isDefault && (
                            <button type="button" onClick={() => setDefaultAddress(addr)} className="text-[var(--text-mid)] hover:text-gold-dark">
                              Set as default
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer settings={null} />
    </>
  );
}
