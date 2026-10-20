'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';

export type DeliveryOtpStatus = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped' | null | undefined;

export interface DeliveryCodeView {
  otpRequired?: boolean;
  otpSentAt?: string | null;
  otpStatus?: DeliveryOtpStatus;
  code?: string;
  expired?: boolean;
  verifiedAt?: string | null;
}

/** Statuses in which the doorstep code is live ("Shipped" is shown to customers as out for delivery). */
export const OUT_FOR_DELIVERY_STATUSES = ['shipped', 'out_for_delivery'];

/** Honest WhatsApp status for the delivery code — never claims delivery that the provider has not confirmed. */
export function deliveryStatusText(status: DeliveryOtpStatus, sentAt?: string | null): string {
  if (status === 'skipped') return 'WhatsApp messages are not enabled right now, so the code was not sent. Use the code shown here.';
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

/**
 * Doorstep delivery code card. The `code` is only present in API responses for the signed-in order owner;
 * everyone else (phone-number lookups, guests) sees where the code was sent instead.
 */
export function DeliveryCode({
  delivery,
  status,
  amountDue,
  className = '',
}: {
  delivery?: DeliveryCodeView | null;
  status: string;
  /** e.g. "₹1,200" for unpaid COD orders — reminds the customer to pay before sharing the code. */
  amountDue?: string;
  className?: string;
}) {
  if (!delivery?.otpRequired || delivery.verifiedAt || !OUT_FOR_DELIVERY_STATUSES.includes(status)) return null;
  const unsent = delivery.otpStatus === 'failed' || delivery.otpStatus === 'skipped';
  return (
    <div className={`bg-[var(--cream,#fdf8ee)] border border-gold/60 p-6 ${className}`} data-testid="delivery-code-notice">
      <div className="flex items-start gap-3">
        <KeyRound size={22} className="text-gold-dark shrink-0" aria-hidden="true" />
        <div className="space-y-2">
          <p className="font-cinzel text-xs tracking-widest uppercase text-deep">Out for delivery — your delivery code</p>
          {delivery.code ? (
            <div className="font-lato text-sm text-deep space-y-1">
              <p className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-2xl tracking-[0.3em]" data-testid="delivery-code">{delivery.code}</span>
                <CopyCodeButton code={delivery.code} />
              </p>
              <p className="text-xs text-[var(--text-mid)]" data-testid="delivery-otp-status">{deliveryStatusText(delivery.otpStatus, delivery.otpSentAt)}</p>
            </div>
          ) : delivery.expired ? (
            <p className="font-lato text-sm text-deep">Your delivery code has expired. Please contact the shop to get a new one.</p>
          ) : (
            <p className="font-lato text-sm text-deep">
              {unsent
                ? 'We could not send the delivery code to WhatsApp. Sign in to the account that placed this order to see it, or contact the shop.'
                : 'We have sent a 6-digit delivery code to the WhatsApp number on this order. Sign in to the account that placed this order to see it here.'}
            </p>
          )}
          <p className="font-lato text-xs text-[var(--text-mid)] leading-relaxed">
            Share this code with the delivery partner only after you have received your parcel
            {amountDue ? ` and paid ${amountDue} in cash` : ''}. Our team will never ask for it on a call.
          </p>
        </div>
      </div>
    </div>
  );
}
