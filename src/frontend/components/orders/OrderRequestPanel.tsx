'use client';

import React, { useEffect, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import {
  CANCEL_REASONS,
  MAX_PHOTO_BYTES,
  MAX_REQUEST_PHOTOS,
  PHOTO_REQUIRED_REASONS,
  RETURN_REASONS,
  type CancelRequestInfo,
} from '@/cms/lib/orderRequests';

export interface RequestableOrder {
  orderId: string;
  status: string;
  canCancel?: boolean;
  canReturn?: boolean;
  returnDaysLeft?: number | null;
  returnWindowDays?: number;
  cancelRequest?: CancelRequestInfo | null;
  returnRequest?: { reasonCategory?: string; requestedAt?: string; rejectedReason?: string; rejectedAt?: string; photoCount?: number } | null;
}

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

/** Small, understated cancel / return request link + form shown under an order. */
export function OrderRequestPanel({ order, phone, onSubmitted }: { order: RequestableOrder; phone: string; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const type: 'cancel' | 'return' | null = order.canCancel ? 'cancel' : order.canReturn ? 'return' : null;
  const reasons: readonly string[] = type === 'cancel' ? CANCEL_REASONS : RETURN_REASONS;
  const photoRequired = type === 'return' && PHOTO_REQUIRED_REASONS.includes(reason);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError('');
    const picked = Array.from(list).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (picked.length < list.length) setError('Only JPG, PNG or WEBP photos are accepted.');
    if (picked.some((f) => f.size > MAX_PHOTO_BYTES)) {
      setError('Each photo must be under 5 MB.');
      return;
    }
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_REQUEST_PHOTOS));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    if (!reason) return setError('Please choose a reason.');
    if (reason === 'Other' && details.trim().length < 5) return setError('Please tell us a little more about the reason.');
    if (photoRequired && files.length === 0) return setError('Please attach at least one photo so we can verify the issue.');
    setBusy(true);
    setError('');
    const body = new FormData();
    body.set('orderId', order.orderId);
    body.set('phone', phone);
    body.set('type', type);
    body.set('reasonCategory', reason);
    body.set('details', details.trim());
    files.forEach((f) => body.append('photos', f));
    try {
      const res = await fetch('/api/orders/request', { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not submit your request. Please try again.');
        return;
      }
      setDone(json.message);
      setOpen(false);
      onSubmitted();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const cr = order.cancelRequest;
  const rr = order.returnRequest;
  const statusNote =
    cr?.state === 'pending'
      ? `Cancellation requested on ${formatDate(cr.requestedAt)} — awaiting review.`
      : cr?.state === 'rejected'
        ? `Cancellation request not approved${cr.decisionNote ? `: ${cr.decisionNote}` : '.'}`
        : rr?.rejectedAt && order.status === 'delivered'
          ? `Return request not approved${rr.rejectedReason ? `: ${rr.rejectedReason}` : '.'}`
          : null;

  if (!type && !statusNote && !done) return null;

  return (
    <div className="text-center font-lato text-xs text-[var(--text-mid)]" data-testid="order-request">
      {done && <p className="text-green-700 mb-2" role="status">{done}</p>}
      {statusNote && !done && <p className="mb-2">{statusNote}</p>}

      {type && !open && !done && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="underline underline-offset-2 decoration-dotted hover:text-deep transition-colors"
        >
          {type === 'cancel'
            ? 'Need to cancel this order?'
            : `Return or report an issue${order.returnDaysLeft != null ? ` (${order.returnDaysLeft} day${order.returnDaysLeft === 1 ? '' : 's'} left)` : ''}`}
        </button>
      )}

      {type && open && (
        <form onSubmit={submit} className="mt-2 text-left bg-white border border-[var(--border)] p-4 sm:p-5 space-y-3 max-w-xl mx-auto" noValidate>
          <div className="flex items-start justify-between gap-3">
            <p className="font-cinzel text-[11px] tracking-widest uppercase text-deep">
              {type === 'cancel' ? 'Request cancellation' : 'Request a return'}
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 -m-1 hover:text-deep">
              <X size={14} />
            </button>
          </div>
          <p className="leading-relaxed">
            {type === 'cancel'
              ? 'Orders can be cancelled until they are handed to the courier. Our team will confirm, and any online payment is refunded to the original method in 5–7 working days.'
              : `Returns are accepted within ${order.returnWindowDays ?? 7} days of delivery for damaged, defective or wrong items. Please add clear photos — our team verifies every request before arranging pickup and refund.`}
          </p>

          <label className="block">
            <span className="block mb-1 font-semibold text-deep">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="divine-input w-full text-sm" required>
              <option value="">Choose a reason…</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block mb-1 font-semibold text-deep">
              Details {reason !== 'Other' && <span className="font-normal">(optional)</span>}
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
              rows={3}
              className="divine-input w-full text-sm"
              placeholder={type === 'cancel' ? 'Anything we should know?' : 'Describe the issue (which item, what is wrong)…'}
            />
          </label>

          {type === 'return' && (
            <div>
              <span className="block mb-1 font-semibold text-deep">
                Photos {photoRequired ? <span className="text-red-700">*</span> : <span className="font-normal">(optional)</span>}{' '}
                <span className="font-normal">— up to {MAX_REQUEST_PHOTOS}, 5 MB each</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {previews.map((src, i) => (
                  <div key={src} className="relative w-16 h-16 border border-[var(--border)] bg-cream">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                    <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute -top-1.5 -right-1.5 bg-deep text-white rounded-full p-0.5"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {files.length < MAX_REQUEST_PHOTOS && (
                  <label className="w-16 h-16 border border-dashed border-gold/60 flex flex-col items-center justify-center cursor-pointer hover:bg-cream text-gold-dark">
                    <ImagePlus size={18} aria-hidden="true" />
                    <span className="text-[9px] mt-0.5">Add</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-700" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={busy} className="btn-gold text-[11px] px-4 py-2 disabled:opacity-60">
              {busy ? 'Sending…' : 'Submit request'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="underline hover:text-deep">
              {type === 'cancel' ? 'Keep my order' : 'Not now'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
