'use client';

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const inr = (n: number) => n.toLocaleString('en-IN');

export function UpiPayment({
  orderId,
  totalAmount,
  reportedReference,
}: {
  orderId: string;
  totalAmount: number;
  reportedReference?: string;
}) {
  // Amount is formatted to two decimals as required by the NPCI UPI deep-link spec.
  const upiLink =
    'upi://pay?pa=8299851148@ibl&pn=Nikunj%20Sakhi&tr=' +
    encodeURIComponent(orderId) +
    '&am=' +
    totalAmount.toFixed(2) +
    '&cu=INR';

  return (
    <div className="bg-white border border-[var(--border)] p-6">
      {/* Mobile: open the native UPI app with the amount locked */}
      <div className="md:hidden">
        <a
          href={upiLink}
          data-testid="upi-pay-button"
          className="btn-gold block w-full py-4 text-base text-center"
        >
          Pay ₹{inr(totalAmount)} via GPay/PhonePe
        </a>
      </div>

      {/* Desktop: scannable QR generated from the same link */}
      <div className="hidden md:flex flex-col items-center" data-testid="upi-qr">
        <QRCodeSVG value={upiLink} size={250} level="M" marginSize={2} />
        <p className="font-cinzel text-lg text-gold-dark mt-3">₹{inr(totalAmount)}</p>
        <p className="font-lato text-xs text-[var(--text-mid)] mt-2">
          Scanning from a laptop? Use your phone&apos;s camera or UPI app to scan this code.
        </p>
      </div>

      <p className="font-lato text-xs text-[var(--text-mid)] mt-4" data-testid="upi-retry-hint">
        Payment failed or app closed? No money is taken for a failed payment — just pay again using the same
        button / QR. Please don&apos;t pay twice for a successful payment.
      </p>

      <UtrForm orderId={orderId} initial={reportedReference} />

      <p className="font-lato text-xs text-[var(--text-mid)] mt-5 pt-4 border-t border-[var(--border)]">
        Your order #{orderId} is placed securely! We will manually verify your payment and process the order within a few hours.
      </p>
    </div>
  );
}

function UtrForm({ orderId, initial }: { orderId: string; initial?: string }) {
  const [utr, setUtr] = useState('');
  const [saved, setSaved] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = utr.replace(/\s+/g, '');
    if (!/^\d{12}$/.test(value)) {
      setError('Enter the 12-digit UPI reference / UTR number shown in your UPI app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/orders/upi-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, utr: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not save the reference. Please try again.');
        return;
      }
      setSaved(value);
      setUtr('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-5 pt-4 border-t border-[var(--border)] text-left" data-testid="utr-form">
      <label htmlFor="utr" className="block font-lato text-sm font-semibold text-deep mb-1">
        Already paid? Share your UPI reference (optional)
      </label>
      <p className="font-lato text-xs text-[var(--text-mid)] mb-2">
        It helps us find your payment faster. You&apos;ll find the 12-digit UTR / reference number in your UPI app&apos;s
        payment history.
      </p>
      {saved && (
        <p className="font-lato text-xs text-green-700 mb-2" role="status" data-testid="utr-saved">
          ✓ Reference {saved} received — we&apos;ll verify it shortly.
        </p>
      )}
      <div className="flex gap-2">
        <input
          id="utr"
          name="utr"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          value={utr}
          onChange={(e) => setUtr(e.target.value.replace(/[^\d\s]/g, ''))}
          placeholder="e.g. 412345678901"
          className="divine-input flex-1 min-w-0"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'utr-error' : undefined}
        />
        <button type="submit" disabled={busy} className="btn-gold px-4 disabled:opacity-60">
          {busy ? 'Saving…' : saved ? 'Update' : 'Submit'}
        </button>
      </div>
      {error && (
        <p id="utr-error" className="font-lato text-xs text-red-600 mt-1" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
