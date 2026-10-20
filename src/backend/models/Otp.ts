import mongoose, { Schema, Document, Model } from 'mongoose';
import { hashOtp } from '@/backend/lib/otpHash';

export interface IOtp extends Document {
  phone: string;
  /** Keyed hash of the code (`h1:…`, see otpHash.ts) — never the plain code. */
  otp: string;
  expiresAt: Date;
  attempts: number;
  /** Delivery channel. Defaults to 'sms' (MSG91) for full backward compatibility with
   *  existing records/queries; 'whatsapp' is used by the new WhatsApp OTP login flow so
   *  the two never collide for the same phone number. */
  channel: 'sms' | 'whatsapp';
  /** What this OTP authorizes. Defaults to 'login' for full backward compatibility with
   *  every existing record/query; 'guest_payment' is scoped to a single order (see
   *  `orderId`) and is used only to prove guest ownership before a payment is created —
   *  it never establishes a login session. */
  purpose: 'login' | 'guest_payment';
  /** Only set for `purpose: 'guest_payment'` — binds this OTP to one order so a code
   *  verified for order A can never be reused to authorize payment on order B. */
  orderId?: string;
  createdAt: Date;
}

const OtpSchema = new Schema<IOtp>(
  {
    phone:     { type: String, required: true, index: true },
    otp:       { type: String, required: true, set: hashOtp },
    expiresAt: { type: Date, required: true },
    attempts:  { type: Number, default: 0 },
    channel:   { type: String, enum: ['sms', 'whatsapp'], default: 'sms' },
    purpose:   { type: String, enum: ['login', 'guest_payment'], default: 'login' },
    orderId:   { type: String },
  },
  { timestamps: true },
);

// Auto-delete expired OTPs via MongoDB TTL index
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp: Model<IOtp> =
  mongoose.models.Otp || mongoose.model<IOtp>('Otp', OtpSchema);
