import React, { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connectDB } from '@/backend/lib/mongodb';
import { Order } from '@/backend/models/Order';
import { UpiPayment } from './UpiPayment';

export const metadata: Metadata = {
  title: 'Complete Your Payment',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

async function loadOrder(orderId: string) {
  try {
    await connectDB();
    return await Order.findOne({ orderId }).select('orderId total paymentMethod paymentStatus').lean();
  } catch {
    return null;
  }
}

async function SuccessContent({ orderId }: { orderId: string }) {
  const order = await loadOrder(orderId);
  if (!order) notFound();
  // COD and already-paid orders have nothing to pay here.
  if (order.paymentMethod === 'cod' || order.paymentStatus === 'paid') {
    redirect(`/confirmation?orderId=${encodeURIComponent(orderId)}`);
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 pt-10 pb-12">
      <div className="max-w-lg w-full text-center">
        <h1 className="font-cinzel text-2xl font-semibold text-deep mb-2">Complete Your Payment</h1>
        <p className="font-lato text-sm text-[var(--text-mid)] mb-6">
          Order <strong>#{order.orderId}</strong> is placed. Pay the exact amount below via UPI.
        </p>
        <UpiPayment orderId={order.orderId} totalAmount={order.total} />
        <div className="mt-6">
          <Link prefetch={false} href="/" className="btn-outline-gold inline-block">Back to Home</Link>
        </div>
      </div>
    </div>
  );
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  if (!orderId || !/^NS-[A-Za-z0-9_-]{8}$/.test(orderId)) notFound();
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <SuccessContent orderId={orderId} />
    </Suspense>
  );
}
