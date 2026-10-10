import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOtp extends Document {
  phone: string;
  otp: string;
  expiresAt: Date;
  attempts: number;
  /** Delivery channel. Defaults to 'sms' (MSG91) for full backward compatibility with
   *  existing records/queries; 'whatsapp' is used by the new WhatsApp OTP login flow so
   *  the two never collide for the same phone number. */
  channel: 'sms' | 'whatsapp';
  createdAt: Date;
}

const OtpSchema = new Schema<IOtp>(
  {
    phone:     { type: String, required: true, index: true },
    otp:       { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts:  { type: Number, default: 0 },
    channel:   { type: String, enum: ['sms', 'whatsapp'], default: 'sms' },
  },
  { timestamps: true },
);

// Auto-delete expired OTPs via MongoDB TTL index
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp: Model<IOtp> =
  mongoose.models.Otp || mongoose.model<IOtp>('Otp', OtpSchema);
