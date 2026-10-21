import { test, expect } from '@playwright/test';

const wrongPhone = '9000000001';
const goodPhone = '9000000002';

async function requestOtp(page: import('@playwright/test').Page, phone: string): Promise<string> {
  await page.goto('/login/whatsapp');
  await page.getByPlaceholder('9XXXXXXXXX').fill(phone);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/whatsapp/send-otp')),
    page.getByRole('button', { name: /Send OTP via WhatsApp/i }).click(),
  ]);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body._devOtp).toBe('string');
  return body._devOtp as string;
}

test('wrong OTP is rejected', async ({ page }) => {
  const otp = await requestOtp(page, wrongPhone);
  const wrong = otp === '000000' ? '111111' : '000000';
  await page.getByPlaceholder('------').fill(wrong);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/whatsapp/verify-otp')),
    page.getByRole('button', { name: /Verify & Continue/i }).click(),
  ]);
  expect(res.ok()).toBe(false);
  await expect(page).toHaveURL(/login\/whatsapp/);
});

test('valid OTP signs the user in and is single-use', async ({ page, request }) => {
  const otp = await requestOtp(page, goodPhone);
  await page.getByPlaceholder('------').fill(otp);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/whatsapp/verify-otp')),
    page.getByRole('button', { name: /Verify & Continue/i }).click(),
  ]);
  expect(res.status()).toBe(200);
  await page.waitForURL('**/account', { timeout: 60_000 });

  const me = await page.request.get('/api/auth/me');
  expect(me.ok()).toBe(true);

  // Replaying the same OTP must fail.
  const replay = await request.post('/api/auth/whatsapp/verify-otp', {
    data: { phone: goodPhone, otp },
  });
  expect(replay.ok()).toBe(false);
});
