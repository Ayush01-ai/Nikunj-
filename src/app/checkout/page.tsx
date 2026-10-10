'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Trash2, Tag, ShieldCheck, Truck, Banknote, Smartphone, CreditCard, Building2 } from 'lucide-react';
import { useCartStore } from '@/frontend/store/cartStore';
import { getVariantPricing } from '@/cms/lib/pricing';
import { useAuthStore } from '@/frontend/store/authStore';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { SacredIcon } from '@/frontend/components/ui/SacredIcon';
import { BackButton } from '@/frontend/components/ui/BackButton';
import type { CartItem } from '@/types';
import toast from 'react-hot-toast';

const STEPS = ['Cart', 'Address', 'Payment'] as const;
type Step = typeof STEPS[number];

const FREE_DELIVERY_THRESHOLD = 999;
const DELIVERY_CHARGE = 99;
const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void };

function loadRazorpay(): Promise<RazorpayCtor> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { Razorpay?: RazorpayCtor };
    if (w.Razorpay) return resolve(w.Razorpay);
    const script = document.createElement('script');
    script.src = RAZORPAY_SRC;
    script.async = true;
    script.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Payment gateway failed to load')));
    script.onerror = () => reject(new Error('Payment gateway failed to load. Check your connection.'));
    document.body.appendChild(script);
  });
}

interface Address {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, updateQuantity, updateItemOptions, removeItem, clearCart, subtotal } = useCartStore();
  const { user } = useAuthStore();

  const [step, setStep] = useState<Step>('Cart');
  const [couponInput, setCouponInput] = useState('');
  const [couponData, setCouponData] = useState<{ code: string; discountAmount: number; message: string } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [address, setAddress] = useState<Address>({
    fullName: user?.name || '',
    phone: user?.phone || '',
    line1: '', city: '', state: '', pincode: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi' | 'card' | 'netbanking'>('cod');
  const [placing, setPlacing] = useState(false);

  const sub = subtotal();
  const delivery = sub >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;
  const discount = couponData?.discountAmount || 0;
  const total = sub + delivery - discount;

  // Cart changed after coupon was applied — discount is no longer valid
  useEffect(() => {
    setCouponData(null);
  }, [sub]);

  const validateCoupon = async () => {
    if (!couponInput.trim()) return;
    setValidatingCoupon(true);
    try {
      const res = await fetch('/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput.trim().toUpperCase(), orderTotal: sub }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCouponData(json.data);
      toast.success(json.data.message);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invalid coupon');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const orderPayload = {
        items: items.map((item: CartItem) => ({
          productId: item.productId,
          productName: item.name,
          image: item.image,
          quantity: item.quantity,
          selectedSize: item.selectedSize,
          selectedColor: item.selectedColor,
        })),
        shippingAddress: address,
        couponCode: couponData?.code,
        paymentMethod,
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify(orderPayload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      if (paymentMethod === 'cod') {
        clearCart();
        router.push(`/confirmation?orderId=${encodeURIComponent(json.orderId)}`);
        setPlacing(false);
      } else {
        const [Razorpay, payRes] = await Promise.all([
          loadRazorpay(),
          fetch('/api/payment/create', {
            method: 'POST',
            headers,
            body: JSON.stringify({ orderId: json.orderId }),
          }),
        ]);
        const pay = await payRes.json();
        if (!payRes.ok || !pay.data) throw new Error(pay.error || 'Could not start payment');

        const rzp = new Razorpay({
          key: pay.data.keyId,
          amount: pay.data.amount,
          currency: pay.data.currency,
          order_id: pay.data.razorpayOrderId,
          name: 'Nikunj Sakhi',
          description: 'Serve with Devotion',
          prefill: { name: address.fullName, contact: `+91${address.phone}` },
          theme: { color: '#C9922A' },
          modal: {
            ondismiss: () => {
              setPlacing(false);
              toast.error('Payment cancelled. Your order is saved as pending.');
            },
          },
          handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              const verifyRes = await fetch('/api/payment/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...response, orderId: json.orderId }),
              });
              const verify = await verifyRes.json();
              if (!verifyRes.ok) throw new Error(verify.error || 'Payment verification failed');
              clearCart();
              router.push(`/confirmation?orderId=${encodeURIComponent(json.orderId)}`);
            } catch (err: unknown) {
              toast.error(
                `${err instanceof Error ? err.message : 'Payment verification failed'}. Contact support with order ${json.orderId}.`,
              );
            } finally {
              setPlacing(false);
            }
          },
        });
        rzp.open();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to place order');
      setPlacing(false);
    }
  };

  if (items.length === 0 && step === 'Cart') {
    return (
      <>
        <Navbar settings={null} />
        <div className="min-h-screen bg-cream flex items-center justify-center pt-8">
          <div className="text-center">
            <p className="font-crimson italic text-[var(--text-mid)] mb-4">Your cart is empty</p>
            <Link href="/collections" className="btn-gold">Shop Now</Link>
          </div>
        </div>
        <Footer settings={null} />
      </>
    );
  }

  return (
    <>
      <Navbar settings={null} />
      <div className="min-h-screen bg-cream">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <BackButton
          fallbackHref="/collections"
          label={step === 'Cart' ? 'Back' : `Back to ${STEPS[STEPS.indexOf(step) - 1]}`}
          onBack={step === 'Cart' ? undefined : () => setStep(STEPS[STEPS.indexOf(step) - 1])}
          className="mb-6"
        />
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`font-cinzel text-[10px] tracking-widest uppercase px-4 py-1.5 transition-all ${
                step === s ? 'bg-gold text-white' : i < STEPS.indexOf(step) ? 'bg-gold/20 text-gold' : 'text-[var(--text-mid)]'
              }`}>
                {i + 1}. {s}
              </div>
              {i < STEPS.length - 1 && <span className="text-[var(--border)]">—</span>}
            </React.Fragment>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {/* ── STEP 1: Cart ── */}
              {step === 'Cart' && (
                <motion.div key="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="font-cinzel text-base font-semibold text-deep mb-4">Your Items</h2>
                  <ul className="space-y-3" aria-label="Items in your cart">
                    {items.map((item: CartItem) => {
                      const href = item.href || `/products/${encodeURIComponent(item.slug)}`;
                      const meta = [item.category, item.productType, item.deity].filter(Boolean).join(' › ');
                      return (
                      <li key={item.id} className="bg-white border border-[var(--border)] p-4 flex gap-4 focus-within:border-gold-dark">
                        {/* Image */}
                        <Link
                          href={href}
                          className="relative w-20 h-[100px] flex-shrink-0 overflow-hidden bg-cream focus-visible:outline-2 focus-visible:outline-gold-dark"
                          aria-label={`View ${item.name}`}
                        >
                          {item.image ? (
                            <Image src={item.image} alt="" fill sizes="80px" className="object-cover hover:scale-105 transition-transform" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-cream-200">
                              <SacredIcon name="lotus" size={24} className="text-gold" />
                            </div>
                          )}
                        </Link>
                        <div className="flex-1 min-w-0">
                          {meta && (
                            <p className="font-cinzel text-[10px] uppercase tracking-widest text-gold-dark truncate">{meta}</p>
                          )}
                          <Link
                            href={href}
                            className="font-crimson text-base font-semibold text-deep hover:text-gold-dark underline-offset-2 hover:underline focus-visible:underline"
                          >
                            {item.name}
                          </Link>
                          <p className="font-lato text-xs text-[var(--text-mid)] mt-0.5">
                            ₹{item.price.toLocaleString('en-IN')} each
                          </p>

                          {/* Choices — editable when the product has options */}
                          <div className="flex flex-wrap gap-3 mt-2">
                            {item.options && item.options.length > 0 ? (
                              <label className="flex flex-col gap-1">
                                <span className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)]">Option</span>
                                <select
                                  value={item.selectedSize ?? ''}
                                  onChange={(e) => updateItemOptions(item.id, { size: e.target.value })}
                                  className="divine-input !py-2 !px-3 text-sm min-h-[40px] min-w-[140px]"
                                >
                                  {!item.selectedSize && <option value="">Choose…</option>}
                                  {item.options.map((o) => {
                                    const opt = getVariantPricing(
                                      { price: item.basePrice ?? item.price, originalPrice: item.baseOriginalPrice, stock: item.productStock ?? item.stock, sizes: item.options, colors: item.colors },
                                      o.label,
                                      item.selectedColor,
                                    );
                                    return (
                                      <option key={o.label} value={o.label} disabled={opt.stock <= 0}>
                                        {o.label} — ₹{opt.price.toLocaleString('en-IN')}
                                        {opt.stock <= 0 ? ' (out of stock)' : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </label>
                            ) : (
                              <p className="font-lato text-xs text-[var(--text-mid)]">
                                Option: <span className="text-deep">{item.selectedSize || 'Standard'}</span>
                              </p>
                            )}
                            {item.colors && item.colors.length > 0 ? (
                              <label className="flex flex-col gap-1">
                                <span className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)]">Colour</span>
                                <select
                                  value={item.selectedColor ?? ''}
                                  onChange={(e) => updateItemOptions(item.id, { color: e.target.value })}
                                  className="divine-input !py-2 !px-3 text-sm min-h-[40px] min-w-[120px]"
                                >
                                  {!item.selectedColor && <option value="">Choose…</option>}
                                  {item.colors.map((c) => (
                                    <option key={c.label} value={c.label}>{c.label}</option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              item.selectedColor && (
                                <p className="font-lato text-xs text-[var(--text-mid)]">
                                  Colour: <span className="text-deep">{item.selectedColor}</span>
                                </p>
                              )
                            )}
                          </div>

                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex items-center border border-[var(--border)]" role="group" aria-label={`Quantity of ${item.name}`}>
                              <button onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} className="w-10 h-10 flex items-center justify-center hover:bg-gold/10 disabled:opacity-40 disabled:cursor-not-allowed" aria-label={`Decrease quantity of ${item.name}`}>
                                <Minus size={12} aria-hidden="true" />
                              </button>
                              <span className="px-3 font-cinzel text-sm" aria-live="polite">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                disabled={item.quantity >= item.stock}
                                className="w-10 h-10 flex items-center justify-center hover:bg-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label={`Increase quantity of ${item.name}`}
                              >
                                <Plus size={12} aria-hidden="true" />
                              </button>
                            </div>
                            <button onClick={() => removeItem(item.id)} className="w-10 h-10 flex items-center justify-center text-red-500 hover:text-red-700" aria-label={`Remove ${item.name} from cart`}>
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <span className="font-cinzel text-sm font-bold text-gold-dark flex-shrink-0" aria-live="polite">
                          ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                        </span>
                      </li>
                      );
                    })}
                  </ul>

                  {/* Coupon */}
                  <div className="mt-5 p-4 bg-white border border-[var(--border)]">
                    <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-2 flex items-center gap-2">
                      <Tag size={12} /> Have a coupon?
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        className="divine-input flex-1 text-sm"
                        placeholder="Enter coupon code"
                        aria-label="Coupon code"
                        maxLength={20}
                      />
                      <button onClick={validateCoupon} disabled={validatingCoupon} className="btn-outline-gold px-4 text-xs disabled:opacity-50">
                        {validatingCoupon ? '...' : 'Apply'}
                      </button>
                    </div>
                    {couponData && (
                      <p className="text-green-600 text-[11px] mt-2 font-lato">✓ {couponData.message}</p>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      const missing = items.find(
                        (i) => (i.options?.length && !i.selectedSize) || (i.colors?.length && !i.selectedColor),
                      );
                      if (missing) {
                        toast.error(`Please choose an option for "${missing.name}"`);
                        return;
                      }
                      setStep('Address');
                    }}
                    className="btn-gold w-full mt-5"
                  >
                    Continue to Address →
                  </button>
                </motion.div>
              )}

              {/* ── STEP 2: Address ── */}
              {step === 'Address' && (
                <motion.div key="address" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="font-cinzel text-base font-semibold text-deep mb-4">Shipping Address</h2>
                  <div className="bg-white border border-[var(--border)] p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { label: 'Full Name *', key: 'fullName', placeholder: 'Your Name', autoComplete: 'name', type: 'text' },
                        { label: 'Mobile Number *', key: 'phone', placeholder: '10-digit number', autoComplete: 'tel-national', type: 'tel' },
                      ].map(({ label, key, placeholder, autoComplete, type }) => (
                        <div key={key}>
                          <label htmlFor={`addr-${key}`} className="font-cinzel text-[9px] tracking-widest uppercase text-[var(--text-mid)] block mb-1">{label}</label>
                          <input
                            id={`addr-${key}`}
                            type={type}
                            autoComplete={autoComplete}
                            maxLength={key === 'phone' ? 10 : 100}
                            value={address[key as keyof Address] || ''}
                            onChange={(e) => setAddress((p) => ({ ...p, [key]: e.target.value }))}
                            className="divine-input"
                            placeholder={placeholder}
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label htmlFor="addr-line1" className="font-cinzel text-[9px] tracking-widest uppercase text-[var(--text-mid)] block mb-1">Address Line 1 *</label>
                      <input
                        id="addr-line1"
                        autoComplete="address-line1"
                        value={address.line1}
                        onChange={(e) => setAddress((p) => ({ ...p, line1: e.target.value }))}
                        className="divine-input"
                        placeholder="House no, Street, Area"
                      />
                    </div>
                    <div>
                      <label htmlFor="addr-line2" className="font-cinzel text-[9px] tracking-widest uppercase text-[var(--text-mid)] block mb-1">Address Line 2 (Optional)</label>
                      <input
                        id="addr-line2"
                        autoComplete="address-line2"
                        value={address.line2 || ''}
                        onChange={(e) => setAddress((p) => ({ ...p, line2: e.target.value }))}
                        className="divine-input"
                        placeholder="Landmark, Floor, etc."
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { label: 'City *', key: 'city', autoComplete: 'address-level2' },
                        { label: 'State *', key: 'state', autoComplete: 'address-level1' },
                        { label: 'Pincode *', key: 'pincode', autoComplete: 'postal-code' },
                      ].map(({ label, key, autoComplete }) => (
                        <div key={key}>
                          <label htmlFor={`addr-${key}`} className="font-cinzel text-[9px] tracking-widest uppercase text-[var(--text-mid)] block mb-1">{label}</label>
                          <input
                            id={`addr-${key}`}
                            autoComplete={autoComplete}
                            inputMode={key === 'pincode' ? 'numeric' : undefined}
                            value={address[key as keyof Address] || ''}
                            onChange={(e) => setAddress((p) => ({ ...p, [key]: e.target.value }))}
                            className="divine-input"
                            maxLength={key === 'pincode' ? 6 : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={() => setStep('Cart')} className="btn-outline-gold flex-1">← Back</button>
                    <button
                      onClick={() => {
                        const { fullName, phone, line1, city, state, pincode } = address;
                        if (!fullName || !phone || !line1 || !city || !state || !pincode) {
                          return toast.error('Please fill all required fields');
                        }
                        if (!/^\d{6}$/.test(pincode)) return toast.error('Invalid pincode');
                        if (!/^[6-9]\d{9}$/.test(phone)) return toast.error('Enter a valid 10-digit mobile number');
                        setStep('Payment');
                      }}
                      className="btn-gold flex-1"
                    >
                      Continue to Payment →
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: Payment ── */}
              {step === 'Payment' && (
                <motion.div key="payment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="font-cinzel text-base font-semibold text-deep mb-4">Payment Method</h2>
                  <div className="bg-white border border-[var(--border)] p-6 space-y-3">
                    {([
                      { id: 'cod', label: 'Cash on Delivery', icon: Banknote },
                      { id: 'upi', label: 'UPI / Google Pay / PhonePe', icon: Smartphone },
                      { id: 'card', label: 'Credit / Debit Card', icon: CreditCard },
                      { id: 'netbanking', label: 'Net Banking', icon: Building2 },
                    ] as const).map((method) => {
                      const Icon = method.icon;
                      return (
                        <label key={method.id} className={`flex items-center gap-3 p-3 border cursor-pointer transition-colors ${
                          paymentMethod === method.id ? 'border-gold bg-gold/5' : 'border-[var(--border)] hover:border-gold/50'
                        }`}>
                          <input
                            type="radio"
                            name="payment"
                            value={method.id}
                            checked={paymentMethod === method.id}
                            onChange={() => setPaymentMethod(method.id)}
                            className="accent-gold"
                          />
                          <span className="text-gold-dark"><Icon size={18} aria-hidden="true" /></span>
                          <span className="font-cinzel text-xs tracking-wider text-deep">{method.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 mt-4 p-3 bg-green-50 border border-green-200">
                    <ShieldCheck size={16} className="text-green-600" />
                    <span className="font-lato text-xs text-green-700">100% Secure Payments by Razorpay</span>
                  </div>

                  <div className="flex gap-3 mt-5">
                    <button onClick={() => setStep('Address')} className="btn-outline-gold flex-1">← Back</button>
                    <button onClick={placeOrder} disabled={placing} className="btn-gold flex-1 disabled:opacity-60">
                      {placing ? 'Placing Order...' : paymentMethod === 'cod' ? '🙏 Place Order' : '🔒 Pay Now'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-[var(--border)] p-6 sticky top-20 md:top-24">
              <h3 className="font-cinzel text-sm font-semibold text-deep mb-4">Order Summary</h3>
              <div className="space-y-2 text-sm font-lato text-[var(--text-mid)] divide-y divide-[var(--border)]">
                <div className="pb-2 space-y-1">
                  <div className="flex justify-between"><span>Subtotal</span><span>₹{sub.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between"><span>Delivery</span><span className={delivery === 0 ? 'text-green-600' : ''}>{delivery === 0 ? 'FREE' : `₹${delivery}`}</span></div>
                  {discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-₹{discount}</span></div>}
                </div>
                <div className="pt-3 flex justify-between font-cinzel font-bold text-gold-dark">
                  <span>Total</span><span>₹{total.toLocaleString('en-IN')}</span>
                </div>
              </div>
              {sub < FREE_DELIVERY_THRESHOLD && (
                <div className="mt-4 p-3 bg-gold/5 border border-gold/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck size={13} className="text-gold" />
                    <span className="font-cinzel text-[9px] tracking-widest uppercase text-gold">
                      Add ₹{FREE_DELIVERY_THRESHOLD - sub} for free delivery
                    </span>
                  </div>
                  <div className="h-1.5 bg-gold/10 rounded-full">
                    <div
                      className="h-full bg-gold rounded-full transition-all"
                      style={{ width: `${Math.min((sub / FREE_DELIVERY_THRESHOLD) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
      <Footer settings={null} />
    </>
  );
}
