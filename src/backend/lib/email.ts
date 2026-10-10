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