import type { Metadata } from 'next';
import { findOrderByDeliveryToken, MAX_ATTEMPTS, TOKEN_PATTERN } from '@/backend/lib/delivery';
import { getSanityOrder } from '@/backend/lib/sanityOrders';
import { DeliveryConfirmForm } from '@/frontend/components/orders/DeliveryConfirmForm';

export const metadata: Metadata = {
  title: 'Confirm delivery',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--cream,#fdf8ee)] px-4 py-8 font-lato text-sm text-deep">
      <div className="mx-auto max-w-md">
        <p className="font-cinzel text-[11px] tracking-[0.3em] uppercase text-gold-dark text-center">Nikunj Sakhi · Delivery</p>
        <div className="mt-4 bg-white border border-[var(--border)] p-5 shadow-sm">{children}</div>
      </div>
    </main>
  );
}

/** Secret page the delivery partner opens from WhatsApp to confirm a doorstep delivery with the customer's code. */
export default async function DeliverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = TOKEN_PATTERN.test(token) ? await findOrderByDeliveryToken(token).catch(() => null) : null;
  if (!order?.delivery?.token) {
    return (
      <Shell>
        <h1 className="font-cinzel text-lg">Link not valid</h1>
        <p className="mt-2 text-[var(--text-mid)]">This delivery link has expired or was replaced. Please ask the shop for the latest link.</p>
      </Shell>
    );
  }

  const managed = await getSanityOrder(order.orderId).catch(() => null);
  const status = managed?.status ?? order.status;
  const paid = (managed?.paymentStatus ?? order.paymentStatus) === 'paid';
  const cod = order.paymentMethod === 'cod' && !paid;
  const a = order.shippingAddress;
  const pieces = order.items.reduce((n, i) => n + i.quantity, 0);
  const delivered = Boolean(order.delivery.verifiedAt) || status === 'delivered';
  const locked = (order.delivery.attempts ?? 0) >= MAX_ATTEMPTS;
  const cancelled = status === 'cancelled';

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-cinzel text-lg">Order {order.orderId}</h1>
        <span className="text-xs text-[var(--text-mid)]">{pieces} pc</span>
      </div>

      {cancelled ? (
        <p className="mt-4 border border-red-300 bg-red-50 p-3 text-red-800 font-semibold" role="alert">
          This order was cancelled. Please do not deliver it — return it to the shop.
        </p>
      ) : (
        <>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs uppercase tracking-wider text-[var(--text-mid)]">Deliver to</dt>
              <dd className="font-semibold">{a.fullName}</dd>
              <dd className="text-[var(--text-mid)] leading-relaxed">
                {[a.line1, a.line2, a.landmark && `Near ${a.landmark}`, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(', ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-[var(--text-mid)]">Phone</dt>
              <dd>
                <a href={`tel:+91${a.phone.replace(/\D/g, '').slice(-10)}`} className="underline underline-offset-2">
                  {a.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-[var(--text-mid)]">Items</dt>
              <dd>
                <ul className="list-disc pl-5">
                  {order.items.map((i, idx) => (
                    <li key={idx}>
                      {i.name}
                      {i.selectedSize ? ` (${i.selectedSize})` : ''} × {i.quantity}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>

          {!delivered && (
            <p
              className={`mt-4 p-3 text-center font-semibold ${cod ? 'bg-amber-50 border border-amber-300 text-amber-900' : 'bg-green-50 border border-green-300 text-green-800'}`}
              data-testid="deliver-collect"
            >
              {cod ? `Collect cash: ${inr(order.total)}` : 'Prepaid — do not collect any money'}
            </p>
          )}

          <DeliveryConfirmForm token={token} delivered={delivered} locked={locked} codAmount={cod ? order.total : 0} />
        </>
      )}
    </Shell>
  );
}
