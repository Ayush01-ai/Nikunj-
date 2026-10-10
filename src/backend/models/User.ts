import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  phone?: string;
  name?: string;
  email?: string;
  /** bcrypt hash; never selected by default */
  passwordHash?: string;
  googleId?: string;
  /** Clerk user ID (e.g. "user_xxx"), set once an account is linked to or created via Clerk. Additive only. */
  clerkUserId?: string;
  avatar?: string;
  emailVerified?: boolean;
  authProviders: ('phone' | 'email' | 'google' | 'clerk')[];
  /** sha256 of the emailed reset token; never selected by default */
  resetTokenHash?: string;
  resetTokenExpires?: Date;
  role: 'user' | 'admin';
  addresses: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
    isDefault?: boolean;
  }[];
  wishlist: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema({
  fullName:  { type: String, required: true },
  phone:     { type: String, required: true },
  line1:     { type: String, required: true },
  line2:     { type: String },
  city:      { type: String, required: true },
  state:     { type: String, required: true },
  pincode:   { type: String, required: true },
  landmark:  { type: String },
  isDefault: { type: Boolean, default: false },
});

const UserSchema = new Schema<IUser>(
  {
    // Phone is optional now that users can sign up with email or Google.
    phone:    { type: String },
    name:     { type: String, trim: true },
    email:    { type: String, lowercase: true, trim: true },
    passwordHash:      { type: String, select: false },
    googleId:          { type: String },
    clerkUserId:       { type: String },
    avatar:            { type: String },
    emailVerified:     { type: Boolean, default: false },
    authProviders:     [{ type: String, enum: ['phone', 'email', 'google', 'clerk'] }],
    resetTokenHash:    { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    role:     { type: String, enum: ['user', 'admin'], default: 'user' },
    addresses: [AddressSchema],
    wishlist: [{ type: String }],
  },
  { timestamps: true },
);

// Partial unique indexes: uniqueness only applies when the field is present,
// so many email-only users (no phone) can coexist.
UserSchema.index({ phone: 1 }, { name: 'phone_unique', unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
UserSchema.index({ email: 1 }, { name: 'email_unique', unique: true, partialFilterExpression: { email: { $type: 'string' } } });
UserSchema.index({ googleId: 1 }, { name: 'google_unique', unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });
UserSchema.index({ clerkUserId: 1 }, { name: 'clerk_unique', unique: true, partialFilterExpression: { clerkUserId: { $type: 'string' } } });

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

let indexesReady: Promise<void> | null = null;

/**
 * Older deployments created a plain unique `phone_1` index, which rejects a
 * second user without a phone. Swap it for the partial index once per process.
 */
export function ensureUserIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      try {
        const existing = await User.collection.indexes();
        const legacy = existing.find((ix) => ix.name === 'phone_1');
        if (legacy) await User.collection.dropIndex('phone_1');
        await User.createIndexes();
      } catch (err) {
        indexesReady = null;
        console.error('[User indexes]', err);
      }
    })();
  }
  return indexesReady;
}