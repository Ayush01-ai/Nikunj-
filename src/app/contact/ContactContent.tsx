'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Mail, MessageCircle, Phone, MapPin, Clock, Send,
  Package, ShieldCheck, Sparkles, ChevronDown, CheckCircle2, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { SiteSettings } from '@/types';
import { getWhatsAppHref } from '@/frontend/lib/whatsapp';

interface ContactContentProps {
  settings: SiteSettings | null;
}

const FAQS = [
  {
    q: 'What is the threshold for Free Delivery?',
    a: 'We offer Free Delivery across India on all orders above ₹399. For orders below this amount, a nominal standard delivery fee applies.',
  },
  {
    q: 'Is there an active discount coupon code?',
    a: 'Yes! Use coupon code "First100" at checkout to receive 20% off on your purchase. This introductory discount is exclusively available for the first 100 customers.',
  },
  {
    q: 'How do I choose the right size of ornaments for my deity?',
    a: 'Our deity ornaments and mukuts are tailored for various idol sizes (from size 0 for small Laddu Gopal up to size 7+ and Radha Krishna vigraha). If you are unsure of measurements, send us a photo or height of your deity on WhatsApp, and our artisan specialists will assist you.',
  },
  {
    q: 'How long will delivery take and how can I track it?',
    a: 'Orders are dispatched with care within 1-2 business days and delivered within 5-10 business days. You can track your shipment anytime via our "Track Your Order" page.',
  },
  {
    q: 'What if an ornament arrives damaged or doesn’t fit?',
    a: 'We offer a hassle-free 7-day return and replacement policy. Contact us via WhatsApp or email within 7 days with photos, and we will arrange a replacement or refund promptly.',
  },
];

export function ContactContent({ settings }: ContactContentProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [orderId, setOrderId] = useState('');
  const [subject, setSubject] = useState('Deity Ornament Sizing');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const rawWhatsapp = settings?.whatsappNumber || '919118698641';
  const supportEmail = 'Nikunj.sakhi14@gmail.com';

  const defaultWaMessage = 'Namaste! 🙏 I need assistance regarding Nikunj Sakhi divine ornaments.';
  const directWaUrl = getWhatsAppHref(rawWhatsapp, defaultWaMessage);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (!phone.trim() && !email.trim()) {
      toast.error('Please enter a phone number or email address');
      return;
    }
    if (!message.trim()) {
      toast.error('Please enter your message');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, orderId, subject, message, honeypot }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send message');
      }

      setSubmitted(true);
      toast.success('Your message has been received! 🙏');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send message. Please try WhatsApp support.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsAppForward = () => {
    const formattedText = `Namaste Nikunj Sakhi! 🙏
*Support Inquiry*
*Name:* ${name || 'Devotee'}
${phone ? `*Phone:* ${phone}\n` : ''}${email ? `*Email:* ${email}\n` : ''}${orderId ? `*Order ID:* ${orderId}\n` : ''}*Topic:* ${subject}
*Message:*
${message || 'I would like assistance with your divine ornaments.'}`;

    window.open(getWhatsAppHref(rawWhatsapp, formattedText), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bg-cream min-h-screen text-deep">
      {/* Breadcrumb strip */}
      <nav aria-label="Breadcrumb" className="border-b border-gold/20 bg-cream/60 py-3 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-xs font-cinzel">
          <Link prefetch={false} href="/" className="text-[var(--text-mid)] hover:text-gold transition-colors">
            Home
          </Link>
          <span className="text-gold/40">/</span>
          <span className="text-gold-dark font-semibold">Contact Us &amp; Support</span>
        </div>
      </nav>

      {/* Hero Header */}
      <header className="py-14 sm:py-20 px-4 sm:px-6 lg:px-8 text-center max-w-4xl mx-auto">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-cinzel text-xs tracking-[0.3em] uppercase text-gold block mb-3 font-semibold"
        >
          Devotee Care &amp; Support
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="font-cinzel text-3xl sm:text-4xl md:text-5xl text-deep font-semibold mb-4 tracking-wide"
        >
          We Are Here To Assist You
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="font-crimson italic text-base sm:text-lg text-[var(--text-mid)] max-w-2xl mx-auto leading-relaxed"
        >
          Whether you have questions about deity jewellery sizes, custom pooja samagri, tracking your shipment, or payment queries, our dedicated team is at your divine service.
        </motion.p>
      </header>

      {/* 4 Cards Support Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: WhatsApp */}
          <div className="bg-white/80 border border-gold/25 p-6 rounded-xs shadow-xs hover:border-gold hover:shadow-gold-sm transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-full bg-[#25D366]/15 border border-[#25D366]/40 flex items-center justify-center text-[#25D366] mb-4">
                <MessageCircle size={24} />
              </div>
              <h2 className="font-cinzel text-base font-semibold text-deep mb-1">WhatsApp Support</h2>
              <p className="text-xs text-[var(--text-mid)] mb-3 leading-relaxed">
                Fastest response for idol sizing, order queries, and custom requests.
              </p>
              <p className="font-lato text-xs font-semibold text-deep mb-4">
                +91 91186 98641
              </p>
            </div>
            <a
              href={directWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba59] text-white py-2.5 px-4 font-cinzel text-xs font-semibold tracking-wider transition-colors rounded-xs"
            >
              <MessageCircle size={14} />
              Chat on WhatsApp
            </a>
          </div>

          {/* Card 2: Email Support */}
          <div className="bg-white/80 border border-gold/25 p-6 rounded-xs shadow-xs hover:border-gold hover:shadow-gold-sm transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center text-gold-dark mb-4">
                <Mail size={24} />
              </div>
              <h2 className="font-cinzel text-base font-semibold text-deep mb-1">Email Us</h2>
              <p className="text-xs text-[var(--text-mid)] mb-3 leading-relaxed">
                Send us detailed inquiries, feedback, business inquiries, and order notes.
              </p>
              <p className="font-lato text-xs font-semibold text-deep mb-4 break-all">
                {supportEmail}
              </p>
            </div>
            <a
              href={`mailto:${supportEmail}?subject=Customer%20Support%20Inquiry%20-%20Nikunj%20Sakhi`}
              className="inline-flex items-center justify-center gap-2 border border-gold text-gold-dark hover:bg-gold-dark hover:text-white py-2.5 px-4 font-cinzel text-xs font-semibold tracking-wider transition-colors rounded-xs"
            >
              <Mail size={14} />
              Send Email
            </a>
          </div>

          {/* Card 3: Track Order */}
          <div className="bg-white/80 border border-gold/25 p-6 rounded-xs shadow-xs hover:border-gold hover:shadow-gold-sm transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-full bg-deep/10 border border-deep/20 flex items-center justify-center text-deep mb-4">
                <Package size={24} />
              </div>
              <h2 className="font-cinzel text-base font-semibold text-deep mb-1">Track Order</h2>
              <p className="text-xs text-[var(--text-mid)] mb-3 leading-relaxed">
                Check real-time delivery status, courier tracking, and your delivery code.
              </p>
              <p className="font-lato text-xs text-[var(--text-mid)] mb-4">
                Enter your Order ID &amp; mobile number.
              </p>
            </div>
            <Link prefetch={false}
              href="/track-order"
              className="inline-flex items-center justify-center gap-2 bg-deep hover:bg-black text-white py-2.5 px-4 font-cinzel text-xs font-semibold tracking-wider transition-colors rounded-xs"
            >
              <Package size={14} />
              Track Shipment
            </Link>
          </div>

          {/* Card 4: Service Hours */}
          <div className="bg-white/80 border border-gold/25 p-6 rounded-xs shadow-xs hover:border-gold hover:shadow-gold-sm transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center text-gold-dark mb-4">
                <Clock size={24} />
              </div>
              <h2 className="font-cinzel text-base font-semibold text-deep mb-1">Working Hours</h2>
              <p className="text-xs text-[var(--text-mid)] mb-2 leading-relaxed">
                Our devotee support specialists are available:
              </p>
              <div className="text-xs space-y-1 mb-4 font-lato text-deep">
                <p><strong>Mon &ndash; Sat:</strong> 9:00 AM &ndash; 8:00 PM IST</p>
                <p><strong>Sunday:</strong> 10:00 AM &ndash; 5:00 PM IST</p>
              </div>
            </div>
            <div className="text-xs text-gold-dark font-cinzel tracking-wider flex items-center gap-1.5">
              <Sparkles size={14} /> Sacred Artisan Care
            </div>
          </div>
        </div>
      </section>

      {/* Main Support Form & Overview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          {/* Left Column: Form */}
          <div className="lg:col-span-7 bg-white/90 border border-gold/30 p-6 sm:p-8 rounded-xs shadow-gold-sm">
            <h2 className="font-cinzel text-2xl font-semibold text-deep mb-2">
              Send Us a Message
            </h2>
            <p className="font-crimson italic text-sm text-[var(--text-mid)] mb-6">
              Fill out this form and our support team will respond promptly.
            </p>

            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 bg-gold/10 border border-gold/40 text-center rounded-xs"
              >
                <CheckCircle2 size={40} className="text-gold-dark mx-auto mb-3" />
                <h3 className="font-cinzel text-lg font-semibold text-deep mb-2">
                  Thank You, {name}!
                </h3>
                <p className="text-xs text-[var(--text-mid)] leading-relaxed mb-6">
                  Your message has been received with devotion. Our team will review your inquiry and get back to you shortly.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setMessage('');
                    }}
                    className="btn-outline-gold !text-xs !py-2"
                  >
                    Send Another Message
                  </button>
                  <a
                    href={directWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-[#25D366] text-white py-2 px-4 font-cinzel text-xs font-semibold rounded-xs"
                  >
                    <MessageCircle size={14} />
                    Message on WhatsApp
                  </a>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Honeypot field */}
                <input
                  type="text"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-cinzel text-xs font-medium text-deep mb-1">
                      Your Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Radhika Sharma"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-cream/40 border border-gold/30 px-3.5 py-2.5 text-xs text-deep focus:border-gold focus:outline-none rounded-xs font-lato"
                    />
                  </div>

                  <div>
                    <label className="block font-cinzel text-xs font-medium text-deep mb-1">
                      WhatsApp / Mobile Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="10-digit mobile number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-cream/40 border border-gold/30 px-3.5 py-2.5 text-xs text-deep focus:border-gold focus:outline-none rounded-xs font-lato"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-cinzel text-xs font-medium text-deep mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-cream/40 border border-gold/30 px-3.5 py-2.5 text-xs text-deep focus:border-gold focus:outline-none rounded-xs font-lato"
                    />
                  </div>

                  <div>
                    <label className="block font-cinzel text-xs font-medium text-deep mb-1">
                      Order ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. NS-12345"
                      value={orderId}
                      onChange={(e) => setOrderId(e.target.value)}
                      className="w-full bg-cream/40 border border-gold/30 px-3.5 py-2.5 text-xs text-deep focus:border-gold focus:outline-none rounded-xs font-lato"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-cinzel text-xs font-medium text-deep mb-1">
                    Topic of Inquiry
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-cream/40 border border-gold/30 px-3.5 py-2.5 text-xs text-deep focus:border-gold focus:outline-none rounded-xs font-lato"
                  >
                    <option value="Deity Ornament Sizing">Deity Ornament Sizing &amp; Measurements</option>
                    <option value="Order Tracking / Delivery">Order Status &amp; Tracking</option>
                    <option value="Return or Replacement">Return, Exchange or Replacement</option>
                    <option value="Coupon & Offers">Coupon &amp; Discount Inquiry (First100)</option>
                    <option value="Custom Devotional Order">Custom Temple / Devotional Order</option>
                    <option value="General Support">General Support Inquiry</option>
                  </select>
                </div>

                <div>
                  <label className="block font-cinzel text-xs font-medium text-deep mb-1">
                    Your Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe your inquiry, idol measurements, or order questions in detail..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-cream/40 border border-gold/30 px-3.5 py-2.5 text-xs text-deep focus:border-gold focus:outline-none rounded-xs font-lato"
                  />
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 bg-gold-dark hover:bg-gold-800 text-white py-3 px-6 font-cinzel text-xs font-semibold tracking-widest uppercase transition-colors rounded-xs shadow-xs disabled:opacity-50"
                  >
                    <Send size={14} />
                    {submitting ? 'Sending...' : 'Send Message'}
                  </button>

                  <button
                    type="button"
                    onClick={handleWhatsAppForward}
                    className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba59] text-white py-3 px-6 font-cinzel text-xs font-semibold tracking-widest uppercase transition-colors rounded-xs shadow-xs"
                  >
                    <MessageCircle size={15} />
                    Chat on WhatsApp Instead
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Right Column: Support Highlights & Trust Info */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="bg-white/80 border border-gold/25 p-6 rounded-xs">
              <h3 className="font-cinzel text-base font-semibold text-deep mb-3 flex items-center gap-2">
                <ShieldCheck size={18} className="text-gold-dark" />
                The Nikunj Sakhi Promise
              </h3>
              <ul className="space-y-3 text-xs text-[var(--text-mid)]">
                <li className="flex items-start gap-2.5">
                  <span className="text-gold-dark font-bold">✦</span>
                  <span><strong>Free Delivery:</strong> All prepaid and COD orders above ₹399 qualify for Free Shipping across India.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold-dark font-bold">✦</span>
                  <span><strong>Welcome Discount:</strong> Use code <strong>First100</strong> at checkout for 20% discount (exclusive for first 100 customers).</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold-dark font-bold">✦</span>
                  <span><strong>Pure Materials:</strong> Sacred brass, pure silver-look finish, mukuts and haar crafted by artisans with divine reverence.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold-dark font-bold">✦</span>
                  <span><strong>7-Day Returns:</strong> Safe and stress-free replacement if any piece arrives damaged or requires size adjustment.</span>
                </li>
              </ul>
            </div>

            <div className="bg-white/80 border border-gold/25 p-6 rounded-xs">
              <h3 className="font-cinzel text-base font-semibold text-deep mb-2 flex items-center gap-2">
                <MapPin size={18} className="text-gold-dark" />
                Artisan Studio &amp; Heritage
              </h3>
              <p className="text-xs text-[var(--text-mid)] leading-relaxed mb-4">
                Our devotional ornaments are created with love, devotion, and centuries-old Braj artistry. Every piece is handled with sanctity from creation to packaging.
              </p>
              <div className="border-t border-gold/15 pt-3 text-xs text-deep">
                <p className="font-cinzel font-semibold text-gold-dark mb-1">Direct Contact Details:</p>
                <p>Email: <a href={`mailto:${supportEmail}`} className="underline text-gold-dark">{supportEmail}</a></p>
                <p>WhatsApp: <a href={directWaUrl} target="_blank" rel="noopener noreferrer" className="underline text-gold-dark">+91 91186 98641</a></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="text-center mb-8">
          <span className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold block mb-2 font-semibold">
            Common Inquiries
          </span>
          <h2 className="font-cinzel text-2xl font-semibold text-deep">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={faq.q}
                className="border border-gold/25 bg-white/70 overflow-hidden rounded-xs transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 font-cinzel text-sm font-semibold text-deep hover:text-gold-dark transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-gold transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 pb-4 text-xs text-[var(--text-mid)] leading-relaxed border-t border-gold/15 pt-3 font-lato"
                  >
                    {faq.a}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
