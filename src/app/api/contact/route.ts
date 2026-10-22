import { NextRequest, NextResponse } from 'next/server';
import sanitizeHtml from 'sanitize-html';
import { clientIp, createRateLimiter } from '@/backend/lib/rateLimit';

// Rate limiter: 5 submissions per 10 minutes per IP
const isRateLimited = createRateLimiter(5, 10 * 60 * 1000, 'api/contact:isRateLimited');

const clean = (val: unknown) =>
  typeof val === 'string'
    ? sanitizeHtml(val, { allowedTags: [], allowedAttributes: {} }).trim()
    : '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = clean(body?.name);
    const phone = clean(body?.phone);
    const email = clean(body?.email);
    const orderId = clean(body?.orderId);
    const subject = clean(body?.subject);
    const message = clean(body?.message);
    const honeypot = clean(body?.honeypot);

    // Bot detection via honeypot
    if (honeypot) {
      return NextResponse.json({ success: true, message: 'Message received.' });
    }

    if (!name || name.length < 2) {
      return NextResponse.json({ success: false, error: 'Please enter your name.' }, { status: 400 });
    }

    if (!phone && !email) {
      return NextResponse.json({ success: false, error: 'Please enter a phone number or email address so we can reach you.' }, { status: 400 });
    }

    if (!message || message.length < 5) {
      return NextResponse.json({ success: false, error: 'Please write a message with at least 5 characters.' }, { status: 400 });
    }

    const ip = clientIp(req);
    if (await isRateLimited(`ip:${ip}`)) {
      return NextResponse.json(
        { success: false, error: 'Too many submissions. Please try again in a few minutes or message us directly on WhatsApp.' },
        { status: 429 },
      );
    }

    // Log the contact message for store operations
    console.log('[Contact Message Received]', {
      name,
      phone,
      email,
      orderId,
      subject,
      messageLength: message.length,
      receivedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Thank you! Your message has been received. Our team will get back to you shortly.',
    });
  } catch (error) {
    console.error('[contact error]', error);
    return NextResponse.json({ success: false, error: 'Failed to process inquiry. Please try WhatsApp support.' }, { status: 500 });
  }
}
