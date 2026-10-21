import { test, expect } from '@playwright/test';

test('collections filter and sort client-side from the static page', async ({ page }) => {
  await page.goto('/collections');
  const found = page.getByText(/\d+ products? found/);
  await expect(found).toBeVisible();
  const total = parseInt((await found.innerText()).match(/\d+/)![0], 10);
  expect(total).toBeGreaterThan(0);

  await page.goto('/collections?search=zzqqxx');
  await expect(page.getByText('No products found')).toBeVisible();
  await expect(page.getByText('0 products found')).toBeVisible();

  await page.goto('/collections?sort=price_desc&minPrice=1');
  await expect(page.getByText(/\d+ products? found/)).toBeVisible();
});
