'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

const inr = (n: number) => n.toLocaleString('en-IN');

export function UpiPayment({ orderId, totalAmount }: { orderId: string; totalAmount: number }) {
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

      <p className="font-lato text-xs text-[var(--text-mid)] mt-5 pt-4 border-t border-[var(--border)]">
        Your order #{orderId} is placed securely! We will manually verify your payment and process the order within a few hours.
      </p>
    </div>
  );
}
