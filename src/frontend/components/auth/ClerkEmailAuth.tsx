'use client';

import { useState } from 'react';
import { useSignIn, useSignUp } from '@clerk/nextjs';
import { ArrowRight, KeyRound, Lock, Mail, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { forgotSchema, passwordRule, signInSchema, signUpSchema } from '@/frontend/lib/formSchemas';

export type EmailMode = 'signin' | 'signup' | 'forgot';
type Step = 'form' | 'code' | 'newPassword';
type ClerkResult = { error: unknown } | { error: null } | undefined;

const labelCls = 'font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] block mb-1.5';
const inputWrapCls = 'flex items-center border border-[var(--border)] bg-white focus-within:border-gold transition-colors';
const iconCls = 'px-3 text-[var(--text-mid)] flex items-center';
const inputCls = 'flex-1 min-w-0 py-3 pr-3 font-lato text-sm text-deep outline-none bg-transparent';
const linkBtnCls = 'font-lato text-xs text-teal hover:text-gold underline-offset-2 hover:underline transition-colors';
const submitCls = 'btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-60';

function clerkMessage(error: unknown, fallback: string): string {
  const e = error as { longMessage?: string; message?: string; errors?: { longMessage?: string; message?: string }[] } | null;
  return e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.longMessage || e?.message || fallback;
}

/**
 * Email/password auth through Clerk's client SDK (no server routes, no Mongoose). Only render
 * when <ClerkProvider> is mounted (see ClerkEnabledContext) — Clerk hooks throw otherwise.
 * After a Clerk session exists, a full navigation lets AuthBootstrap pick it up via /api/auth/me.
 */
export function ClerkEmailAuth({
  mode,
  onModeChange,
  next,
}: {
  mode: EmailMode;
  onModeChange: (mode: EmailMode) => void;
  next: string;
}) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeKind, setCodeKind] = useState<'signup' | 'mfa' | 'reset'>('signup');
  const [fieldError, setFieldError] = useState('');

  const reset = (m: EmailMode) => {
    setStep('form');
    setCode('');
    setFieldError('');
    setShowPassword(false);
    onModeChange(m);
  };

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setFieldError('');
    try {
      await fn();
    } catch (err) {
      console.error('[clerk email auth]', err);
      const msg = clerkMessage(err, fallback);
      setFieldError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const check = (res: ClerkResult, fallback: string) => {
    if (res && res.error) throw new Error(clerkMessage(res.error, fallback));
  };

  const finish = async (finalize: () => Promise<ClerkResult>) => {
    check(await finalize(), 'Could not complete sign-in');
    toast.success('Namaste! Welcome 🙏');
    window.location.assign(next);
  };

  const submitSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return setFieldError(parsed.error.issues[0].message);
    void run(async () => {
      check(await signIn.password({ identifier: parsed.data.email, password: parsed.data.password }), 'Incorrect email or password');
      if (signIn.status === 'complete') return finish(() => signIn.finalize());
      if (signIn.status === 'needs_client_trust') {
        // New device: Clerk requires an emailed code before it issues the session.
        check(await signIn.mfa.sendEmailCode(), 'Could not send verification code');
        setCodeKind('mfa');
        setStep('code');
        return;
      }
      throw new Error('Additional verification is required for this account. Please use Google or WhatsApp.');
    }, 'Login failed');
  };

  const submitSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse({ name, email, password });
    if (!parsed.success) return setFieldError(parsed.error.issues[0].message);
    void run(async () => {
      check(
        await signUp.password({ emailAddress: parsed.data.email, password: parsed.data.password, firstName: parsed.data.name }),
        'Could not create account',
      );
      check(await signUp.verifications.sendEmailCode(), 'Could not send verification code');
      setCodeKind('signup');
      setStep('code');
      toast.success('We emailed you a verification code');
    }, 'Could not create account');
  };

  const submitForgot = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = forgotSchema.safeParse({ email });
    if (!parsed.success) return setFieldError(parsed.error.issues[0].message);
    void run(async () => {
      check(await signIn.create({ identifier: parsed.data.email }), 'Could not start password reset');
      check(await signIn.resetPasswordEmailCode.sendCode(), 'Could not send reset code');
      setCodeKind('reset');
      setStep('code');
      toast.success('Check your inbox for the reset code');
    }, 'Could not send reset code');
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setFieldError('Enter the 6-digit code');
    void run(async () => {
      const value = code.trim();
      if (codeKind === 'signup') {
        check(await signUp.verifications.verifyEmailCode({ code: value }), 'Invalid code');
        if (signUp.status !== 'complete') {
          throw new Error('Your account needs more details. Please use Google or WhatsApp to sign in.');
        }
        return finish(() => signUp.finalize());
      }
      if (codeKind === 'mfa') {
        check(await signIn.mfa.verifyEmailCode({ code: value }), 'Invalid code');
        return finish(() => signIn.finalize());
      }
      check(await signIn.resetPasswordEmailCode.verifyCode({ code: value }), 'Invalid code');
      setStep('newPassword');
      setPassword('');
    }, 'Verification failed');
  };

  const submitNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordRule.safeParse(password);
    if (!parsed.success) return setFieldError(parsed.error.issues[0].message);
    void run(async () => {
      check(await signIn.resetPasswordEmailCode.submitPassword({ password }), 'Could not set the new password');
      if (signIn.status !== 'complete') throw new Error('Could not complete the password reset');
      return finish(() => signIn.finalize());
    }, 'Could not set the new password');
  };

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

  const errorLine = fieldError ? (
    <p role="alert" className="text-red-500 text-[11px]">{fieldError}</p>
  ) : null;

  if (step === 'code') {
    const title =
      codeKind === 'reset' ? 'Enter the reset code' : codeKind === 'mfa' ? 'Verify this device' : 'Verify your email';
    return (
      <form onSubmit={submitCode} noValidate className="space-y-4" data-testid="clerk-code-form">
        <p className="font-lato text-sm text-deep">
          {title}: we sent a 6-digit code to <strong>{email}</strong>.
        </p>
        <div>
          <label htmlFor="ce-code" className={labelCls}>Code</label>
          <div className={inputWrapCls}>
            <span className={iconCls}><KeyRound size={15} /></span>
            <input id="ce-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={inputCls} placeholder="123456" autoFocus />
          </div>
        </div>
        {errorLine}
        <button type="submit" disabled={busy} className={submitCls}>{busy ? 'Verifying...' : <>Verify <ArrowRight size={14} /></>}</button>
        <button type="button" onClick={() => reset('signin')} className={linkBtnCls}>Start over</button>
      </form>
    );
  }

  if (step === 'newPassword') {
    return (
      <form onSubmit={submitNewPassword} noValidate className="space-y-4">
        <div>
          <label htmlFor="ce-newpass" className={labelCls}>New password</label>
          <div className={inputWrapCls}>
            <span className={iconCls}><Lock size={15} /></span>
            <input id="ce-newpass" value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" className={inputCls} placeholder="8+ chars, letter & number" autoFocus />
            {passwordToggle}
          </div>
        </div>
        {errorLine}
        <button type="submit" disabled={busy} className={submitCls}>{busy ? 'Saving...' : <>Set password <ArrowRight size={14} /></>}</button>
      </form>
    );
  }

  if (mode === 'forgot') {
    return (
      <form onSubmit={submitForgot} noValidate className="space-y-4">
        <div>
          <label htmlFor="ce-email" className={labelCls}>Account Email</label>
          <div className={inputWrapCls}>
            <span className={iconCls}><Mail size={15} /></span>
            <input id="ce-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className={inputCls} placeholder="you@example.com" autoFocus />
          </div>
        </div>
        {errorLine}
        <button type="submit" disabled={busy} className={submitCls}>{busy ? 'Sending...' : <>Send Reset Code <KeyRound size={14} /></>}</button>
        <div className="flex justify-center"><button type="button" onClick={() => reset('signin')} className={linkBtnCls}>Back to sign in</button></div>
      </form>
    );
  }

  const isSignUp = mode === 'signup';
  return (
    <form onSubmit={isSignUp ? submitSignUp : submitSignIn} noValidate className="space-y-4" data-testid={isSignUp ? 'clerk-signup-form' : 'clerk-signin-form'}>
      {isSignUp && (
        <div>
          <label htmlFor="ce-name" className={labelCls}>Full Name</label>
          <div className={inputWrapCls}>
            <span className={iconCls}><UserIcon size={15} /></span>
            <input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputCls} placeholder="Your name" />
          </div>
        </div>
      )}
      <div>
        <label htmlFor="ce-email" className={labelCls}>Email</label>
        <div className={inputWrapCls}>
          <span className={iconCls}><Mail size={15} /></span>
          <input id="ce-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className={inputCls} placeholder="you@example.com" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="ce-password" className={labelCls}>Password</label>
          {!isSignUp && (
            <button type="button" onClick={() => reset('forgot')} className={`${linkBtnCls} mb-1.5`}>Forgot password?</button>
          )}
        </div>
        <div className={inputWrapCls}>
          <span className={iconCls}><Lock size={15} /></span>
          <input id="ce-password" value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} className={inputCls} placeholder={isSignUp ? '8+ chars, letter & number' : '••••••••'} />
          {passwordToggle}
        </div>
      </div>
      {errorLine}
      <button type="submit" disabled={busy} className={submitCls}>
        {busy ? (isSignUp ? 'Creating...' : 'Signing in...') : isSignUp ? <>Create Account <ArrowRight size={14} /></> : <>Sign In <ArrowRight size={14} /></>}
      </button>
      <p className="text-center font-lato text-xs text-[var(--text-mid)]">
        {isSignUp ? 'Already have an account? ' : 'New here? '}
        <button type="button" onClick={() => reset(isSignUp ? 'signin' : 'signup')} className={linkBtnCls}>
          {isSignUp ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </form>
  );
}
