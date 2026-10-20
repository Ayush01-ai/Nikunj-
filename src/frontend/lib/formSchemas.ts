import { z } from 'zod';

export const phoneSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
});

export const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
});

export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a number');

export const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().email('Enter a valid email'),
  password: passwordRule,
});

export const forgotSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
});

export const resetPasswordSchema = z
  .object({
    password: passwordRule,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export const feedbackFormSchema = z.object({
  name: z.string().min(2, 'Name required').max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  rating: z.string().min(1, 'Please select a rating'),
  product: z.string().max(100).optional(),
  message: z.string().min(10, 'Please write at least 10 characters').max(500),
  website: z.string().optional(),
});

export const feedbackApiSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20),
  rating: z.coerce.number().int().min(1).max(5),
  product: z.string().trim().max(100).optional(),
  message: z.string().trim().min(10).max(500),
  website: z.string().max(200).optional(), // honeypot
});
