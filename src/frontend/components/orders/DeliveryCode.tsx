'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export type DeliveryOtpStatus = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | null | undefined;

/** Honest WhatsApp status for the delivery code — never claims delivery that the provider has not confirmed. */
export function deliveryStatusText(status: DeliveryOtpStatus, sentAt?: string | null): string {
  if (status === 'failed') return 'We could not send the code to your WhatsApp. Use the code shown here.';
  if (status === 'delivered' || status === 'read') return 'Code delivered to the WhatsApp number on this order.';
  if (status === 'sent' || status === 'accepted' || sentAt) return 'Code sent to the WhatsApp number on this order (delivery not yet confirmed).';
  return 'WhatsApp delivery of the code has not been confirmed. Use the code shown here.';
}

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Delivery code copied' : 'Copy delivery code'}
      data-testid="copy-delivery-code"
      className="inline-flex items-center gap-1 border border-gold/60 px-2 py-0.5 font-lato text-xs text-deep hover:bg-gold/10"
    >
      {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
