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

export const isWhatsAppConfigured = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

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
