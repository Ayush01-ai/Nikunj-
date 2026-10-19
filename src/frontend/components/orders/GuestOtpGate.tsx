'use client';

import { useState } from 'react';

/**
 * Proves a guest owns an order by verifying a one-time code sent to the order's phone.
 * Calls `onVerified` with a short-lived, server-signed proof bound to this order + phone.
 */
export function GuestOtpGate({
  orderId,
  phone,
  prompt = 'For your security, verify the phone number on this order first.',
  onVerified,
}: {
  orderId: string;
  phone: string;
  prompt?: string;
  onVerified: (proof: string) => void;
}) {
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

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
      if (!ok || !json.guestProof) return setError(json.error || 'Incorrect code. Please try again.');
      onVerified(json.guestProof);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 max-w-sm" data-testid="guest-otp-gate">
      <p className="text-xs">{prompt}</p>
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
      {info && !error && <p className="text-xs text-green-700">{info}</p>}
      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
