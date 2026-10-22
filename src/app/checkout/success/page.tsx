import React, { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { ORDER_ID_PATTERN } from '@/backend/lib/orderAccess';
import { getSanityOrder, resyncOrderToSanity } from '@/backend/lib/sanityOrders';
import { UpiPayment } from './UpiPayment';

export const metadata: Metadata = {
  title: 'Complete Your Payment',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface OrderSummary {
  orderId: string;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  upiReference?: string;
}

async function loadOrder(orderId: string): Promise<OrderSummary | null> {
  try {
    await connectDB();
    return await Order.findOne({ orderId })
      .select('orderId total paymentMethod paymentStatus status upiReference')
      .lean<OrderSummary>();
  } catch {
    return null;
  }
}

const inr = (n: number) => n.toLocaleString('en-IN');

async function SuccessContent({ orderId }: { orderId: string }) {
  const [order, managed] = await Promise.all([loadOrder(orderId), getSanityOrder(orderId)]);
  if (!order) notFound();
  // First sync to Studio failed (e.g. missing token) — retry so the owner can see and confirm it.
  if (!managed) await resyncOrderToSanity(orderId);
  if (order.paymentMethod === 'cod') redirect(`/confirmation?orderId=${encodeURIComponent(orderId)}`);

  // The owner's decision in Studio is the source of truth; the website copy is the fallback.
  const status = managed?.status ?? order.status;
  const paid = (managed?.paymentStatus ?? order.paymentStatus) === 'paid';
  const trackHref = `/track-order?id=${encodeURIComponent(order.orderId)}`;

  if (status === 'cancelled') {
    return (
      <Shell>
        <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" aria-hidden />
        <h1 className="font-cinzel text-2xl font-semibold text-deep mb-2" data-testid="order-state">Order Cancelled</h1>
        <p className="font-lato text-sm text-[var(--text-mid)] mb-6">
          Order <strong>#{order.orderId}</strong> was cancelled
          {paid ? '. Your refund is being processed.' : ' because we could not verify a payment for it. If money was debited from your account, please contact us with your UPI reference and we will help right away.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link prefetch={false} href="/products" className="btn-gold inline-block">Shop Again</Link>
          <Link prefetch={false} href="/contact" className="btn-outline-gold inline-block">Contact Us</Link>
        </div>
      </Shell>
    );
  }

  if (paid || status !== 'pending') {
    return (
      <Shell>
        <CheckCircle className="w-14 h-14 text-green-600 mx-auto mb-4" aria-hidden />
        <h1 className="font-cinzel text-2xl font-semibold text-deep mb-2" data-testid="order-state">Payment Received 🙏</h1>
        <p className="font-lato text-sm text-[var(--text-mid)] mb-6">
          Your payment of <strong>₹{inr(order.total)}</strong> for order <strong>#{order.orderId}</strong> is verified and your order is confirmed.
          We&apos;ll keep you updated as it is packed and shipped.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link prefetch={false} href={trackHref} className="btn-gold inline-block">Track Order</Link>
          <Link prefetch={false} href="/products" className="btn-outline-gold inline-block">Continue Shopping</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-cinzel text-2xl font-semibold text-deep mb-2" data-testid="order-state">Complete Your Payment</h1>
      <p className="font-lato text-sm text-[var(--text-mid)] mb-6">
        Order <strong>#{order.orderId}</strong> is placed. Pay the exact amount below via UPI.
      </p>
      <UpiPayment
        orderId={order.orderId}
        totalAmount={order.total}
        reportedReference={managed?.upiReference ?? order.upiReference}
      />
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        {/* Plain anchor: a full reload re-reads the latest status the owner set. */}
        <a href={`/checkout/success?orderId=${encodeURIComponent(order.orderId)}`} className="btn-outline-gold inline-block">
          Refresh payment status
        </a>
        <Link prefetch={false} href="/" className="btn-outline-gold inline-block">Back to Home</Link>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 pt-10 pb-12">
      <div className="max-w-lg w-full text-center">{children}</div>
    </div>
  );
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  if (!orderId || !ORDER_ID_PATTERN.test(orderId)) notFound();
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <SuccessContent orderId={orderId} />
    </Suspense>
  );
}
