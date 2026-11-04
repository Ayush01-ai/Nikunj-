'use client';

import { CashfreeCheckout } from '@/app/checkout/CashfreeCheckout';

export function ConfirmationPayment({ orderId, isGuest }: { orderId: string; isGuest: boolean }) {
  return (
    <CashfreeCheckout
      orderId={orderId}
      isGuest={isGuest}
      onComplete={() => window.location.reload()}
    />
  );
}
