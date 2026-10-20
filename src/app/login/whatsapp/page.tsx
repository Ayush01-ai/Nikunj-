'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ArrowRight, RotateCcw, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/frontend/store/authStore';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import type { User } from '@/types';
import { ClerkTicketRedeemer } from './ClerkTicketRedeemer';
import { phoneSchema, otpSchema } from '@/frontend/lib/formSchemas';

type PhoneForm = z.infer<typeof phoneSchema>;
type OtpForm = z.infer<typeof otpSchema>;

// Inlined at build time: true only when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set, which
// is exactly when `ClerkAppProvider` mounts `<ClerkProvider>` around the whole app (see
// src/frontend/providers/ClerkAppProvider.tsx). This lets us pick, once per build, between
// the Clerk-ticket-redeeming variant (needs `useSignIn()`, which requires a ClerkProvider
// ancestor) and the plain legacy-session variant — never calling Clerk hooks conditionally
// per render, which would break the rules of hooks.
const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const labelCls = 'font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] block mb-1.5';
const inputWrapCls = 'flex items-center border border-[var(--border)] bg-white focus-within:border-gold transition-colors';
const inputCls = 'flex-1 min-w-0 py-3 pr-3 font-lato text-sm text-deep outline-none bg-transparent';

const RESEND_SECONDS = 60;
const errMsg = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(json.error || 'Something went wrong');
  return json;
}

/**
 * Dedicated, fully additive WhatsApp OTP login route. Kept separate from the existing
 * `/login` page (zero changes to that file) per explicit scoping decision: this feature
 * is new and optional, so it gets its own route rather than touching the larger,
 * delicate email/phone tab-switcher page.
 */
export default function WhatsAppLoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');

  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) });
  const otpForm = useForm<OtpForm>({ resolver: zodResolver(otpSchema) });

  const sendOtp = async (data: PhoneForm): Promise<boolean> => {
    try {
      const json = await postJSON('/api/auth/whatsapp/send-otp', { phone: data.phone });
      setPhone(data.phone);
      setStep('otp');
      toast.success('OTP sent via WhatsApp!');
      // Only present when the server could not send live (no credentials, development).
      if (json._devOtp) toast(`Dev OTP: ${json._devOtp}`, { duration: 10000 });
      return true;
    } catch (err) {
      toast.error(errMsg(err, 'Error sending OTP'));
      return false;
    }
  };

  return (
    <>
      <Navbar settings={null} />
      <div className="relative min-h-screen flex items-center justify-center px-4 pt-8 pb-10 overflow-hidden">
        <Image src="/login-bg.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-cream/70 backdrop-blur-[2px]" />
        <div className="relative w-full max-w-md">
          <div className="flex justify-center mb-6">
            <Image
              src="/nikunj-sakhi-logo-v3.webp"
              alt="Nikunj Sakhi – Serve with Devotion"
              width={774}
              height={522}
              priority
              className="w-60 sm:w-72 h-auto drop-shadow-[0_2px_12px_rgba(251,247,239,0.9)]"
            />
          </div>

          <div className="bg-white/90 backdrop-blur-sm border border-gold/30 shadow-gold-sm p-6 sm:p-8">
            <h1 className="font-cinzel text-lg font-semibold text-deep mb-1 flex items-center gap-2">
              <MessageCircle size={18} className="text-teal" /> WhatsApp Login
            </h1>
            <p className="font-crimson italic text-[var(--text-mid)] mb-5">
              Receive your one-time code on WhatsApp — no password needed.
            </p>

            <AnimatePresence mode="wait">
              {step === 'phone' && (
                <motion.form
                  key="phone"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  onSubmit={phoneForm.handleSubmit(sendOtp)}
                  noValidate
                >
                  <label htmlFor="wa-phone" className={labelCls}>Mobile Number</label>
                  <div className={inputWrapCls}>
                    <span className="px-3 py-3 border-r border-[var(--border)] font-lato text-sm text-[var(--text-mid)] flex items-center gap-2">
                      <Phone size={14} /> +91
                    </span>
                    <input
                      id="wa-phone"
                      {...phoneForm.register('phone')}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      className={`${inputCls} pl-3`}
                      placeholder="9XXXXXXXXX"
                      maxLength={10}
                    />
                  </div>
                  {phoneForm.formState.errors.phone?.message && (
                    <p className="mt-1.5 font-lato text-xs text-red-600">{phoneForm.formState.errors.phone.message}</p>
                  )}
                  <button
                    type="submit"
                    disabled={phoneForm.formState.isSubmitting}
                    className="btn-gold w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {phoneForm.formState.isSubmitting ? 'Sending...' : <>Send OTP via WhatsApp <ArrowRight size={14} /></>}
                  </button>
                  <p className="mt-4 text-center font-lato text-xs text-[var(--text-mid)]">
                    Prefer email? <a href="/login" className="text-teal hover:text-gold underline-offset-2 hover:underline">Sign in with email or Google instead</a>.
                  </p>
                </motion.form>
              )}

              {step === 'otp' && (
                <OtpStep
                  key="otp"
                  phone={phone}
                  otpForm={otpForm}
                  onBack={() => { setStep('phone'); otpForm.reset(); }}
                  onResend={() => sendOtp({ phone })}
                  resending={phoneForm.formState.isSubmitting}
                  onLoggedIn={(user) => {
                    setUser(user);
                    toast.success('Signed in via WhatsApp 🙏');
                    router.push('/account');
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <Footer settings={null} />
    </>
  );
}

function OtpStep({
  phone,
  otpForm,
  onBack,
  onResend,
  resending,
  onLoggedIn,
}: {
  phone: string;
  otpForm: ReturnType<typeof useForm<OtpForm>>;
  onBack: () => void;
  onResend: () => Promise<boolean>;
  resending: boolean;
  onLoggedIn: (user: User) => void;
}) {
  const [pendingTicket, setPendingTicket] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [resendBusy, setResendBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const resend = async () => {
    if (cooldown > 0 || resendBusy) return;
    setResendBusy(true);
    const ok = await onResend();
    setResendBusy(false);
    if (ok) setCooldown(RESEND_SECONDS);
  };

  const finishLogin = async () => {
    const me = await fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json());
    if (me?.success && me.user) {
      onLoggedIn(me.user);
    } else {
      toast.error('Could not establish session.');
    }
  };

  const verifyOtp = async (data: OtpForm) => {
    try {
      const json = await postJSON('/api/auth/whatsapp/verify-otp', { phone, otp: data.otp });

      if (CLERK_ENABLED && json.clerkTicket) {
        // Hand off to <ClerkTicketRedeemer>, which calls useSignIn().signIn.create({
        // strategy: 'ticket', ... }) to turn this one-time token into a REAL Clerk
        // session, then invokes finishLogin() via onComplete.
        setPendingTicket(json.clerkTicket);
        return;
      }

      // No Clerk ticket (Clerk not configured): the legacy ns_token cookie set by the
      // verify-otp route is already the active session.
      await finishLogin();
    } catch (err) {
      toast.error(errMsg(err, 'Invalid OTP'));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
      {CLERK_ENABLED && pendingTicket && (
        <ClerkTicketRedeemer
          ticket={pendingTicket}
          onComplete={() => { setPendingTicket(null); void finishLogin(); }}
          onError={(message) => { setPendingTicket(null); toast.error(message); }}
        />
      )}
      <form onSubmit={otpForm.handleSubmit(verifyOtp)} noValidate>
        <label htmlFor="wa-otp" className={labelCls}>6-Digit OTP</label>
        <input
          id="wa-otp"
          {...otpForm.register('otp')}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="divine-input text-center text-2xl tracking-[0.5em] font-cinzel"
          placeholder="------"
          autoFocus
        />
        {otpForm.formState.errors.otp?.message && (
          <p className="mt-1.5 font-lato text-xs text-red-600">{otpForm.formState.errors.otp.message}</p>
        )}
        <button type="submit" disabled={otpForm.formState.isSubmitting} className="btn-gold w-full mt-4 disabled:opacity-60">
          {otpForm.formState.isSubmitting ? 'Verifying...' : 'Verify & Continue'}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] hover:text-gold transition-colors flex items-center gap-2"
        >
          <RotateCcw size={12} /> Change Number
        </button>
        <button
          type="button"
          disabled={resending || resendBusy || cooldown > 0}
          onClick={resend}
          className="font-cinzel text-[10px] tracking-widest uppercase text-teal hover:text-gold transition-colors disabled:opacity-50"
        >
          {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
        </button>
      </div>
    </motion.div>
  );
}
