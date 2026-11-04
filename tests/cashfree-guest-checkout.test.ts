import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CashfreeCheckout } from '@/app/checkout/CashfreeCheckout';

const renderCheckout = (initialGuestProof?: string) =>
  renderToStaticMarkup(
    React.createElement(CashfreeCheckout, {
      orderId: 'NS-AB12CD34',
      isGuest: true,
      initialGuestProof,
      onComplete: () => {},
    }),
  );

describe('guest Cashfree checkout OTP gate', () => {
  it('does not ask for OTP in the session that created the online order', () => {
    expect(renderCheckout('short-lived-order-session-proof')).not.toContain('guest-otp-gate');
  });

  it('requires OTP when a guest reopens payment without the original session proof', () => {
    expect(renderCheckout()).toContain('guest-otp-gate');
  });
});
