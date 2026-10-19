import { describe, it, expect } from 'vitest';
import {
  phoneSchema,
  otpSchema,
  signInSchema,
  signUpSchema,
  forgotSchema,
  resetPasswordSchema,
  feedbackFormSchema,
  feedbackApiSchema,
} from '@/frontend/lib/formSchemas';

const firstMessage = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? '' : r.error!.issues[0].message;

describe('phoneSchema', () => {
  it.each(['6000000000', '9876543210'])('accepts %s', (phone) => {
    expect(phoneSchema.safeParse({ phone }).success).toBe(true);
  });
  it.each(['5876543210', '987654321', '98765432100', '98765 43210', '+919876543210', '', 'abcdefghij', '9876543210\n'])(
    'rejects %j',
    (phone) => {
      const r = phoneSchema.safeParse({ phone });
      expect(r.success).toBe(false);
      expect(firstMessage(r)).toBe('Enter a valid 10-digit mobile number');
    },
  );
  it('rejects missing, null and non-string values without throwing', () => {
    expect(phoneSchema.safeParse({}).success).toBe(false);
    expect(phoneSchema.safeParse({ phone: null }).success).toBe(false);
    expect(phoneSchema.safeParse({ phone: 9876543210 }).success).toBe(false);
    expect(phoneSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('otpSchema', () => {
  it('accepts exactly 6 digits', () => expect(otpSchema.safeParse({ otp: '012345' }).success).toBe(true));
  it.each(['12345', '1234567', '12345a', ' 12345', ''])('rejects %j', (otp) => {
    const r = otpSchema.safeParse({ otp });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toBe('Enter the 6-digit OTP');
  });
});

describe('signInSchema', () => {
  it('trims email and accepts any non-empty password', () => {
    const r = signInSchema.safeParse({ email: '  a@b.co ', password: 'x' });
    expect(r.success && r.data.email).toBe('a@b.co');
  });
  it('rejects bad email and empty password with the field messages', () => {
    const r = signInSchema.safeParse({ email: 'nope', password: '' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('Enter a valid email');
    expect(msgs).toContain('Enter your password');
  });
});

describe('signUpSchema', () => {
  const ok = { name: 'Ab', email: 'a@b.co', password: 'abcdefg1' };
  it('accepts boundary values (name 2 and 80 chars, password 8 chars)', () => {
    expect(signUpSchema.safeParse(ok).success).toBe(true);
    expect(signUpSchema.safeParse({ ...ok, name: 'a'.repeat(80) }).success).toBe(true);
  });
  it('rejects name length 1 / 81 and whitespace-only name', () => {
    expect(signUpSchema.safeParse({ ...ok, name: 'a' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, name: 'a'.repeat(81) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, name: '   ' }).success).toBe(false);
  });
  it.each([
    ['abc1234', 'At least 8 characters'],
    ['12345678', 'Include a letter'],
    ['abcdefgh', 'Include a number'],
  ])('rejects password %s', (password, msg) => {
    const r = signUpSchema.safeParse({ ...ok, password });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toContain(msg);
  });
});

describe('forgotSchema', () => {
  it('validates email', () => {
    expect(forgotSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(forgotSchema.safeParse({ email: 'a@' }).success).toBe(false);
    expect(forgotSchema.safeParse({ email: 5 }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts matching valid passwords', () => {
    expect(resetPasswordSchema.safeParse({ password: 'abcdefg1', confirm: 'abcdefg1' }).success).toBe(true);
  });
  it('reports the mismatch on the confirm field', () => {
    const r = resetPasswordSchema.safeParse({ password: 'abcdefg1', confirm: 'abcdefg2' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Passwords do not match');
      expect(r.error.issues[0].path).toEqual(['confirm']);
    }
  });
  it('rejects weak passwords and missing confirm', () => {
    expect(resetPasswordSchema.safeParse({ password: 'short1', confirm: 'short1' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'abcdefg1' }).success).toBe(false);
  });
});

describe('feedbackFormSchema (client form)', () => {
  const ok = { name: 'Asha', phone: '9876543210', rating: '5', message: '1234567890' };
  it('accepts boundary message lengths 10 and 500', () => {
    expect(feedbackFormSchema.safeParse(ok).success).toBe(true);
    expect(feedbackFormSchema.safeParse({ ...ok, message: 'x'.repeat(500) }).success).toBe(true);
  });
  it('rejects message 9 / 501 chars, bad phone, empty rating, long product', () => {
    expect(feedbackFormSchema.safeParse({ ...ok, message: 'x'.repeat(9) }).success).toBe(false);
    expect(feedbackFormSchema.safeParse({ ...ok, message: 'x'.repeat(501) }).success).toBe(false);
    expect(feedbackFormSchema.safeParse({ ...ok, phone: '12345' }).success).toBe(false);
    expect(firstMessage(feedbackFormSchema.safeParse({ ...ok, rating: '' }))).toBe('Please select a rating');
    expect(feedbackFormSchema.safeParse({ ...ok, product: 'p'.repeat(101) }).success).toBe(false);
  });
});

describe('feedbackApiSchema (server)', () => {
  const ok = { name: ' Asha ', phone: ' 9876543210 ', rating: 5, message: ' 1234567890 ' };
  it('trims strings and coerces a numeric-string rating', () => {
    const r = feedbackApiSchema.safeParse({ ...ok, rating: '4' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({ name: 'Asha', phone: '9876543210', rating: 4, message: '1234567890' });
    }
  });
  it.each([0, 6, 3.5, 'abc', NaN, 'Infinity'])('rejects rating %j', (rating) => {
    expect(feedbackApiSchema.safeParse({ ...ok, rating }).success).toBe(false);
  });
  it('enforces rating boundaries 1 and 5', () => {
    expect(feedbackApiSchema.safeParse({ ...ok, rating: 1 }).success).toBe(true);
    expect(feedbackApiSchema.safeParse({ ...ok, rating: 5 }).success).toBe(true);
  });
  it('enforces length limits after trimming', () => {
    expect(feedbackApiSchema.safeParse({ ...ok, name: ' a ' }).success).toBe(false);
    expect(feedbackApiSchema.safeParse({ ...ok, message: ' short ' }).success).toBe(false);
    expect(feedbackApiSchema.safeParse({ ...ok, message: 'x'.repeat(501) }).success).toBe(false);
    expect(feedbackApiSchema.safeParse({ ...ok, phone: '1'.repeat(21) }).success).toBe(false);
    expect(feedbackApiSchema.safeParse({ ...ok, website: 'w'.repeat(201) }).success).toBe(false);
  });
  it('rejects malformed bodies without throwing', () => {
    for (const body of [null, undefined, 'str', 42, [], {}, { name: {}, phone: [], rating: {}, message: null }]) {
      expect(feedbackApiSchema.safeParse(body).success).toBe(false);
    }
  });
  it('does not pass through unknown keys', () => {
    const r = feedbackApiSchema.safeParse({ ...ok, isAdmin: true });
    expect(r.success && 'isAdmin' in r.data).toBe(false);
  });
});
