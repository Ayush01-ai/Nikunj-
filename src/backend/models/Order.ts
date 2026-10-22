import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOrder extends Document {
  orderId: string;
  userId?: mongoose.Types.ObjectId;
  guestPhone?: string;
  items: {
    productId: string;
    name: string;
    image: string;
    price: number;
    quantity: number;
    selectedSize?: string;
    selectedColor?: string;
  }[];
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
  };
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  total: number;
  couponCode?: string;
  paymentMethod: 'upi' | 'card' | 'netbanking' | 'cod' | 'whatsapp';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  /** Gateway-agnostic field — which online gateway (if any) is handling this order's payment. Unset for COD. */
  paymentGateway?: 'razorpay' | 'cashfree';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  /** Cashfree order id, returned by PGCreateOrder and echoed back on webhooks/verify. */
  cashfreeOrderId?: string;
  /** The payment_session_id used by the Cashfree Checkout JS SDK to open the hosted payment UI. */
  cashfreePaymentSessionId?: string;
  cashfreePaymentId?: string;
  /** UPI transaction reference (UTR / RRN) the customer reports after paying via the manual UPI link. */
  upiReference?: string;
  upiReferenceAt?: Date;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'return_requested' | 'return_approved' | 'returned' | 'refunded';
  notes?: string;
  /** True while this order's quantities are reserved but not yet decremented in Sanity. */
  stockHeld?: boolean;
  /** Verified notification destination captured when the order was placed (see orderNotify.ts). */
  notification?: {
    channel: 'email' | 'whatsapp' | 'none';
    method: string;
    email?: string;
    phone?: string;
    reason?: string;
    capturedAt: Date;
  };
  /** Idempotency log of order notifications already sent (no contact details). */
  notificationLog?: { key: string; channel: string; at: Date }[];
  /** Delivery-partner hand-off: secret link token + OTP verification state. */
  delivery?: {
    token?: string;
    partnerName?: string;
    assignedAt?: Date;
    otpSentAt?: Date;
    /** Meta WhatsApp message id of the delivery OTP and its last provider-reported status. */
    otpMessageId?: string;
    /** "skipped" = WhatsApp not configured, nothing was sent. */
    otpStatus?: 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
    attempts?: number;
    verifiedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema({
  productId:     { type: String, required: true },
  name:          { type: String, required: true },
  image:         { type: String, default: '' },
  price:         { type: Number, required: true },
  quantity:      { type: Number, required: true, min: 1 },
  selectedSize:  { type: String },
  selectedColor: { type: String },
});

const ShippingAddressSchema = new Schema({
  fullName: { type: String, required: true },
  phone:    { type: String, required: true },
  line1:    { type: String, required: true },
  line2:    { type: String },
  city:     { type: String, required: true },
  state:    { type: String, required: true },
  pincode:  { type: String, required: true },
  landmark: { type: String },
});

const OrderSchema = new Schema<IOrder>(
  {
    orderId:       { type: String, required: true, unique: true, index: true },
    userId:        { type: Schema.Types.ObjectId, ref: 'User' },
    guestPhone:    { type: String },
    items:         { type: [OrderItemSchema], required: true },
    shippingAddress: { type: ShippingAddressSchema, required: true },
    subtotal:      { type: Number, required: true },
    deliveryCharge: { type: Number, default: 0 },
    discount:      { type: Number, default: 0 },
    total:         { type: Number, required: true },
    couponCode:    { type: String, uppercase: true },
    paymentMethod: {
      type: String,
      enum: ['upi', 'card', 'netbanking', 'cod', 'whatsapp'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    razorpayOrderId:  { type: String },
    razorpayPaymentId: { type: String },
    paymentGateway: { type: String, enum: ['razorpay', 'cashfree'] },
    cashfreeOrderId: { type: String },
    cashfreePaymentSessionId: { type: String },
    cashfreePaymentId: { type: String },
    upiReference: { type: String, maxlength: 32 },
    upiReferenceAt: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'return_requested', 'return_approved', 'returned', 'refunded'],
      default: 'pending',
    },
    notes: { type: String },
    stockHeld: { type: Boolean, default: false },
    notification: {
      channel:    { type: String, enum: ['email', 'whatsapp', 'none'] },
      method:     { type: String },
      email:      { type: String, lowercase: true },
      phone:      { type: String },
      reason:     { type: String },
      capturedAt: { type: Date },
    },
    notificationLog: [{ _id: false, key: String, channel: String, at: Date }],
    delivery: {
      token:       { type: String },
      partnerName: { type: String },
      assignedAt:  { type: Date },
      otpSentAt:   { type: Date },
      otpMessageId: { type: String },
      otpStatus:   { type: String, enum: ['accepted', 'sent', 'delivered', 'read', 'failed', 'skipped'] },
      attempts:    { type: Number, default: 0 },
      verifiedAt:  { type: Date },
    },
  },
  { timestamps: true },
);

// Index for admin queries
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ guestPhone: 1 });
// Webhook lookups are by Cashfree order id; sparse so legacy/COD orders without one aren't indexed.
OrderSchema.index({ cashfreeOrderId: 1 }, { sparse: true });
OrderSchema.index({ 'delivery.token': 1 }, { sparse: true });
OrderSchema.index({ 'delivery.otpMessageId': 1 }, { sparse: true });
OrderSchema.index({ stockHeld: 1, createdAt: -1 });

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
