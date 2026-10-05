import Razorpay from 'razorpay';
import crypto from 'crypto';

const KEY_ID = process.env.RAZORPAY_KEY_ID!;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;

if (!KEY_ID || !KEY_SECRET) {
  throw new Error('Razorpay keys not configured in environment variables');
}

export const razorpay = new Razorpay({
  key_id: KEY_ID,
  key_secret: KEY_SECRET,
});

export interface CreateOrderOptions {
  amount: number; // in rupees
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

/** Create a Razorpay order — amount in RUPEES (not paise) */
export async function createRazorpayOrder(options: CreateOrderOptions) {
  const order = await razorpay.orders.create({
    amount: Math.round(options.amount * 100), // convert to paise
    currency: options.currency || 'INR',
    receipt: options.receipt.slice(0, 40),
    notes: options.notes,
  });
  return order;
}

/** Verify payment signature — MUST be verified server-side */
export function verifyPaymentSignature(params: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): boolean {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params;
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(body)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
  const signatureBuffer = Buffer.from(razorpay_signature, 'utf-8');

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
