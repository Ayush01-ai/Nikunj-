'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, Package, Search, Truck, XCircle } from 'lucide-react';
import { DeliveryCode, type DeliveryCodeView } from '@/frontend/components/orders/DeliveryCode';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { useAuthStore } from '@/frontend/store/authStore';
import { fetchWithRetry } from '@/frontend/lib/fetchRetry';
import { useSiteSettings } from '@/frontend/providers/Providers';
import { ORDER_STATUS_LABEL, ORDER_STEPS, isReturnStatus } from '@/cms/lib/orderMessages';
import { OrderRequestPanel, type RequestableOrder } from '@/frontend/components/orders/OrderRequestPanel';
import { RefundPanel, type RefundView } from '@/frontend/components/orders/RefundPanel';
import { getWhatsAppHref } from '@/frontend/lib/whatsapp';

interface TrackedOrder extends RequestableOrder {
  orderId: string;
  status: string;
  placedAt: string;
  statusHistory: { status: string; at: string; note?: string }[];
  tracking: { courier?: string; trackingNumber?: string; trackingUrl?: string } | null;
  items: { productName?: string; image?: string; option?: string; colour?: string; price?: number; quantity?: number }[];
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  shipTo: { name?: string; city?: string; state?: string; pincode?: string };
  refund?: RefundView | null;
  delivery?: DeliveryCodeView | null;
}

const inr = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;
const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

function TrackOrderContent() {
  const params = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const { settings } = useSiteSettings();
  const [orderId, setOrderId] = useState(params.get('id')?.toUpperCase() ?? '');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Phone that unlocked the current order; re-used to authorise cancel / return requests.
  const [verifiedPhone, setVerifiedPhone] = useState('');

  const lookup = useCallback(
    async (id: string, mobile: string) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetchWithRetry('/api/track-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: id, phone: mobile }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          setOrder(null);
          setError(json.error || 'Could not load your order.');
          return;
        }
        setOrder(json.data);
        setVerifiedPhone(mobile);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Signed-in customers arriving from "My Orders" don't need to type anything.
  useEffect(() => {
    const id = params.get('id');
    if (id && isAuthenticated) void lookup(id.toUpperCase(), user?.phone ?? '');
  }, [params, isAuthenticated, user?.phone, lookup]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void lookup(orderId.trim().toUpperCase(), phone.trim());
  };

  const cancelled = order?.status === 'cancelled';
  const currentStep = order ? ORDER_STEPS.indexOf(order.status as (typeof ORDER_STEPS)[number]) : -1;
  const whatsapp = settings?.whatsappNumber;

  return (
    <main className="min-h-screen bg-cream pt-10 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <p className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold-dark mb-2">Order Status</p>
          <h1 className="font-cinzel text-2xl sm:text-3xl font-semibold text-deep">Track Your Order</h1>
          <p className="font-crimson italic text-[var(--text-mid)] mt-2">
            Enter the order ID from your confirmation and the mobile number used at checkout.
          </p>
        </div>

        <form onSubmit={onSubmit} className="bg-white/90 border border-gold/30 shadow-gold-sm p-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)]">Order ID</span>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value.toUpperCase())}
              placeholder="NS-AB12CD34"
              className="divine-input uppercase"
              autoComplete="off"
              maxLength={11}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)]">
              Mobile Number {isAuthenticated && <span className="normal-case tracking-normal">(optional when signed in)</span>}
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9XXXXXXXXX"
              type="tel"
              inputMode="numeric"
              className="divine-input"
              autoComplete="tel-national"
            />
          </label>
          <button type="submit" disabled={loading} className="btn-gold flex items-center justify-center gap-2 h-[46px] disabled:opacity-60">
            <Search size={14} aria-hidden="true" /> {loading ? 'Checking…' : 'Track'}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 text-center text-red-700 font-lato text-sm">{error}</p>
        )}

        {order && (
          <section aria-live="polite" className="mt-8 space-y-6">
            {/* Summary */}
            <div className="bg-white border border-[var(--border)] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-cinzel text-sm font-semibold text-gold-dark">{order.orderId}</p>
                  <p className="font-lato text-xs text-[var(--text-mid)] mt-1">Placed on {formatDate(order.placedAt)}</p>
                </div>
                <span
                  className={`font-cinzel text-[10px] tracking-widest uppercase px-3 py-1.5 ${
                    cancelled ? 'bg-red-100 text-red-800' : order.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-gold/15 text-gold-dark'
                  }`}
                >
                  {ORDER_STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>

              {/* Progress */}
              {cancelled ? (
                <p className="mt-6 flex items-center gap-2 text-red-800 font-lato text-sm">
                  <XCircle size={18} aria-hidden="true" /> This order was cancelled.
                  {(order.paymentStatus === 'refund_due' || order.paymentStatus === 'refunded') && !order.refund && ' Your refund is being processed.'}
                </p>
              ) : order.status === 'pending' ? (
                <p className="mt-6 font-lato text-sm text-[var(--text-mid)]">We are waiting for your payment to be confirmed.</p>
              ) : isReturnStatus(order.status) ? (
                <p className="mt-6 flex items-center gap-2 text-amber-800 font-lato text-sm">
                  <Package size={18} aria-hidden="true" /> {ORDER_STATUS_LABEL[order.status]}.
                  {order.status === 'refunded' ? ' Your refund has been completed.' : ' We will keep you updated on WhatsApp.'}
                </p>
              ) : (
                <ol className="mt-8 grid grid-cols-4" aria-label="Order progress">
                  {ORDER_STEPS.map((step, i) => {
                    const done = i <= currentStep;
                    return (
                      <li key={step} className="relative flex flex-col items-center text-center" aria-current={i === currentStep ? 'step' : undefined}>
                        {i > 0 && (
                          <span aria-hidden="true" className={`absolute top-4 right-1/2 w-full h-0.5 ${i <= currentStep ? 'bg-gold-dark' : 'bg-gold/20'}`} />
                        )}
                        <span
                          className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                            done ? 'bg-gold-dark border-gold-dark text-white' : 'bg-white border-gold/30 text-[var(--text-mid)]'
                          }`}
                        >
                          {done ? <Check size={14} aria-hidden="true" /> : <span className="text-xs">{i + 1}</span>}
                        </span>
                        <span className={`mt-2 font-cinzel text-[10px] tracking-wider ${done ? 'text-deep font-semibold' : 'text-[var(--text-mid)]'}`}>
                          {ORDER_STATUS_LABEL[step]}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Doorstep delivery code — directly below the timeline */}
            <DeliveryCode
              delivery={order.delivery}
              status={order.status}
              amountDue={order.paymentMethod === 'cod' && order.paymentStatus !== 'paid' ? inr(order.total) : undefined}
            />

            {/* Tracking */}
            {order.tracking && (order.tracking.trackingNumber || order.tracking.courier) && (
              <div className="bg-white border border-gold/40 p-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Truck size={22} className="text-gold-dark" aria-hidden="true" />
                  <div>
                    <p className="font-cinzel text-xs tracking-widest uppercase text-deep">{order.tracking.courier || 'Courier'}</p>
                    {order.tracking.trackingNumber && (
                      <p className="font-lato text-sm text-[var(--text-mid)]">Tracking no: <span className="text-deep font-semibold">{order.tracking.trackingNumber}</span></p>
                    )}
                  </div>
                </div>
                {order.tracking.trackingUrl?.startsWith('https://') && (
                  <a href={order.tracking.trackingUrl} target="_blank" rel="noopener noreferrer" className="btn-outline-gold">
                    Track Parcel
                  </a>
                )}
              </div>
            )}

            {/* History */}
            {order.statusHistory.length > 0 && (
              <div className="bg-white border border-[var(--border)] p-6">
                <h2 className="font-cinzel text-sm font-semibold text-deep mb-4">Order Updates</h2>
                <ul className="space-y-3">
                  {[...order.statusHistory].reverse().map((h, i) => (
                    <li key={`${h.status}-${h.at}-${i}`} className="flex gap-3">
                      <span aria-hidden="true" className="mt-1.5 w-2 h-2 rounded-full bg-gold-dark flex-shrink-0" />
                      <div>
                        <p className="font-lato text-sm text-deep font-semibold">{ORDER_STATUS_LABEL[h.status] ?? h.status}</p>
                        <p className="font-lato text-xs text-[var(--text-mid)]">
                          {formatDate(h.at)}
                          {h.note && ` · ${h.note}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Items */}
            <div className="bg-white border border-[var(--border)] p-6">
              <h2 className="font-cinzel text-sm font-semibold text-deep mb-4 flex items-center gap-2">
                <Package size={16} className="text-gold-dark" aria-hidden="true" /> Items
              </h2>
              <ul className="divide-y divide-[var(--border)]">
                {order.items.map((item, i) => (
                  <li key={`${item.productName}-${i}`} className="py-3 flex gap-4 items-center">
                    <div className="relative w-14 h-14 bg-cream flex-shrink-0 overflow-hidden">
                      {item.image?.startsWith('https://cdn.sanity.io/') && (
                        <Image src={item.image} alt="" fill sizes="56px" className="object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-crimson text-base text-deep font-semibold">{item.productName}</p>
                      <p className="font-lato text-xs text-[var(--text-mid)]">
                        {[item.option, item.colour].filter(Boolean).join(' · ') || 'Standard'} · Qty {item.quantity}
                      </p>
                    </div>
                    <span className="font-cinzel text-sm text-gold-dark">{inr((item.price ?? 0) * (item.quantity ?? 1))}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 pt-4 border-t border-[var(--border)] space-y-1.5 font-lato text-sm">
                <div className="flex justify-between"><dt className="text-[var(--text-mid)]">Subtotal</dt><dd>{inr(order.subtotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--text-mid)]">Delivery</dt><dd>{order.deliveryCharge ? inr(order.deliveryCharge) : 'FREE'}</dd></div>
                {order.discount > 0 && (
                  <div className="flex justify-between"><dt className="text-[var(--text-mid)]">Discount</dt><dd className="text-green-700">−{inr(order.discount)}</dd></div>
                )}
                <div className="flex justify-between font-semibold text-deep pt-1"><dt>Total</dt><dd>{inr(order.total)}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--text-mid)]">Payment</dt><dd>{order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online'} · {order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus === 'refund_due' ? 'Refund due' : order.paymentStatus === 'refunded' ? 'Refunded' : 'Pending'}</dd></div>
              </dl>
              {order.shipTo?.city && (
                <p className="mt-4 font-lato text-xs text-[var(--text-mid)]">
                  Delivering to {order.shipTo.name}, {order.shipTo.city}, {order.shipTo.state} {order.shipTo.pincode}
                </p>
              )}
            </div>

            {whatsapp && (
              <p className="text-center font-crimson italic text-[var(--text-mid)]">
                Questions about this order?{' '}
                <a
                  href={getWhatsAppHref(whatsapp, `Namaste 🙏 I have a question about my order ${order.orderId}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-dark underline"
                >
                  Chat with us on WhatsApp
                </a>
              </p>
            )}
            {order.refund && (
              <RefundPanel
                orderId={order.orderId}
                phone={verifiedPhone}
                refund={order.refund}
                isLoggedIn={isAuthenticated}
                onSaved={() => void lookup(order.orderId, verifiedPhone)}
              />
            )}
            <OrderRequestPanel order={order} phone={verifiedPhone} isLoggedIn={isAuthenticated} onSubmitted={() => void lookup(order.orderId, verifiedPhone)} />
          </section>
        )}

        <p className="mt-10 text-center">
          <Link prefetch={false} href="/collections" className="font-cinzel text-[10px] tracking-widest uppercase text-gold-dark hover:text-deep">
            Continue Shopping →
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function TrackOrderPage() {
  return (
    <>
      <Navbar settings={null} />
      <Suspense fallback={<main className="min-h-screen bg-cream" />}>
        <TrackOrderContent />
      </Suspense>
      <Footer settings={null} />
    </>
  );
}
