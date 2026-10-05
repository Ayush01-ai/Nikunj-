import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOtp extends Document {
  phone: string;
  otp: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

const OtpSchema = new Schema<IOtp>(
  {
    phone:     { type: String, required: true, index: true },
    otp:       { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts:  { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Auto-delete expired OTPs via MongoDB TTL index
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp: Model<IOtp> =
  mongoose.models.Otp || mongoose.model<IOtp>('Otp', OtpSchema);
