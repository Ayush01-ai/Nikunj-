/**
 * Transactional email via the Resend HTTP API (no SDK dependency).
 * Configure RESEND_API_KEY and EMAIL_FROM (e.g. "Nikunj Sakhi <orders@yourdomain.com>").
 * Returns false when email is not configured so callers can fall back gracefully.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error('[email] Resend error', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email]', err);
    return false;
  }
}

const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const inr = (n?: number) => `&#8377;${(n ?? 0).toLocaleString('en-IN')}`;

export interface OrderEmailInput {
  orderNumber: string;
  customerName?: string;
  items: { productName?: string; option?: string; colour?: string; price?: number; quantity?: number }[];
  subtotal?: number;
  deliveryCharge?: number;
  discount?: number;
  total?: number;
  paymentMethod?: string;
  trackUrl: string;
}

export function orderConfirmationEmail(order: OrderEmailInput): string {
  const name = order.customerName?.split(' ')[0];
  const rows = order.items
    .map((i) => {
      const extras = [i.option, i.colour].filter(Boolean).join(', ');
      return `<tr>
        <td style="padding:6px 0">${escapeHtml(i.quantity ?? 1)} &times; ${escapeHtml(i.productName ?? 'Item')}${extras ? ` <span style="color:#7a6a58">(${escapeHtml(extras)})</span>` : ''}</td>
        <td style="padding:6px 0;text-align:right">${inr((i.price ?? 0) * (i.quantity ?? 1))}</td>
      </tr>`;
    })
    .join('');
  const summary = [
    ['Subtotal', inr(order.subtotal)],
    ['Delivery', order.deliveryCharge ? inr(order.deliveryCharge) : 'Free'],
    ...(order.discount ? [['Discount', `-${inr(order.discount)}`]] : []),
  ]
    .map(([k, v]) => `<tr><td style="padding:2px 0;color:#7a6a58">${k}</td><td style="padding:2px 0;text-align:right">${v}</td></tr>`)
    .join('');
  const payment = order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid online';

  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#2b2118">
    <h2 style="color:#0f6d6a;margin:0 0 4px">Nikunj Sakhi</h2>
    <p style="color:#c9922a;margin:0 0 20px;font-size:13px">Serve with Devotion</p>
    <p>${name ? `Jai Shri Radhe ${escapeHtml(name)},` : 'Jai Shri Radhe,'}</p>
    <p>Thank you for your order! Your order <strong>${escapeHtml(order.orderNumber)}</strong> is confirmed.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee">${rows}</table>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${summary}
      <tr><td style="padding:6px 0;font-weight:bold">Total</td><td style="padding:6px 0;text-align:right;font-weight:bold">${inr(order.total)}</td></tr>
    </table>
    <p style="font-size:13px;color:#7a6a58">Payment: ${payment}</p>
    <p style="margin:28px 0">
      <a href="${escapeHtml(order.trackUrl)}" style="background:#0f6d6a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">Track your order</a>
    </p>
    <p style="font-size:12px;color:#7a6a58">We will notify you when your order ships.</p>
  </div>`;
}

/** Status-update email: the same wording as the WhatsApp message, safely escaped. */
export function orderStatusEmail(customerName: string | undefined, message: string, trackUrl: string): string {
  const body = escapeHtml(message).replace(/\n/g, '<br>');
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#2b2118">
    <h2 style="color:#0f6d6a;margin:0 0 4px">Nikunj Sakhi</h2>
    <p style="color:#c9922a;margin:0 0 20px;font-size:13px">Serve with Devotion</p>
    <p style="font-size:14px;line-height:1.6">${body}</p>
    <p style="margin:28px 0">
      <a href="${escapeHtml(trackUrl)}" style="background:#0f6d6a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">Track your order</a>
    </p>
  </div>`;
}

export function passwordResetEmail(name: string | undefined, url: string): string {
  const greeting = name ? `Jai Shri Radhe ${name},` : 'Jai Shri Radhe,';
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#2b2118">
    <h2 style="color:#0f6d6a;margin:0 0 4px">Nikunj Sakhi</h2>
    <p style="color:#c9922a;margin:0 0 20px;font-size:13px">Serve with Devotion</p>
    <p>${greeting}</p>
    <p>We received a request to reset your password. This link is valid for 30 minutes.</p>
    <p style="margin:28px 0">
      <a href="${url}" style="background:#0f6d6a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">Reset password</a>
    </p>
    <p style="font-size:12px;color:#7a6a58">If you did not request this, you can safely ignore this email.</p>
  </div>`;
}