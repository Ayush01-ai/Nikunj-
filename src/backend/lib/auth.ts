import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';

export class AuthError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message);
    this.name = 'AuthError';
  }
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN_SECONDS = parseInt(process.env.JWT_EXPIRES_IN_SECONDS || '604800', 10); // 7 days default

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

// ─── Token helpers ────────────────────────────────────────────────────────

export function signToken(payload: { userId: string; phone: string; role: string }): string {
  return jwt.sign(payload as object, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN_SECONDS });
}

export function verifyToken(token: string): jwt.JwtPayload & { userId: string; phone: string; role: string } {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload & {
    userId: string;
    phone: string;
    role: string;
  };
}

// ─── Password helpers ─────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

// ─── Extract token from request ───────────────────────────────────────────

export function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Also check cookie
  const cookieToken = req.cookies.get('ns_token')?.value;
  return cookieToken || null;
}

// ─── Auth middleware helper ───────────────────────────────────────────────

export interface AuthPayload {
  userId: string;
  phone: string;
  role: 'user' | 'admin';
}

export function requireAuth(req: NextRequest): AuthPayload {
  const token = extractToken(req);
  if (!token) throw new AuthError('Authentication required', 401);

  let payload: ReturnType<typeof verifyToken>;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AuthError('Invalid or expired session', 401);
  }
  return {
    userId: payload.userId,
    phone: payload.phone,
    role: payload.role as 'user' | 'admin',
  };
}

export function requireAdmin(req: NextRequest): AuthPayload {
  const payload = requireAuth(req);
  if (payload.role !== 'admin') throw new AuthError('Admin access required', 403);
  return payload;
}

// ─── OTP helpers ──────────────────────────────────────────────────────────

export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function isValidPhone(phone: string): boolean {
  // Indian phone numbers: 10 digits, starts with 6-9
  return /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ''));
}

export function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}
