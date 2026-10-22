'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, KeyRound, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/frontend/store/authStore';
import { Navbar } from '@/frontend/components/layout/Navbar';
import { Footer } from '@/frontend/components/layout/Footer';
import { resetPasswordSchema as schema } from '@/frontend/lib/formSchemas';

type Form = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);
  const form = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') ?? '');
    setEmail(params.get('email') ?? '');
    setReady(true);
  }, []);

  const submit = async ({ password }: Form) => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not reset password');
      setUser(json.user);
      toast.success('Password updated. You are signed in 🙏');
      router.replace('/account');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset password');
    }
  };

  const invalidLink = ready && (!token || !email);
  const inputWrap = 'flex items-center border border-[var(--border)] bg-white focus-within:border-gold';

  return (
    <>
      <Navbar settings={null} />
      <div className="relative min-h-screen flex items-center justify-center px-4 pt-8 pb-10 overflow-hidden">
        <Image src="/login-bg.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-cream/70 backdrop-blur-[2px]" />
        <div className="relative w-full max-w-md bg-white/90 backdrop-blur-sm border border-gold/30 shadow-gold-sm p-8">
          <h1 className="font-cinzel text-lg font-semibold text-deep mb-1 flex items-center gap-2">
            <KeyRound size={18} className="text-gold" /> Set a New Password
          </h1>
          {invalidLink ? (
            <div className="mt-4 space-y-4">
              <p className="font-lato text-sm text-[var(--text-mid)]">This reset link is incomplete or invalid. Please request a new one.</p>
              <Link prefetch={false} href="/login" className="btn-gold inline-flex">Back to Login</Link>
            </div>
          ) : (
            <>
              <p className="font-crimson italic text-[var(--text-mid)] mb-6">{email ? `For ${email}` : '\u00a0'}</p>
              <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
                {(['password', 'confirm'] as const).map((field) => (
                  <div key={field}>
                    <label htmlFor={`rp-${field}`} className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] block mb-1.5">
                      {field === 'password' ? 'New Password' : 'Confirm Password'}
                    </label>
                    <div className={inputWrap}>
                      <span className="px-3 text-[var(--text-mid)]"><Lock size={15} /></span>
                      <input
                        id={`rp-${field}`}
                        {...form.register(field)}
                        type={show ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="flex-1 min-w-0 py-3 pr-3 font-lato text-sm text-deep outline-none bg-transparent"
                      />
                      {field === 'password' && (
                        <button type="button" onClick={() => setShow((s) => !s)} className="px-3 text-[var(--text-mid)] hover:text-gold" aria-label={show ? 'Hide password' : 'Show password'}>
                          {show ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      )}
                    </div>
                    {form.formState.errors[field] && (
                      <p className="text-red-500 text-[11px] mt-1">{form.formState.errors[field]?.message}</p>
                    )}
                  </div>
                ))}
                <button type="submit" disabled={form.formState.isSubmitting || !ready} className="btn-gold w-full disabled:opacity-60">
                  {form.formState.isSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <Footer settings={null} />
    </>
  );
}
