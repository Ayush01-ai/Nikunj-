import { describe, expect, it } from 'vitest';
import * as send from '@/app/api/auth/send-otp/route';
import * as verify from '@/app/api/auth/verify-otp/route';

describe('retired SMS phone-login routes (only Google, email/password and WhatsApp OTP are login methods)', () => {

  it('send-otp returns 410 and sends nothing', () => {
    expect(send.POST().status).toBe(410);
  });

  it('verify-otp returns 410 and issues no session', () => {
    const res = verify.POST();
    expect(res.status).toBe(410);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
