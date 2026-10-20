import { constants, publicEncrypt } from 'crypto';
import { cashfreeEnvironment } from '@/backend/lib/cashfreeConfig';

/**
 * Cashfree Payouts (v2) — sends refunds for Cash-on-Delivery / manual payments straight to the
 * customer's UPI ID or bank account. Needs its own Payouts credentials (different from the PG keys)
 * and either a whitelisted server IP or the Payouts public key (for the x-cf-signature header).
 */
export function isPayoutsConfigured(): boolean {
  return Boolean(process.env.CASHFREE_PAYOUT_CLIENT_ID && process.env.CASHFREE_PAYOUT_CLIENT_SECRET);
}

const baseUrl = () =>
  cashfreeEnvironment() === 'PRODUCTION' ? 'https://api.cashfree.com/payout' : 'https://sandbox.cashfree.com/payout';

function signature(clientId: string): string | undefined {
  const raw = process.env.CASHFREE_PAYOUT_PUBLIC_KEY;
  if (!raw) return undefined;
  const key = raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8');
  const payload = `${clientId}.${Math.floor(Date.now() / 1000)}`;
  return publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(payload)).toString('base64');
}

function headers(): Record<string, string> {
  const clientId = process.env.CASHFREE_PAYOUT_CLIENT_ID ?? '';
  const sig = signature(clientId);
  return {
    'Content-Type': 'application/json',
    'x-client-id': clientId,
    'x-client-secret': process.env.CASHFREE_PAYOUT_CLIENT_SECRET ?? '',
    'x-api-version': '2024-01-01',
    ...(sig ? { 'x-cf-signature': sig } : {}),
  };
}

export type PayoutOutcome = 'success' | 'processing' | 'failed';

export interface PayoutResult {
  outcome: PayoutOutcome;
  transferId: string;
  cfTransferId?: string;
  utr?: string;
  status?: string;
  message?: string;
}

export class PayoutRequestError extends Error {
  constructor(
    message: string,
    /** True when we can't tell whether Cashfree accepted the transfer (network error / 5xx) — sync instead of retrying. */
    readonly uncertain: boolean,
  ) {
    super(message);
  }
}

export function mapTransferStatus(status?: string): PayoutOutcome {
  const s = (status ?? '').toUpperCase();
  if (s === 'SUCCESS' || s === 'COMPLETED') return 'success';
  if (s === 'FAILED' || s === 'REJECTED' || s === 'REVERSED') return 'failed';
  return 'processing';
}

interface TransferResponse {
  transfer_id?: string;
  cf_transfer_id?: string;
  status?: string;
  status_code?: string;
  status_description?: string;
  transfer_utr?: string;
  message?: string;
  code?: string;
}

function toResult(transferId: string, body: TransferResponse): PayoutResult {
  return {
    outcome: mapTransferStatus(body.status),
    transferId,
    cfTransferId: body.cf_transfer_id,
    utr: body.transfer_utr,
    status: body.status,
    message: body.status_description ?? body.status_code ?? body.message,
  };
}

export interface PayoutRequest {
  transferId: string;
  amount: number;
  mode: 'upi' | 'bank';
  name: string;
  phone?: string;
  upiId?: string;
  accountNumber?: string;
  ifsc?: string;
  remarks?: string;
}

export async function createPayoutTransfer(req: PayoutRequest): Promise<PayoutResult> {
  const instrument =
    req.mode === 'upi' ? { vpa: req.upiId } : { bank_account_number: req.accountNumber, bank_ifsc: req.ifsc };
  const phone = req.phone?.replace(/\D/g, '').slice(-10);
  const body = {
    transfer_id: req.transferId,
    transfer_amount: Math.round(req.amount * 100) / 100,
    transfer_currency: 'INR',
    transfer_mode: req.mode === 'upi' ? 'upi' : 'imps',
    beneficiary_details: {
      beneficiary_name: req.name.replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Customer',
      beneficiary_instrument_details: instrument,
      ...(phone && phone.length === 10 ? { beneficiary_contact_details: { beneficiary_phone: phone } } : {}),
    },
    transfer_remarks: (req.remarks ?? 'Refund').replace(/[^A-Za-z0-9 ]/g, ' ').slice(0, 70),
  };

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/transfers`, { method: 'POST', headers: headers(), body: JSON.stringify(body), cache: 'no-store' });
  } catch (error) {
    throw new PayoutRequestError(error instanceof Error ? error.message : 'Network error', true);
  }
  const json = (await res.json().catch(() => ({}))) as TransferResponse;
  if (res.status >= 500) throw new PayoutRequestError(json.message ?? `Cashfree Payouts error ${res.status}`, true);
  if (!res.ok) {
    // Duplicate transfer id = we already sent it earlier; report the existing transfer's status.
    if (res.status === 409 || /already exists/i.test(json.message ?? '')) return getPayoutTransfer(req.transferId);
    throw new PayoutRequestError(json.message ?? `Cashfree Payouts rejected the transfer (${res.status})`, false);
  }
  return toResult(req.transferId, json);
}

export async function getPayoutTransfer(transferId: string): Promise<PayoutResult> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/transfers?transfer_id=${encodeURIComponent(transferId)}`, {
      headers: headers(),
      cache: 'no-store',
    });
  } catch (error) {
    throw new PayoutRequestError(error instanceof Error ? error.message : 'Network error', true);
  }
  const json = (await res.json().catch(() => ({}))) as TransferResponse;
  if (res.status === 404) return { outcome: 'failed', transferId, message: 'Transfer not found at Cashfree' };
  if (!res.ok) throw new PayoutRequestError(json.message ?? `Cashfree Payouts error ${res.status}`, true);
  return toResult(transferId, json);
}
