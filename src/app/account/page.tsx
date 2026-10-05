'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Package, MapPin, Heart, LogOut, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/frontend/store/authStore';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import type { Order } from '@/types';
import { ORDER_STATUS_LABEL } from '@/cms/lib/orderMessages';
import toast from 'react-hot-toast';

type Tab = 'orders' | 'addresses' | 'wishlist';

export default function AccountPage() {
  const router = useRouter();
  const { user, token, isAuthenticated, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login');
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (activeTab === 'orders' && token) {
      setLoadingOrders(true);
      fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } })
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
    }
  }, [activeTab, token, logout]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    logout();
    toast.success('Logged out');
    router.push('/');
  };

  if (!user) return null;

  const tabs = [
    { id: 'orders' as Tab, label: 'My Orders', icon: Package },
    { id: 'addresses' as Tab, label: 'Addresses', icon: MapPin },
    { id: 'wishlist' as Tab, label: 'Wishlist', icon: Heart },
  ];

  return (
    <>
      <Navbar settings={null} />
      <div className="min-h-screen bg-cream pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-cinzel text-2xl font-semibold text-deep">{user.name || 'My Account'}</h1>
            <p className="font-crimson italic text-[var(--text-mid)]">+91 {user.phone}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] hover:text-red-600 transition-colors"
          >
            <LogOut size={14} /> Logout
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--border)] mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-cinzel text-[10px] tracking-widest uppercase transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-gold text-gold -mb-px'
                  : 'text-[var(--text-mid)] hover:text-gold'
              }`}
            >
              <tab.icon size={13} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div>
            {loadingOrders ? (
              <div className="grid gap-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton h-20 rounded" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16">
                <Package size={40} className="text-gold/30 mx-auto mb-4" />
                <p className="font-crimson italic text-[var(--text-mid)]">No orders yet.</p>
                <a href="/collections" className="btn-gold mt-4 inline-block">Shop Now</a>
              </div>
            ) : (
              <div className="grid gap-4">
                {orders.map((order) => (
                  <motion.div
                    key={order._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                  <Link
                    href={`/track-order?id=${encodeURIComponent(order.orderId)}`}
                    aria-label={`Track order ${order.orderId}, status ${ORDER_STATUS_LABEL[order.status] ?? order.status}`}
                    className="bg-white border border-[var(--border)] p-5 flex items-center justify-between hover:border-gold-dark focus-visible:border-gold-dark transition-colors"
                  >
                    <div>
                      <p className="font-cinzel text-xs font-semibold text-gold-dark">{order.orderId}</p>
                      <p className="font-lato text-xs text-[var(--text-mid)] mt-0.5">
                        {order.items.length} item{order.items.length > 1 ? 's' : ''} · ₹{order.total.toLocaleString('en-IN')}
                      </p>
                      <p className="font-lato text-[10px] text-[var(--text-mid)] mt-0.5">
                        {new Date(order.createdAt!).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-cinzel text-[9px] uppercase tracking-wider px-2 py-1 ${
                        order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-gold/10 text-gold-dark'
                      }`}>
                        {ORDER_STATUS_LABEL[order.status] ?? order.status}
                      </span>
                      <ChevronRight size={14} className="text-[var(--text-mid)]" aria-hidden="true" />
                    </div>
                  </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Addresses Tab */}
        {activeTab === 'addresses' && (
          <div className="text-center py-16">
            <MapPin size={40} className="text-gold/30 mx-auto mb-4" />
            <p className="font-crimson italic text-[var(--text-mid)]">Manage addresses during checkout.</p>
          </div>
        )}

        {/* Wishlist Tab */}
        {activeTab === 'wishlist' && (
          <div className="text-center py-16">
            <Heart size={40} className="text-gold/30 mx-auto mb-4" />
            <p className="font-crimson italic text-[var(--text-mid)]">Your wishlist items appear here.</p>
            <a href="/wishlist" className="btn-outline-gold mt-4 inline-block">View Wishlist</a>
          </div>
        )}
      </div>
      </div>
      <Footer settings={null} />
    </>
  );
}
