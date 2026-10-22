import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const authenticateWithRedirect = vi.fn();
let client: { signIn: { authenticateWithRedirect: typeof authenticateWithRedirect } } | undefined;

vi.mock('@clerk/nextjs', () => ({ useClerk: () => ({ client }) }));

async function clickGoogle(next = '/account') {
  const { ClerkGoogleButton } = await import('@/frontend/components/auth/ClerkGoogleButton');
  const onError = vi.fn();
  const el = ClerkGoogleButton({ next, onError, children: 'Google' }) as ReactElement<{ onClick: () => Promise<void> }>;
  await el.props.onClick();
  return onError;
}

describe('ClerkGoogleButton', () => {
  afterEach(() => {
    authenticateWithRedirect.mockReset();
    vi.unstubAllGlobals();
  });

  it('always starts a fresh Google redirect (even after an abandoned attempt)', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://nikunjsakhi.in' } });
    client = { signIn: { authenticateWithRedirect } };
    authenticateWithRedirect.mockResolvedValue(undefined);

    const onError = await clickGoogle('/checkout');

    expect(authenticateWithRedirect).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectUrl: '/sso-callback?next=%2Fcheckout',
      redirectUrlComplete: 'https://nikunjsakhi.in/checkout',
      oidcPrompt: 'select_account',
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an error instead of failing silently', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://nikunjsakhi.in' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    client = { signIn: { authenticateWithRedirect } };
    authenticateWithRedirect.mockRejectedValue(new Error('network'));
    expect(await clickGoogle()).toHaveBeenCalledWith('Google sign-in failed. Please try again.');

    client = undefined;
    expect(await clickGoogle()).toHaveBeenCalledWith('Google sign-in failed. Please try again.');
  });
});
