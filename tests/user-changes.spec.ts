import { test, expect } from '@playwright/test';

test.describe('User requested enhancements', () => {
  test('1. Footer email and WhatsApp with personalized message', async ({ page }) => {
    await page.goto('/');

    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Verify email link just below Contact Us
    const emailLink = footer.locator('a[href^="mailto:Nikunj.sakhi14@gmail.com"]');
    await expect(emailLink).toBeVisible();
    await expect(emailLink).toHaveAttribute('href', 'mailto:Nikunj.sakhi14@gmail.com');
    await expect(emailLink).toContainText('Nikunj.sakhi14@gmail.com');

    // Verify WhatsApp Us link has personalized prefilled text
    const waLink = footer.locator('a[href*="wa.me"]');
    await expect(waLink).toBeVisible();
    const waHref = await waLink.getAttribute('href');
    expect(waHref).toContain('wa.me/');
    expect(waHref).toContain('text=');
    expect(decodeURIComponent(waHref!)).toContain('Namaste! 🙏 I need assistance regarding Nikunj Sakhi divine ornaments.');
  });

  test('2. Why Choose Us section shows Free Delivery at ₹399', async ({ page }) => {
    await page.goto('/');

    const whyUsSection = page.getByText('Why Choose Us');
    await expect(whyUsSection).toBeVisible();

    // Check Free Delivery card text shows 399
    await expect(page.getByText('Free shipping on orders above ₹399. Fast, secure, and carefully packed.')).toBeVisible();
    // Ensure 999 is NOT present in the why us free delivery text
    await expect(page.getByText(/Free shipping on orders above ₹999/)).toHaveCount(0);
  });

  test('3. Top banner shows Free delivery above ₹399 and coupon code First100 for first 100 customers', async ({ page }) => {
    await page.goto('/');

    const announcement = page.locator('aside[aria-label="Announcement"]');
    await expect(announcement).toBeVisible();

    // Must mention free delivery on orders above ₹399
    await expect(announcement).toContainText('Free delivery on orders above ₹399');

    // Must mention coupon code First100 for first 100 customers only
    await expect(announcement).toContainText('First100');
    await expect(announcement).toContainText('first 100 customers only');
  });

  test('4. Carousel Sacred Collections highlighted product has reduced size and Buy Now button', async ({ page }) => {
    await page.goto('/');

    // Check Sacred Collections section
    const sacredHeading = page.getByRole('heading', { name: /Sacred Collections/i });
    await expect(sacredHeading).toBeVisible();

    // Check carousel active card has Buy Now button replacing View details
    const buyNowBtn = page.getByRole('button', { name: 'Buy Now' }).first();
    await expect(buyNowBtn).toBeVisible();

    const viewDetailsBtn = page.getByRole('link', { name: 'View details' });
    await expect(viewDetailsBtn).toHaveCount(0);

    const activeCard = page.locator('article').filter({
      has: page.locator('div.translate-y-0.opacity-100'),
    }).first();
    const productName = activeCard.locator('h3');
    const productPrice = productName.locator('xpath=following-sibling::p');
    await expect(productName).toBeVisible();
    await expect(productPrice).toBeVisible();

    const nameBounds = await productName.boundingBox();
    const priceBounds = await productPrice.boundingBox();
    expect(nameBounds).not.toBeNull();
    expect(priceBounds).not.toBeNull();
    expect(Math.abs((nameBounds?.y ?? 0) - (priceBounds?.y ?? 0))).toBeLessThan(3);
  });

  test('5. Header Contact Us button opens /contact page with complete support information', async ({ page }) => {
    await page.goto('/');

    // Find the Contact Us link in header desktop nav
    const headerContactLink = page.locator('nav').getByRole('link', { name: 'Contact Us' }).first();
    await expect(headerContactLink).toBeVisible();
    await expect(headerContactLink).toHaveAttribute('href', '/contact');

    // Click and verify navigation to /contact
    await Promise.all([
      page.waitForURL(/\/contact/),
      headerContactLink.click(),
    ]);
    await expect(page).toHaveURL(/\/contact/);

    // Verify contact page content and visible support info
    await expect(page.getByRole('heading', { name: /We Are Here To Assist You/i })).toBeVisible();
    await expect(page.getByText('Nikunj.sakhi14@gmail.com').first()).toBeVisible();
    await expect(page.getByText('+91 91186 98641').first()).toBeVisible();

    // Support Form elements
    await expect(page.getByPlaceholder('e.g. Radhika Sharma')).toBeVisible();
    await expect(page.getByPlaceholder('10-digit mobile number')).toBeVisible();
    await expect(page.getByRole('button', { name: /Send Message/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Chat on WhatsApp Instead/i })).toBeVisible();

    // FAQs present on the contact page
    await expect(page.getByText(/What is the threshold for Free Delivery\?/i)).toBeVisible();
    await expect(page.getByText(/Is there an active discount coupon code\?/i)).toBeVisible();
  });

  test('6. Mobile menu Contact Us link opens /contact instead of feedback', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Open menu' }).click();
    const mobileMenu = page.locator('.fixed.inset-0.z-\\[200\\]');
    const contactLink = mobileMenu.getByRole('link', { name: 'Contact Us' });

    await expect(contactLink).toHaveAttribute('href', '/contact');
    await Promise.all([
      page.waitForURL(/\/contact(?:$|[?#])/),
      contactLink.click(),
    ]);
    await expect(page.getByRole('heading', { name: /We Are Here To Assist You/i })).toBeVisible();
  });
});
