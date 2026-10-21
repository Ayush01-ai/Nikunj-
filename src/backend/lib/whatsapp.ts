import { ORDER_STATUS_LABEL, orderStatusMessage, trackOrderUrl, type OrderMessageInput } from '@/cms/lib/orderMessages';

/**
 * WhatsApp Cloud API (Meta) sender for automatic customer notifications.
 *
 * Env:
 *  - WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID — required; without them every call is a silent no-op.
 *  - WHATSAPP_ORDER_TEMPLATE — approved template name. Meta only delivers free-form text inside a 24h
 *    customer-service window, so production should use a template with 4 body variables:
 *    {{1}} first name, {{2}} order ID, {{3}} status text, {{4}} tracking link.
 *  - WHATSAPP_TEMPLATE_LANG — template language code (default "en").
 */
const GRAPH_URL = 'https://graph.facebook.com/v21.0';

export const isWhatsAppConfigured = () => {
  // Accept alias names so a live token/phone id is always used, in every NODE_ENV.
  const env = process.env;
  if (!env.WHATSAPP_TOKEN) env.WHATSAPP_TOKEN = env.WHATSAPP_ACCESS_TOKEN || env.META_WA_ACCESS_TOKEN;
  if (!env.WHATSAPP_PHONE_NUMBER_ID) env.WHATSAPP_PHONE_NUMBER_ID = env.META_WA_PHONE_NUMBER_ID;
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
};

export let lastOtpSendError = ''; // TEMP-DIAG

/** Approved Meta template for login codes; defaults to the `login_otp` template. */
export const whatsappOtpTemplate = () => process.env.WHATSAPP_OTP_TEMPLATE || 'login_otp';

const origin = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

function toE164India(phone?: string) {
  const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : null;
}

export async function sendOrderWhatsApp(order: OrderMessageInput & { phone?: string }): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;
  const to = toE164India(order.phone);
  if (!to) return false;

  const template = process.env.WHATSAPP_ORDER_TEMPLATE;
  const body = template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                order.customerName?.split(' ')[0] || 'Devotee',
                order.orderNumber ?? '',
                ORDER_STATUS_LABEL[order.status ?? ''] ?? order.status ?? '',
                order.tracking?.trackingUrl || trackOrderUrl(origin(), order.orderNumber),
              ].map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body: orderStatusMessage(order, origin()) } };

  try {
    const res = await fetch(`${GRAPH_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('[whatsapp] send failed', order.orderNumber, res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (error) {
    console.error('[whatsapp] send error', order.orderNumber, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Sends a one-time login code via an approved Meta "authentication" category template,
 * using the exact request shape documented by Meta for authentication templates with a
 * copy-code button:
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates
 *
 * The OTP code must be created in Meta Business Manager as a template with `category:
 * "authentication"` first (see docs/PROVIDER-SETUP-GUIDE.md) — this function only sends
 * against an already-approved template name; it does not create templates.
 *
 * Env:
 *  - WHATSAPP_OTP_TEMPLATE — required; name of the approved authentication template.
 *  - WHATSAPP_OTP_TEMPLATE_LANG — template language/locale code (default "en_US").
 *  - WHATSAPP_OTP_BUTTON — set to "false" if the approved template has no copy-code
 *    button (zero-tap/no-button templates); defaults to including the button component.
 */
export async function sendWhatsAppOtp(phone: string, otp: string): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;
  const template = whatsappOtpTemplate();
  if (!template) {
    console.error('[whatsapp] WHATSAPP_OTP_TEMPLATE is not configured');
    return false;
  }
  const to = toE164India(phone);
  if (!to) return false;

  // The approved template's exact shape (copy-code button or not, "en" vs "en_US") isn't known
  // here, so try the likely variants; Meta rejects a mismatch with a 400 and sends nothing.
  const bodyOnly: Record<string, unknown>[] = [{ type: 'body', parameters: [{ type: 'text', text: otp }] }];
  const withButton: Record<string, unknown>[] = [
    ...bodyOnly,
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
  ];
  const buttonPref = process.env.WHATSAPP_OTP_BUTTON;
  const shapes = buttonPref === 'false' ? [bodyOnly] : buttonPref === 'true' ? [withButton] : [bodyOnly, withButton];
  const langs = process.env.WHATSAPP_OTP_TEMPLATE_LANG ? [process.env.WHATSAPP_OTP_TEMPLATE_LANG] : ['en_US', 'en'];

  for (const components of shapes) {
    for (const lang of langs) {
  try {
    const res = await fetch(`${GRAPH_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: lang },
          components,
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return true;
    const errText = (await res.text()).slice(0, 300);
    console.error('[whatsapp-otp] send failed', res.status, lang, components.length, errText);
    lastOtpSendError = `${res.status} ${lang}/${components.length}: ${errText}`; // TEMP-DIAG
    if (res.status !== 400 && res.status !== 404) return false;
  } catch (error) {
    lastOtpSendError = `exception: ${error instanceof Error ? error.message : String(error)}`; // TEMP-DIAG
    console.error('[whatsapp-otp] send error', error instanceof Error ? error.message : error);
    return false;
  }
    }
  }
  return false;
}

/**
 * Delivery confirmation code via a dedicated approved template (WHATSAPP_DELIVERY_OTP_TEMPLATE, one body
 * variable = the code). Returns false when that template isn't configured, so callers can fall back to
 * the login-OTP authentication template.
 */
export async function sendDeliveryOtpWhatsApp(phone: string, otp: string, orderId: string, onMessageId?: (id: string) => void): Promise<boolean> {
  const template = process.env.WHATSAPP_DELIVERY_OTP_TEMPLATE;
  if (!isWhatsAppConfigured() || !template) return false;
  const to = toE164India(phone);
  if (!to) return false;
  try {
    const res = await fetch(`${GRAPH_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: otp }] }],
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('[whatsapp-delivery-otp] send failed', orderId, res.status, (await res.text()).slice(0, 300));
      return false;
    }
    if (onMessageId) {
      const data = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
      const id = data?.messages?.[0]?.id;
      if (id) onMessageId(id);
    }
    return true;
  } catch (error) {
    console.error('[whatsapp-delivery-otp] send error', orderId, error instanceof Error ? error.message : error);
    return false;
  }
}