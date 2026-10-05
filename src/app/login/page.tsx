'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ArrowRight, RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/frontend/store/authStore';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import toast from 'react-hot-toast';

const phoneSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
});
const otpSchema = z.object({
  otp: z.string().length(6, 'Enter the 6-digit OTP'),
});

type PhoneForm = z.infer<typeof phoneSchema>;
type OtpForm = z.infer<typeof otpSchema>;

export default function LoginPage() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const router = useRouter();
  const { setUser } = useAuthStore();

  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) });
  const otpForm = useForm<OtpForm>({ resolver: zodResolver(otpSchema) });

  const sendOtp = async (data: PhoneForm) => {
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: data.phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send OTP');
      setPhone(data.phone);
      setStep('otp');
      toast.success('OTP sent!');
      if (json._devOtp) toast(`Dev OTP: ${json._devOtp}`, { duration: 10000 });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error sending OTP');
    }
  };

  const verifyOtp = async (data: OtpForm) => {
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: data.otp }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Invalid OTP');
      setUser(json.user, json.token);
      toast.success('Logged in successfully! 🙏');
      router.push('/account');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invalid OTP');
    }
  };

  return (
    <>
      <Navbar settings={null} />
      <div className="relative min-h-screen flex items-center justify-center px-4 pt-20 pb-10 overflow-hidden">
      <Image src="/login-bg.webp" alt="" fill priority sizes="100vw" className="object-cover" />
      {/* Cream veil keeps the form readable over the busy artwork */}
      <div aria-hidden="true" className="absolute inset-0 bg-cream/70 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-md">
        {/* Brand */}
        <div className="flex justify-center mb-6">
          <Image
            src="/nikunj-sakhi-logo.jpeg"
            alt="Nikunj Sakhi – Divine God Ornaments"
            width={704}
            height={384}
            priority
            className="w-60 sm:w-72 h-auto mix-blend-multiply [mask-image:radial-gradient(ellipse_at_center,#000_55%,transparent_78%)]"
          />
        </div>

        <div className="bg-white/90 backdrop-blur-sm border border-gold/30 shadow-gold-sm p-8">
          <AnimatePresence mode="wait">
            {step === 'phone' ? (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <h1 className="font-cinzel text-lg font-semibold text-deep mb-1">Welcome Back 🙏</h1>
                <p className="font-crimson italic text-[var(--text-mid)] mb-6">
                  Enter your mobile number to continue
                </p>
                <form onSubmit={phoneForm.handleSubmit(sendOtp)} noValidate>
                  <label className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] block mb-1.5">
                    Mobile Number
                  </label>
                  <div className="flex items-center border border-[var(--border)] mb-1">
                    <span className="px-3 py-3 border-r border-[var(--border)] font-lato text-sm text-[var(--text-mid)] flex items-center gap-2">
                      <Phone size={14} /> +91
                    </span>
                    <input
                      {...phoneForm.register('phone')}
                      type="tel"
                      className="flex-1 px-3 py-3 font-lato text-sm text-deep outline-none bg-transparent"
                      placeholder="9XXXXXXXXX"
                      maxLength={10}
                    />
                  </div>
                  {phoneForm.formState.errors.phone && (
                    <p className="text-red-500 text-[10px] mb-3">{phoneForm.formState.errors.phone.message}</p>
                  )}
                  <button
                    type="submit"
                    disabled={phoneForm.formState.isSubmitting}
                    className="btn-gold w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {phoneForm.formState.isSubmitting ? 'Sending...' : <>Send OTP <ArrowRight size={14} /></>}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h1 className="font-cinzel text-lg font-semibold text-deep mb-1">Enter OTP 🙏</h1>
                <p className="font-crimson italic text-[var(--text-mid)] mb-6">
                  OTP sent to +91 {phone}
                </p>
                <form onSubmit={otpForm.handleSubmit(verifyOtp)} noValidate>
                  <label className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] block mb-1.5">
                    6-Digit OTP
                  </label>
                  <input
                    {...otpForm.register('otp')}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="divine-input text-center text-2xl tracking-[0.5em] font-cinzel mb-1"
                    placeholder="------"
                    autoFocus
                  />
                  {otpForm.formState.errors.otp && (
                    <p className="text-red-500 text-[10px] mb-3">{otpForm.formState.errors.otp.message}</p>
                  )}
                  <button
                    type="submit"
                    disabled={otpForm.formState.isSubmitting}
                    className="btn-gold w-full mt-4 disabled:opacity-60"
                  >
                    {otpForm.formState.isSubmitting ? 'Verifying...' : 'Verify & Continue'}
                  </button>
                </form>
                <button
                  onClick={() => { setStep('phone'); otpForm.reset(); }}
                  className="mt-4 w-full text-center font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] hover:text-gold transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={12} /> Change Number
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </div>
      <Footer settings={null} />
    </>
  );
}
