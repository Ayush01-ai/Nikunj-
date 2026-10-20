'use client';

import React, { useState } from 'react';
import { BadgeIndianRupee, CheckCircle2, Landmark, Smartphone } from 'lucide-react';
import { REFUND_STATE_LABEL, validatePayoutDetails, type RefundSource, type RefundState } from '@/cms/lib/refunds';

export interface RefundView {
  source: RefundSource;
  state: RefundState;
  amount?: number;
  /** Delivery / COD charges not included in this refund. */
  deductedCharges?: number;
  destination?: string | null;
  bankReference?: string | null;
  completedAt?: string | null;
  canSubmitDetails: boolean;
  /** How the customer proves they own the order before sharing bank details. */
  verifyWith: 'account' | 'otp';
}

const inr = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;
const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function stateText(r: RefundView) {
  if (r.source !== 'payout' && (r.state === 'details_submitted' || r.state === 'awaiting_details')) {
    return 'Refund under review — it will go back to your original payment method.';
  }
  if (r.state === 'failed') {
    return r.source === 'payout'
      ? 'We could not send the refund to these details. Please check and share your UPI ID / bank account again.'
      : 'The refund needs attention — our team will contact you shortly.';
  }
  return REFUND_STATE_LABEL[r.state];
}

/** Refund status for a cancelled / returned order + the form where COD customers share their UPI / bank details. */
export function RefundPanel({
  orderId,
  phone,
  refund,
  isLoggedIn,
  onSaved,
}: {
  orderId: string;
  phone: string;
  refund: RefundView;
  isLoggedIn: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(refund.canSubmitDetails && !refund.destination);
  const [mode, setMode] = useState<'upi' | 'bank'>('upi');
  const [form, setForm] = useState({ upiId: '', accountHolder: '', accountNumber: '', confirmAccountNumber: '', ifsc: '' });
  const [guestProof, setGuestProof] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const needsOtp = refund.verifyWith === 'otp' && !guestProof;
  const needsLogin = refund.verifyWith === 'account' && !isLoggedIn;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json.success, json };
  };

  const sendOtp = async () => {
    setBusy(true);
    setError('');
    try {
      const { ok, json } = await post('/api/payment/guest-verify/send-otp', { orderId, phone });
      if (!ok) return setError(json.error || 'Could not send the code. Please try again.');
      setOtpSent(true);
      setInfo(json.message || 'Verification code sent.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmOtp = async () => {
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code.');
    setBusy(true);
    setError('');
    try {
      const { ok, json } = await post('/api/payment/guest-verify/confirm-otp', { orderId, phone, otp });
      if (!ok) return setError(json.error || 'Incorrect code. Please try again.');
      setGuestProof(json.guestProof);
      setInfo('Phone verified.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePayoutDetails({ mode, ...form });
    if (!check.ok) return setError(check.error);
    setBusy(true);
    setError('');
    try {
      const { ok, json } = await post('/api/orders/refund-details', { orderId, phone, guestProof: guestProof || undefined, mode, ...form });
      if (!ok) {
        if (json.needsVerification) setGuestProof('');
        return setError(json.error || 'Could not save your details. Please try again.');
      }
      setInfo(`Saved — refund will be sent to ${json.destination}.`);
      setEditing(false);
      onSaved();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const done = refund.state === 'success';
  return (
    <section className="bg-white border border-[var(--border)] p-5 sm:p-6 font-lato text-sm" aria-labelledby="refund-title" data-testid="refund-panel">
      <div className="flex items-start gap-3">
        {done ? (
          <CheckCircle2 className="text-green-700 shrink-0 mt-0.5" size={20} aria-hidden="true" />
        ) : (
          <BadgeIndianRupee className="text-gold-dark shrink-0 mt-0.5" size={20} aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          <h2 id="refund-title" className="font-cinzel text-xs tracking-widest uppercase text-deep">
            Refund {refund.amount ? `· ${inr(refund.amount)}` : ''}
          </h2>
          <p className={`mt-1 ${done ? 'text-green-800' : refund.state === 'failed' ? 'text-red-800' : 'text-[var(--text-mid)]'}`} role="status">
            {stateText(refund)}
          </p>
          {Boolean(refund.deductedCharges) && (
            <p className="mt-1 text-xs text-[var(--text-mid)]" data-testid="refund-deducted-note">
              This is the item value — the delivery / COD charge of {inr(refund.deductedCharges)} is non-refundable. Thank you for understanding.
            </p>
          )}
          {refund.destination && (
            <p className="mt-1 text-[var(--text-mid)]">
              To: <span className="text-deep font-semibold">{refund.destination}</span>
            </p>
          )}
          {done && (
            <p className="mt-1 text-xs text-[var(--text-mid)]">
              {refund.completedAt && `Completed on ${formatDate(refund.completedAt)}. `}
              {refund.bankReference && `Bank reference: ${refund.bankReference}. `}
              {refund.source !== 'payout' && 'It may take 5–7 working days to reflect in your account.'}
            </p>
          )}
          {refund.state === 'processing' && refund.source !== 'payout' && (
            <p className="mt-1 text-xs text-[var(--text-mid)]">Refunds to cards / UPI / net banking usually reflect in 5–7 working days.</p>
          )}
          {info && !error && <p className="mt-2 text-xs text-green-700">{info}</p>}

          {refund.canSubmitDetails && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs underline underline-offset-2 hover:text-deep">
              {refund.destination ? 'Change refund account' : 'Share UPI / bank details'}
            </button>
          )}
        </div>
      </div>

      {refund.canSubmitDetails && editing && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="text-xs text-[var(--text-mid)] leading-relaxed mb-3">
            You paid by Cash on Delivery, so please tell us where to send your refund. We only use these details for this refund.
          </p>

          {needsLogin ? (
            <p className="text-xs text-deep">Please log in to the account used for this order to share refund details.</p>
          ) : needsOtp ? (
            <div className="space-y-2 max-w-sm">
              <p className="text-xs">For your security, verify the phone number on this order first.</p>
              {!otpSent ? (
                <button type="button" onClick={sendOtp} disabled={busy} className="btn-gold text-[11px] px-4 py-2 disabled:opacity-60">
                  {busy ? 'Sending…' : 'Send verification code'}
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label="6-digit verification code"
                    placeholder="6-digit code"
                    className="divine-input flex-1 text-sm"
                  />
                  <button type="button" onClick={confirmOtp} disabled={busy} className="btn-gold text-[11px] px-4 py-2 disabled:opacity-60">
                    {busy ? '…' : 'Verify'}
                  </button>
                </div>
              )}
              {otpSent && (
                <button type="button" onClick={sendOtp} disabled={busy} className="text-xs underline">
                  Resend code
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3 max-w-md" noValidate>
              <div role="radiogroup" aria-label="Refund method" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['upi', 'UPI ID', Smartphone],
                    ['bank', 'Bank account', Landmark],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => setMode(value)}
                    className={`flex items-center justify-center gap-2 border px-3 py-2 text-xs transition-colors ${
                      mode === value ? 'border-gold-dark bg-cream text-deep font-semibold' : 'border-[var(--border)] hover:border-gold'
                    }`}
                  >
                    <Icon size={14} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>

              {mode === 'upi' ? (
                <>
                  <label className="block">
                    <span className="block mb-1 text-xs font-semibold text-deep">UPI ID</span>
                    <input value={form.upiId} onChange={set('upiId')} placeholder="name@okaxis" autoComplete="off" className="divine-input w-full text-sm" />
                  </label>
                  <label className="block">
                    <span className="block mb-1 text-xs font-semibold text-deep">
                      Name on UPI <span className="font-normal">(optional)</span>
                    </span>
                    <input value={form.accountHolder} onChange={set('accountHolder')} autoComplete="name" className="divine-input w-full text-sm" />
                  </label>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="block mb-1 text-xs font-semibold text-deep">Account holder name</span>
                    <input value={form.accountHolder} onChange={set('accountHolder')} autoComplete="name" className="divine-input w-full text-sm" />
                  </label>
                  <label className="block">
                    <span className="block mb-1 text-xs font-semibold text-deep">Account number</span>
                    <input
                      value={form.accountNumber}
                      onChange={set('accountNumber')}
                      inputMode="numeric"
                      autoComplete="off"
                      className="divine-input w-full text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="block mb-1 text-xs font-semibold text-deep">Confirm account number</span>
                    <input
                      value={form.confirmAccountNumber}
                      onChange={set('confirmAccountNumber')}
                      onPaste={(e) => e.preventDefault()}
                      inputMode="numeric"
                      autoComplete="off"
                      className="divine-input w-full text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="block mb-1 text-xs font-semibold text-deep">IFSC code</span>
                    <input
                      value={form.ifsc}
                      onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase().slice(0, 11) }))}
                      placeholder="SBIN0001234"
                      autoComplete="off"
                      className="divine-input w-full text-sm uppercase"
                    />
                  </label>
                </>
              )}

              <div className="flex items-center gap-3">
                <button type="submit" disabled={busy} className="btn-gold text-[11px] px-4 py-2 disabled:opacity-60">
                  {busy ? 'Saving…' : 'Save refund details'}
                </button>
                {refund.destination && (
                  <button type="button" onClick={() => setEditing(false)} className="text-xs underline hover:text-deep">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}
      {error && (
        <p className="mt-3 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
