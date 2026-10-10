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
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'return_requested' | 'return_approved' | 'returned' | 'refunded';
  notes?: string;
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
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'return_requested', 'return_approved', 'returned', 'refunded'],
      default: 'pending',
    },
    notes: { type: String },
  },
  { timestamps: true },
);

// Index for admin queries
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ guestPhone: 1 });

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
