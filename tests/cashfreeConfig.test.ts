import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('cashfreeConfig', () => {
  it('isCashfreeConfigured() is false until BOTH app id and secret are set', async () => {
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;
    const { isCashfreeConfigured } = await import('@/backend/lib/cashfreeConfig');
    expect(isCashfreeConfigured()).toBe(false);

    process.env.CASHFREE_APP_ID = 'app-id';
    expect(isCashfreeConfigured()).toBe(false); // secret still missing

    process.env.CASHFREE_SECRET_KEY = 'secret';
    expect(isCashfreeConfigured()).toBe(true);
  });

  it('isCashfreeEnabledOnClient() only returns true for the literal string "true"', async () => {
    const { isCashfreeEnabledOnClient } = await import('@/backend/lib/cashfreeConfig');

    delete process.env.NEXT_PUBLIC_CASHFREE_ENABLED;
    expect(isCashfreeEnabledOnClient()).toBe(false);

    process.env.NEXT_PUBLIC_CASHFREE_ENABLED = 'yes';
    expect(isCashfreeEnabledOnClient()).toBe(false);

    process.env.NEXT_PUBLIC_CASHFREE_ENABLED = 'true';
    expect(isCashfreeEnabledOnClient()).toBe(true);
  });

  it('cashfreeEnvironment() defaults to SANDBOX unless explicitly PRODUCTION', async () => {
    const { cashfreeEnvironment } = await import('@/backend/lib/cashfreeConfig');

    delete process.env.CASHFREE_ENVIRONMENT;
    expect(cashfreeEnvironment()).toBe('SANDBOX');

    process.env.CASHFREE_ENVIRONMENT = 'production'; // wrong case -> still sandbox
    expect(cashfreeEnvironment()).toBe('SANDBOX');

    process.env.CASHFREE_ENVIRONMENT = 'PRODUCTION';
    expect(cashfreeEnvironment()).toBe('PRODUCTION');
  });

  it('cashfreeEnvironment() accepts CASHFREE_ENV as an alias, with CASHFREE_ENVIRONMENT taking priority', async () => {
    const { cashfreeEnvironment } = await import('@/backend/lib/cashfreeConfig');

    delete process.env.CASHFREE_ENVIRONMENT;
    process.env.CASHFREE_ENV = 'PRODUCTION';
    expect(cashfreeEnvironment()).toBe('PRODUCTION');

    process.env.CASHFREE_ENVIRONMENT = 'SANDBOX';
    expect(cashfreeEnvironment()).toBe('SANDBOX');
  });
});
