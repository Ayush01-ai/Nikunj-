import { createHmac, timingSafeEqual } from 'crypto';

/**
 * One-time codes are stored as a keyed hash so a database leak alone doesn't reveal live codes.
 * Stored format: `h1:<hex HMAC-SHA256>`. Records written before hashing was introduced (plain digits)
 * are still accepted until their short TTL expires.
 */
const PREFIX = 'h1:';

function otpKey(): string {
  const secret = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET;
  if (secret) return secret;
  // Delivery codes are derived from a token the delivery partner holds, so the key must never be guessable.
  if (process.env.NODE_ENV === 'production') throw new Error('OTP_HASH_SECRET (or JWT_SECRET) must be set');
  return 'nikunj-sakhi-otp-dev';
}

export const isHashedOtp = (value: string) => value.startsWith(PREFIX);

const digest = (code: string) => PREFIX + createHmac('sha256', otpKey()).update(String(code)).digest('hex');

/** Hash for storage; already-hashed values pass through so re-saving a document doesn't double-hash. */
export function hashOtp(code: string): string {
  return isHashedOtp(code) ? code : digest(code);
}

/** Constant-time comparison of a stored (hashed or legacy plain) code with what the user typed. */
export function otpMatches(stored: string | undefined | null, input: string): boolean {
  if (!stored || !input || isHashedOtp(input)) return false;
  const expected = Buffer.from(stored);
  const given = Buffer.from(isHashedOtp(stored) ? digest(input) : input);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Delivery OTP for an order hand-off. Derived from the secret delivery token, so it's never stored:
 * a new token (re-assigning the delivery) automatically means a new code.
 */
export function deliveryOtp(orderId: string, token: string): string {
  const mac = createHmac('sha256', otpKey()).update(`delivery:${orderId}:${token}`).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}