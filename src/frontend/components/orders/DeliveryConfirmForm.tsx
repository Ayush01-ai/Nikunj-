'use client';

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ApiReply {
  success?: boolean;
  error?: string;
  message?: string;
  attemptsLeft?: number;
}

/** Delivery partner enters the customer's WhatsApp code to mark the order delivered. */
export function DeliveryConfirmForm({ token, delivered, locked, codAmount }: { token: string; delivered: boolean; locked: boolean; codAmount: number }) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [done, setDone] = useState(delivered);
  const [isLocked, setIsLocked] = useState(locked);

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as ApiReply;
    return { res, json };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setInfo('');
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code the customer received on WhatsApp.');
      return;
    }
    setBusy(true);
    try {
      const { res, json } = await post('/api/delivery/verify', { token, otp });
      if (res.ok && json.success) setDone(true);
      else {
        setError(json.error || 'Could not confirm. Please try again.');
        if (res.status === 423 || json.attemptsLeft === 0) setIsLocked(true);
      }
    } catch {
      setError('No internet connection? Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const { json } = await post('/api/delivery/resend', { token });
      if (json.success) setInfo(json.message || 'Code sent again to the customer on WhatsApp.');
      else setError(json.error || 'Could not resend the code.');
    } catch {
      setError('No internet connection? Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-5 flex items-start gap-3 border border-green-300 bg-green-50 p-4 text-green-800" role="status" data-testid="delivery-confirmed">
        <CheckCircle2 size={22} className="shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Delivered — thank you!</p>
          <p className="text-xs mt-1">
            The order is marked delivered and the customer has been informed.{codAmount ? ' Please hand over the cash collected to the shop.' : ''}
          </p>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <p className="mt-5 border border-red-300 bg-red-50 p-3 text-red-800" role="alert" data-testid="delivery-locked">
        Too many wrong codes — this link is locked. Please call the shop to confirm the delivery.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
      <label className="block">
        <span className="block font-semibold">Customer&apos;s delivery code</span>
        <span className="block text-xs text-[var(--text-mid)] mb-2">
          Hand over the parcel{codAmount ? ' and collect the cash' : ''}, then ask the customer for the 6-digit code they received on WhatsApp.
        </span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="divine-input w-full text-center text-2xl tracking-[0.5em] font-semibold"
          aria-label="6-digit delivery code"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'deliver-error' : undefined}
          data-testid="delivery-otp-input"
        />
      </label>
      {error && (
        <p id="deliver-error" className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="text-xs text-green-700" role="status">
          {info}
        </p>
      )}
      <button type="submit" disabled={busy || otp.length !== 6} className="btn-divine w-full justify-center disabled:opacity-50">
        {busy ? 'Please wait…' : 'Confirm delivery'}
      </button>
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        className="w-full text-xs underline underline-offset-2 text-[var(--text-mid)] hover:text-deep disabled:opacity-50"
      >
        Customer didn&apos;t get the code? Send it again
      </button>
    </form>
  );
}
