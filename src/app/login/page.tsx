'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Mail, Lock, User as UserIcon, ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useAuthStore } from '@/frontend/store/authStore';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { signInSchema, signUpSchema, forgotSchema } from '@/frontend/lib/formSchemas';
import toast from 'react-hot-toast';
import { ClerkGoogleButton } from '@/frontend/components/auth/ClerkGoogleButton';
import { ClerkEmailAuth } from '@/frontend/components/auth/ClerkEmailAuth';
import { useClerkEnabled } from '@/frontend/providers/ClerkEnabledContext';


type SignInForm = z.infer<typeof signInSchema>;
type SignUpForm = z.infer<typeof signUpSchema>;
type ForgotForm = z.infer<typeof forgotSchema>;

type Method = 'email' | 'phone';
type EmailMode = 'signin' | 'signup' | 'forgot';

const OAUTH_ERRORS: Record<string, string> = {
  google_unavailable: 'Google sign-in is not available yet. Please use email or WhatsApp.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_unverified: 'Your Google email is not verified.',
};

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

const errMsg = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-red-500 text-[11px] mt-1">{message}</p> : null;
}

const labelCls = 'font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] block mb-1.5';
const inputWrapCls = 'flex items-center border border-[var(--border)] bg-white focus-within:border-gold transition-colors';
const iconCls = 'px-3 text-[var(--text-mid)] flex items-center';
const inputCls = 'flex-1 min-w-0 py-3 pr-3 font-lato text-sm text-deep outline-none bg-transparent';
const linkBtnCls = 'font-lato text-xs text-teal hover:text-gold underline-offset-2 hover:underline transition-colors';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { setUser, isAuthenticated } = useAuthStore();

  const [method, setMethod] = useState<Method>('email');
  const [emailMode, setEmailMode] = useState<EmailMode>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [resetSentTo, setResetSentTo] = useState('');
  const [devResetUrl, setDevResetUrl] = useState('');
  const [next, setNext] = useState('/account');
  // True only when <ClerkProvider> is mounted, so Clerk hooks are safe to use.
  const clerkEnabled = useClerkEnabled();

  const signInForm = useForm<SignInForm>({ resolver: zodResolver(signInSchema) });
  const signUpForm = useForm<SignUpForm>({ resolver: zodResolver(signUpSchema) });
  const forgotForm = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema) });

  // Read query params on the client (avoids a Suspense boundary for useSearchParams).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextParam = params.get('next');
    const dest = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/account';
    setNext(dest);

    const error = params.get('error');
    if (error) toast.error(OAUTH_ERRORS[error] ?? 'Sign-in failed. Please try again.');

    if (params.get('oauth') === 'success') {
      fetch('/api/auth/me', { cache: 'no-store' })
        .then((r) => r.json())
        .then((json) => {
          if (json?.success && json.user) {
            setUser(json.user);
            toast.success('Signed in with Google 🙏');
            router.replace(dest);
          } else {
            toast.error('Google sign-in failed. Please try again.');
          }
        })
        .catch(() => toast.error('Google sign-in failed. Please try again.'));
    } else if (useAuthStore.getState().isAuthenticated) {
      router.replace(dest);
    }
  }, [router, setUser]);

  const finishLogin = (user: Parameters<typeof setUser>[0], message: string) => {
    setUser(user);
    toast.success(message);
    router.push(next);
  };

  const signIn = async (data: SignInForm) => {
    try {
      const json = await postJSON('/api/auth/login', data);
      finishLogin(json.user, 'Namaste! Welcome back 🙏');
    } catch (err) {
      toast.error(errMsg(err, 'Login failed'));
    }
  };

  const signUp = async (data: SignUpForm) => {
    try {
      const json = await postJSON('/api/auth/register', data);
      finishLogin(json.user, 'Account created! Jai Shri Radhe 🙏');
    } catch (err) {
      toast.error(errMsg(err, 'Could not create account'));
    }
  };

  const forgot = async (data: ForgotForm) => {
    try {
      const json = await postJSON('/api/auth/forgot-password', data);
      setResetSentTo(data.email);
      setDevResetUrl(json._devResetUrl ?? '');
      toast.success('Check your inbox for the reset link');
    } catch (err) {
      toast.error(errMsg(err, 'Could not send reset link'));
    }
  };

  const switchEmailMode = (mode: EmailMode) => {
    setEmailMode(mode);
    setResetSentTo('');
    setDevResetUrl('');
    setShowPassword(false);
  };

  const heading =
    method === 'phone'
      ? 'Namaste'
      : emailMode === 'signup' ? 'Create Account 🙏' : emailMode === 'forgot' ? 'Forgot Password' : 'Namaste';
  const isGreeting = heading === 'Namaste';

  const subheading =
    method === 'phone'
      ? 'Sign in or sign up with your WhatsApp number'
      : emailMode === 'signup' ? 'Join the Nikunj Sakhi family'
      : emailMode === 'forgot' ? 'We will email you a secure reset link'
      : 'Sign in to Continue';

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword((s) => !s)}
      className="px-3 text-[var(--text-mid)] hover:text-gold"
      aria-label={showPassword ? 'Hide password' : 'Show password'}
    >
      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );

  return (
    <>
      <Navbar settings={null} />
      <div className="relative min-h-screen flex items-center justify-center px-4 pt-8 pb-10 overflow-hidden">
        <Image src="/login-bg.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        {/* Cream veil keeps the form readable over the busy artwork */}
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
            {isGreeting ? (
              <h1 className="mb-2 flex items-center gap-3 text-deep">
                <span className="font-namaste text-5xl sm:text-6xl leading-none text-gold-dark pt-2" lang="hi">नमस्ते</span>
                <Image
                  src="/namaste-hands-v2.webp"
                  alt=""
                  aria-hidden="true"
                  width={149}
                  height={200}
                  className="namaste-hands h-14 sm:h-[4.25rem] w-auto select-none"
                />
              </h1>
            ) : (
              <h1 className="font-cinzel text-lg font-semibold text-deep mb-1">{heading}</h1>
            )}
            <p className="font-crimson italic text-[var(--text-mid)] mb-5">{subheading}</p>

            {/* Google */}
            {!(method === 'email' && emailMode === 'forgot') && (
              <>
                {clerkEnabled ? (
                  <ClerkGoogleButton
                    next={next}
                    onError={(m) => toast.error(m)}
                    className="w-full flex items-center justify-center gap-3 border border-[var(--border)] bg-white py-3 font-lato text-sm text-deep hover:border-gold hover:shadow-gold-sm transition-all"
                  >
                    <GoogleIcon /> Continue with Google
                  </ClerkGoogleButton>
                ) : (
                  <button
                    type="button"
                    onClick={() => toast(OAUTH_ERRORS.google_unavailable)}
                    className="w-full flex items-center justify-center gap-3 border border-dashed border-[var(--border)] bg-white/60 py-3 font-lato text-sm text-[var(--text-mid)] cursor-not-allowed"
                    aria-disabled="true"
                    title="Google sign-in will be enabled soon"
                  >
                    <GoogleIcon /> Continue with Google
                  </button>
                )}
                <div className="flex items-center gap-3 my-5" aria-hidden="true">
                  <span className="h-px flex-1 bg-[var(--border)]" />
                  <span className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)]">or</span>
                  <span className="h-px flex-1 bg-[var(--border)]" />
                </div>

                {/* Method tabs */}
                <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 border border-[var(--border)] mb-5">
                  {(['email', 'phone'] as const).map((m) => (
                    <button
                      key={m}
                      role="tab"
                      type="button"
                      aria-selected={method === m}
                      onClick={() => {
                        if (m === 'phone') { router.push(`/login/whatsapp?next=${encodeURIComponent(next)}`); return; }
                        setMethod(m);
                        setShowPassword(false);
                      }}
                      className={`flex items-center justify-center gap-2 py-2.5 font-cinzel text-[11px] tracking-widest uppercase transition-colors ${
                        method === m ? 'bg-teal text-white' : 'text-[var(--text-mid)] hover:text-gold'
                      }`}
                    >
                      {m === 'email' ? <><Mail size={13} /> Email</> : <><Phone size={13} /> WhatsApp</>}
                    </button>
                  ))}
                </div>
              </>
            )}

            {clerkEnabled && method === 'email' && (
              <ClerkEmailAuth mode={emailMode} onModeChange={switchEmailMode} next={next} />
            )}

            <AnimatePresence mode="wait">
              {!clerkEnabled && method === 'email' && emailMode === 'signin' && (
                <motion.form
                  key="signin"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  onSubmit={signInForm.handleSubmit(signIn)}
                  noValidate
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="si-email" className={labelCls}>Email</label>
                    <div className={inputWrapCls}>
                      <span className={iconCls}><Mail size={15} /></span>
                      <input id="si-email" {...signInForm.register('email')} type="email" autoComplete="email" className={inputCls} placeholder="you@example.com" />
                    </div>
                    <FieldError message={signInForm.formState.errors.email?.message} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="si-password" className={labelCls}>Password</label>
                      <button type="button" onClick={() => switchEmailMode('forgot')} className={`${linkBtnCls} mb-1.5`}>
                        Forgot password?
                      </button>
                    </div>
                    <div className={inputWrapCls}>
                      <span className={iconCls}><Lock size={15} /></span>
                      <input id="si-password" {...signInForm.register('password')} type={showPassword ? 'text' : 'password'} autoComplete="current-password" className={inputCls} placeholder="••••••••" />
                      {passwordToggle}
                    </div>
                    <FieldError message={signInForm.formState.errors.password?.message} />
                  </div>
                  <button type="submit" disabled={signInForm.formState.isSubmitting} className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-60">
                    {signInForm.formState.isSubmitting ? 'Signing in...' : <>Sign In <ArrowRight size={14} /></>}
                  </button>
                  <p className="text-center font-lato text-xs text-[var(--text-mid)]">
                    New here?{' '}
                    <button type="button" onClick={() => switchEmailMode('signup')} className={linkBtnCls}>Create an account</button>
                  </p>
                </motion.form>
              )}

              {!clerkEnabled && method === 'email' && emailMode === 'signup' && (
                <motion.form
                  key="signup"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  onSubmit={signUpForm.handleSubmit(signUp)}
                  noValidate
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="su-name" className={labelCls}>Full Name</label>
                    <div className={inputWrapCls}>
                      <span className={iconCls}><UserIcon size={15} /></span>
                      <input id="su-name" {...signUpForm.register('name')} autoComplete="name" className={inputCls} placeholder="Your name" />
                    </div>
                    <FieldError message={signUpForm.formState.errors.name?.message} />
                  </div>
                  <div>
                    <label htmlFor="su-email" className={labelCls}>Email</label>
                    <div className={inputWrapCls}>
                      <span className={iconCls}><Mail size={15} /></span>
                      <input id="su-email" {...signUpForm.register('email')} type="email" autoComplete="email" className={inputCls} placeholder="you@example.com" />
                    </div>
                    <FieldError message={signUpForm.formState.errors.email?.message} />
                  </div>
                  <div>
                    <label htmlFor="su-password" className={labelCls}>Password</label>
                    <div className={inputWrapCls}>
                      <span className={iconCls}><Lock size={15} /></span>
                      <input id="su-password" {...signUpForm.register('password')} type={showPassword ? 'text' : 'password'} autoComplete="new-password" className={inputCls} placeholder="8+ chars, letter & number" />
                      {passwordToggle}
                    </div>
                    <FieldError message={signUpForm.formState.errors.password?.message} />
                  </div>
                  <button type="submit" disabled={signUpForm.formState.isSubmitting} className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-60">
                    {signUpForm.formState.isSubmitting ? 'Creating...' : <>Create Account <ArrowRight size={14} /></>}
                  </button>
                  <p className="text-center font-lato text-xs text-[var(--text-mid)]">
                    Already have an account?{' '}
                    <button type="button" onClick={() => switchEmailMode('signin')} className={linkBtnCls}>Sign in</button>
                  </p>
                </motion.form>
              )}

              {!clerkEnabled && method === 'email' && emailMode === 'forgot' && (
                <motion.div key="forgot" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  {resetSentTo ? (
                    <div className="text-center space-y-3">
                      <div className="mx-auto w-12 h-12 rounded-full bg-teal/10 text-teal flex items-center justify-center">
                        <Mail size={22} />
                      </div>
                      <p className="font-lato text-sm text-deep">
                        If an account exists for <strong>{resetSentTo}</strong>, a reset link is on its way. It expires in 30 minutes.
                      </p>
                      {devResetUrl && (
                        <a href={devResetUrl} className="block font-lato text-xs text-teal underline break-all">
                          [Dev] Open reset link
                        </a>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={forgotForm.handleSubmit(forgot)} noValidate className="space-y-4">
                      <div>
                        <label htmlFor="fp-email" className={labelCls}>Account Email</label>
                        <div className={inputWrapCls}>
                          <span className={iconCls}><Mail size={15} /></span>
                          <input id="fp-email" {...forgotForm.register('email')} type="email" autoComplete="email" className={inputCls} placeholder="you@example.com" autoFocus />
                        </div>
                        <FieldError message={forgotForm.formState.errors.email?.message} />
                      </div>
                      <button type="submit" disabled={forgotForm.formState.isSubmitting} className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-60">
                        {forgotForm.formState.isSubmitting ? 'Sending...' : <>Send Reset Link <KeyRound size={14} /></>}
                      </button>
                    </form>
                  )}
                  <div className="mt-5 flex flex-col items-center gap-2">
                    <button type="button" onClick={() => switchEmailMode('signin')} className={linkBtnCls}>Back to sign in</button>
                    <button type="button" onClick={() => router.push(`/login/whatsapp?next=${encodeURIComponent(next)}`)} className={linkBtnCls}>
                      Signed up with phone? Log in with WhatsApp instead
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {isAuthenticated && (
              <p className="mt-5 text-center font-lato text-xs text-[var(--text-mid)]">You are already signed in. Redirecting…</p>
            )}
          </div>
        </div>
      </div>
      <Footer settings={null} />
    </>
  );
}
