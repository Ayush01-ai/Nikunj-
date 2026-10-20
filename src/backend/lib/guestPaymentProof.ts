import jwt from 'jsonwebtoken';
import { sanitizePhone } from '@/backend/lib/auth';

/**
 * Short-lived, server-signed proof that a guest has verified OTP ownership of the phone
 * number on a specific order. This replaces "knowing the phone number" as sufficient
 * authorization to create a payment for a guest order (see orderAccess.ts).
 *
 * Reuses JWT_SECRET, which the app already requires at boot (src/backend/lib/auth.ts) —
 * no new secret/env var is introduced. jsonwebtoken's `verify()` gives us tamper
 * detection and expiry enforcement for free.
 */

const JWT_SECRET = process.env.JWT_SECRET as string;
const PROOF_PURPOSE = 'guest_payment' as const;
const PROOF_TTL_SECONDS = 15 * 60; // 15 minutes — enough to finish checkout after OTP verification

export function createGuestPaymentProof(orderId: string, phone: string): string {
  return jwt.sign(
    { orderId, phone: sanitizePhone(phone), purpose: PROOF_PURPOSE },
    JWT_SECRET,
    { expiresIn: PROOF_TTL_SECONDS },
  );
}

/**
 * Verifies that `token` is a non-expired, unmodified proof issued for exactly this
 * `orderId` + `phone` pair. Returns false (never throws) for missing, malformed,
 * expired, tampered, or mismatched tokens so callers can fail closed uniformly.
 */
export function verifyGuestPaymentProof(token: unknown, orderId: string, phone: string): boolean {
  if (typeof token !== 'string' || !token) return false;
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    return (
      decoded.purpose === PROOF_PURPOSE &&
      decoded.orderId === orderId &&
      decoded.phone === sanitizePhone(phone)
    );
  } catch {
    return false;
  }
}
