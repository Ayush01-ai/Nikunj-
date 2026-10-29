import { NextResponse } from 'next/server';
import crypto from 'crypto';
import type { IUser } from '@/backend/models/User';
import { signToken, type LoginMethod } from '@/backend/lib/auth';
import { getAdminSettings } from '@/backend/lib/sanityOrders';

const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export function publicUser(user: IUser) {
  return {
    _id: user._id.toString(),
    phone: user.phone,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    authProviders: user.authProviders ?? [],
    addresses: user.addresses ?? [],
    createdAt: user.createdAt?.toISOString?.() ?? '',
  };
}

/** Admin numbers are managed in Sanity -> Admin Access. An empty list leaves roles untouched. */
export async function syncAdminRole(user: IUser): Promise<void> {
  if (!user.phone) return;
  const { adminPhones } = await getAdminSettings();
  if (adminPhones && adminPhones.length > 0) {
    // Admin elevation requires the phone number to be verified via WhatsApp or phone auth
    const isPhoneVerified = user.authProviders?.includes('whatsapp') || user.authProviders?.includes('phone');
    const role = adminPhones.includes(user.phone) && isPhoneVerified ? 'admin' : 'user';
    if (user.role !== role) {
      user.role = role;
      await user.save();
    }
  }
}

export function setSessionCookie(res: NextResponse, user: IUser, method?: LoginMethod): string {
  const token = signToken({ userId: user._id.toString(), phone: user.phone ?? '', role: user.role, ...(method ? { method } : {}) });
  res.cookies.set('ns_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return token;
}

/** JSON success response that also starts the cookie session. */
export function sessionResponse(user: IUser, message = 'Login successful', method?: LoginMethod) {
  const res = NextResponse.json({ success: true, message, user: publicUser(user) });
  setSessionCookie(res, user, method);
  return res;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

/** 8+ chars with at least one letter and one number. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password is too long.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain a letter and a number.';
  return null;
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function siteUrl(fallbackOrigin?: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || fallbackOrigin || 'http://localhost:3000').replace(/\/$/, '');
}