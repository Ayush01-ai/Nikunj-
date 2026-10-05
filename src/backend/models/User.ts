import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  phone: string;
  name?: string;
  email?: string;
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
    phone:    { type: String, required: true, unique: true, index: true },
    name:     { type: String },
    email:    { type: String, lowercase: true },
    role:     { type: String, enum: ['user', 'admin'], default: 'user' },
    addresses: [AddressSchema],
    wishlist: [{ type: String }],
  },
  { timestamps: true },
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
