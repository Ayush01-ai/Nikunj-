import React, { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle, Package, Home, MessageCircle, Search } from 'lucide-react';
import { client } from '@/cms/lib/client';
import { SITE_SETTINGS_QUERY } from '@/cms/lib/queries';
import { orderPlacedMessage } from '@/cms/lib/orderMessages';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { getAdminSettings } from '@/backend/lib/sanityOrders';
import { isCashfreeConfigured } from '@/backend/lib/cashfreeConfig';
import { settleCashfreeOrder } from '@/backend/lib/cashfreeSettlement';
import { createRateLimiter } from '@/backend/lib/rateLimit';
import type { SiteSettings } from '@/types';

export const metadata: Metadata = {
  title: 'Order Confirmation',
  robots: { index: false, follow: false },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nikunjsakhi.com';
const inr = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

async function getOrderSummary(orderId: string) {
  try {
    await connectDB();
    await reconcileCashfreePayment(orderId);
    return await Order.findOne({ orderId }).select('items total paymentMethod paymentStatus status shippingAddress.city').lean();
  } catch {
    return null;
  }
}

// Cashfree's return_url lands here. The redirect itself proves nothing, so a still-unpaid
// Cashfree order is re-checked against Cashfree's API (settleCashfreeOrder only marks it paid
// on a matching PAID order + SUCCESS payment). Throttled per order to bound outbound API calls.
const isReconcileLimited = createRateLimiter(6, 5 * 60 * 1000, 'confirmation:isReconcileLimited');
async function reconcileCashfreePayment(orderId: string) {
  if (!isCashfreeConfigured()) return;
  const order = await Order.findOne({ orderId });
  if (!order || order.paymentStatus === 'paid' || order.paymentGateway !== 'cashfree' || !order.cashfreeOrderId) return;
  if (await isReconcileLimited(`confirm:${orderId}`)) return;
  try {
    await settleCashfreeOrder(order, 'Payment received online (Cashfree)');
  } catch (error) {
    console.error('[confirmation] Cashfree reconcile failed:', error instanceof Error ? error.message : 'unknown');
  }
}

async function ConfirmationContent({ orderId }: { orderId: string }) {
  const [settings, admin, order] = await Promise.all([
    client.fetch<SiteSettings | null>(SITE_SETTINGS_QUERY).catch(() => null),
    getAdminSettings(),
    getOrderSummary(orderId),
  ]);
  const shopWhatsApp = admin.ownerWhatsApp ? `91${admin.ownerWhatsApp}` : settings?.whatsappNumber?.replace(/\D/g, '');
  const items = order?.items.map((i) => ({
    productName: i.name,
    option: i.selectedSize,
    colour: i.selectedColor,
    quantity: i.quantity,
    price: i.price,
  }));
  const message = orderPlacedMessage(
    { orderNumber: orderId, items, total: order?.total, paymentMethod: order?.paymentMethod, city: order?.shippingAddress?.city },
    SITE_URL,
  );
  const awaitingPayment = order?.paymentMethod !== 'cod' && order?.paymentStatus !== 'paid';

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 pt-10 pb-12">
      <div className="max-w-lg w-full text-center">
        {/* Success icon */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-green-600" aria-hidden="true" />
        </div>

        <h1 className="font-cinzel text-2xl font-semibold text-deep mb-2">
          {awaitingPayment ? 'Order Received 🙏' : 'Order Confirmed! 🙏'}
        </h1>
        <p className="font-crimson italic text-[var(--text-mid)] mb-1">Thank you for your divine purchase</p>
        <p className="font-lato text-xs text-[var(--text-mid)]">Your order ID</p>
        <p className="font-cinzel text-lg text-gold-dark font-semibold mb-6 select-all">{orderId}</p>

        {/* Order details */}
        {order && (
          <div className="bg-white border border-[var(--border)] p-6 mb-5 text-left">
            <h2 className="font-cinzel text-xs tracking-widest uppercase text-deep mb-3">Order Details</h2>
            <ul className="divide-y divide-[var(--border)]">
              {order.items.map((i, idx) => (
                <li key={`${i.productId}-${idx}`} className="py-2 flex justify-between gap-3 font-lato text-sm">
                  <span className="text-deep">
                    {i.quantity} × {i.name}
                    {(i.selectedSize || i.selectedColor) && (
                      <span className="block text-xs text-[var(--text-mid)]">{[i.selectedSize, i.selectedColor].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                  <span className="text-gold-dark whitespace-nowrap">{inr(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 pt-3 border-t border-[var(--border)] flex justify-between font-lato text-sm font-semibold text-deep">
              <span>Total</span>
              <span>{inr(order.total)}</span>
            </div>
            <p className="mt-1 font-lato text-xs text-[var(--text-mid)]">
              {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid online'}
              {order.shippingAddress?.city && ` · Delivering to ${order.shippingAddress.city}`}
            </p>
          </div>
        )}

        {/* WhatsApp confirmation */}
        {shopWhatsApp && (
          <div className="bg-[#25D366]/10 border border-[#25D366]/40 p-5 mb-5 text-left">
            <p className="font-lato text-sm text-deep mb-3">
              <strong>Get order updates on WhatsApp:</strong> send us your order details in one tap. We&apos;ll reply on the
              same chat when your order is packed, shipped and delivered.
            </p>
            <a
              href={`https://wa.me/${shopWhatsApp}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#1a8f47] hover:bg-[#157a3c] text-white font-cinzel text-[11px] tracking-widest uppercase py-3 transition-colors"
            >
              <MessageCircle size={15} aria-hidden="true" /> Send Order Details on WhatsApp
            </a>
          </div>
        )}

        {/* What happens next */}
        <div className="bg-white border border-[var(--border)] p-6 mb-6 text-left">
          <div className="flex items-center gap-3 mb-4">
            <Package size={18} className="text-gold-dark" aria-hidden="true" />
            <span className="font-cinzel text-xs tracking-widest uppercase text-deep">What happens next?</span>
          </div>
          <ol className="space-y-3">
            {[
              'We confirm and lovingly pack your order within 24 hours.',
              'Once shipped, you get the courier and tracking number.',
              'Follow every step anytime on the Track Order page with your order ID.',
              'Expected delivery: 5-7 business days.',
            ].map((step, i) => (
              <li key={i} className="flex gap-3 font-crimson text-sm text-[var(--text-mid)]">
                <span className="font-cinzel text-gold-dark font-bold flex-shrink-0">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href={`/track-order?id=${encodeURIComponent(orderId)}`} className="btn-gold flex-1 flex items-center justify-center gap-2">
            <Search size={14} aria-hidden="true" /> Track Order
          </Link>
          <Link href="/" className="btn-outline-gold flex-1 flex items-center justify-center gap-2">
            <Home size={14} aria-hidden="true" /> Back to Home
          </Link>
        </div>

        <p className="font-crimson italic text-xs text-[var(--text-mid)] mt-6">
          Jai Shri Krishna 🙏 Your devotion brings blessings
        </p>
      </div>
    </div>
  );
}

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId: rawOrderId = '' } = await searchParams;
  const orderId = /^NS-[A-Z0-9_-]{8}$/.test(rawOrderId) ? rawOrderId : '';

  if (!orderId) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <p className="font-crimson italic text-[var(--text-mid)] mb-4">No order found.</p>
          <Link href="/" className="btn-gold">Go Home</Link>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <ConfirmationContent orderId={orderId} />
    </Suspense>
  );
}
