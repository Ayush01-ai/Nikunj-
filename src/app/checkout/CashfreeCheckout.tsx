'use client';

import Script from 'next/script';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { GuestOtpGate } from '@/frontend/components/orders/GuestOtpGate';

interface CashfreeCheckoutProps {
  orderId: string;
  phone?: string;
  isGuest: boolean;
  initialGuestProof?: string;
  onComplete: () => void;
  onCancel?: () => void;
}

interface CashfreeInstance {
  checkout(options: { paymentSessionId: string; redirectTarget?: string }): Promise<unknown>;
}

declare global {
  interface Window {
    Cashfree?: (options: { mode: 'sandbox' | 'production' }) => CashfreeInstance;
  }
}

export function CashfreeCheckout({
  orderId,
  phone,
  isGuest,
  initialGuestProof,
  onComplete,
  onCancel,
}: CashfreeCheckoutProps) {
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guestProof, setGuestProof] = useState(initialGuestProof ?? '');

  const startPayment = async () => {
    if (!window.Cashfree) {
      toast.error('Secure checkout is still loading. Please try again.');
      return;
    }

    setBusy(true);
    try {
      const createResponse = await fetch('/api/payment/cashfree/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, guestProof }),
      });
      const createResult = await createResponse.json();
      if (!createResponse.ok || !createResult.success || !createResult.data?.paymentSessionId) {
        throw new Error(createResult.error || 'Could not start secure checkout.');
      }

      const environment = createResult.data.environment === 'production' ? 'production' : 'sandbox';
      const cashfree = window.Cashfree({ mode: environment });
      await cashfree.checkout({
        paymentSessionId: createResult.data.paymentSessionId,
        redirectTarget: '_self',
      });

      const verifyResponse = await fetch('/api/payment/cashfree/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, guestProof }),
      });
      const verifyResult = await verifyResponse.json();
      if (verifyResult.status === 'paid') {
        onComplete();
      } else if (verifyResult.status === 'pending') {
        onComplete();
      } else if (verifyResponse.status === 402) {
        toast.error(verifyResult.error || 'Payment was not completed. You can try again.');
      } else {
        throw new Error(verifyResult.error || 'Could not verify the payment.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Secure checkout failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Script
        src="https://sdk.cashfree.com/js/v3/cashfree.js"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => toast.error('Could not load Cashfree checkout. Please refresh and try again.')}
      />
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-mid)]">
          Your order is saved. Complete your secure Cashfree payment to confirm it.
        </p>
        {isGuest && !guestProof && (
          <GuestOtpGate
            orderId={orderId}
            phone={phone}
            prompt="Verify the phone number on your order before continuing to payment."
            onVerified={setGuestProof}
          />
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={startPayment} disabled={!scriptReady || busy || (isGuest && !guestProof)} className="btn-gold flex-1 disabled:opacity-60">
            {busy ? 'Connecting to Cashfree…' : scriptReady ? 'Pay securely with Cashfree' : 'Loading secure checkout…'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={busy} className="btn-outline-gold flex-1 disabled:opacity-60">
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  );
}
