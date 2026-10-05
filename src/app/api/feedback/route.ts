import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { writeClient } from '@/cms/lib/client';
import { isValidPhone, sanitizePhone } from '@/backend/lib/auth';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';

const feedbackSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20),
  rating: z.coerce.number().int().min(1).max(5),
  product: z.string().trim().max(100).optional(),
  message: z.string().trim().min(10).max(500),
  website: z.string().max(200).optional(), // honeypot
});

// Best-effort, per-instance limiter: 3 submissions per 10 minutes per IP and per phone.
const isRateLimited = createRateLimiter(3, 10 * 60 * 1000);

const plain = (v: string) => sanitizeHtml(v, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();

const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Please check the form and try again.' }, { status: 400 });
  }
  const { name, phone, rating, product, message, website } = parsed.data;

  // Bots fill hidden fields; respond as if accepted so they don't retry.
  if (website) return NextResponse.json({ success: true }, { status: 201 });

  if (!isValidPhone(phone)) {
    return NextResponse.json({ success: false, error: 'Enter a valid 10-digit mobile number.' }, { status: 400 });
  }
  const cleanPhone = sanitizePhone(phone);

  const ip = clientIp(req);
  if (isRateLimited(`ip:${ip}`) || isRateLimited(`phone:${cleanPhone}`)) {
    return NextResponse.json(
      { success: false, error: 'Too many submissions. Please try again later.' },
      { status: 429 },
    );
  }

  const customerName = plain(name);
  const review = plain(message);
  const productName = product ? plain(product) : '';
  if (customerName.length < 2 || review.length < 10) {
    return NextResponse.json({ success: false, error: 'Please check the form and try again.' }, { status: 400 });
  }

  if (!process.env.SANITY_API_TOKEN) {
    console.error('[feedback] SANITY_API_TOKEN is not configured');
    return NextResponse.json({ success: false, error: 'Feedback is temporarily unavailable.' }, { status: 503 });
  }

  try {
    // Saved as a draft: drafts are private, so pending reviews and phone numbers never become public.
    await writeClient.create({
      _id: `drafts.${randomUUID()}`,
      _type: 'testimonial',
      status: 'pending',
      source: 'website-form',
      customerName,
      initials: initialsOf(customerName),
      phone: cleanPhone,
      rating,
      review,
      ...(productName && { productName }),
      submittedAt: new Date().toISOString(),
      isVerified: false,
      isActive: false,
      displayOrder: 0,
    });
  } catch (error) {
    console.error('[feedback]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Feedback is temporarily unavailable.' }, { status: 503 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
