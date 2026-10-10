// Plain helpers shared by Studio actions and website pages (no React / server-only imports).

export interface OrderMessageInput {
  orderNumber?: string;
  status?: string;
  customerName?: string;
  total?: number;
  paymentStatus?: string;
  tracking?: { courier?: string; trackingNumber?: string; trackingUrl?: string };
  items?: { productName?: string; option?: string; colour?: string; quantity?: number; price?: number }[];
}

export const ORDER_STEPS = ['confirmed', 'processing', 'shipped', 'delivered'] as const;

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting payment',
  confirmed: 'Order confirmed',
  processing: 'Being packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  return_requested: 'Return requested',
  return_approved: 'Return approved — pickup scheduled',
  returned: 'Return received',
  refunded: 'Refunded',
};

export const RETURN_STATUSES = ['return_requested', 'return_approved', 'returned', 'refunded'] as const;
export const isReturnStatus = (s?: string) => (RETURN_STATUSES as readonly string[]).includes(s ?? '');

/** Whole days since the order was delivered (from status history), or null if never delivered. */
export function daysSinceDelivered(history: { status?: string; at?: string }[] = []) {
  const at = [...history].reverse().find((h) => h.status === 'delivered')?.at;
  if (!at) return null;
  return Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
}

export const trackOrderUrl = (origin: string, orderNumber?: string) =>
  `${origin}/track-order${orderNumber ? `?id=${encodeURIComponent(orderNumber)}` : ''}`;

const inr = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

export function itemLines(items: OrderMessageInput['items'] = []) {
  return items
    .map((i) => {
      const extras = [i.option, i.colour].filter(Boolean).join(', ');
      return `• ${i.quantity ?? 1} × ${i.productName ?? 'Item'}${extras ? ` (${extras})` : ''} — ${inr((i.price ?? 0) * (i.quantity ?? 1))}`;
    })
    .join('\n');
}

/** WhatsApp text the owner sends when an order's status changes. */
export function orderStatusMessage(order: OrderMessageInput, origin: string) {
  const name = order.customerName?.split(' ')[0] || 'Devotee';
  const id = order.orderNumber ?? '';
  const track = trackOrderUrl(origin, id);
  const t = order.tracking;
  switch (order.status) {
    case 'confirmed':
      return `Namaste ${name} 🙏\nYour Nikunj Sakhi order *${id}* is confirmed.\n\n${itemLines(order.items)}\n\nTotal: *${inr(order.total)}*\nWe will update you when it ships.\nTrack anytime: ${track}`;
    case 'processing':
      return `Namaste ${name} 🙏\nYour order *${id}* is being lovingly packed and will ship soon.\nTrack: ${track}`;
    case 'shipped':
      return `Namaste ${name} 🙏\nGood news! Your order *${id}* has been shipped${t?.courier ? ` via ${t.courier}` : ''}.${t?.trackingNumber ? `\nTracking number: ${t.trackingNumber}` : ''}\nTrack: ${t?.trackingUrl || track}`;
    case 'delivered':
      return `Namaste ${name} 🙏\nYour order *${id}* has been delivered. We hope Thakur Ji loves it!\nPlease share your feedback: ${origin}/#feedback`;
    case 'cancelled':
      return `Namaste ${name} 🙏\nYour order *${id}* has been cancelled.${order.paymentStatus === 'refund_due' || order.paymentStatus === 'refunded' ? ' Your refund is being processed to the original payment method.' : ''}\nPlease reply here if you have any questions.`;
          case 'return_requested':
            return `Namaste ${name} 🙏\nWe have received your return request for order *${id}*. We will review it and get back to you shortly.`;
          case 'return_approved':
            return `Namaste ${name} 🙏\nYour return for order *${id}* is approved. Our delivery partner will pick up the item soon — please keep it packed with all tags.`;
          case 'returned':
            return `Namaste ${name} 🙏\nWe have received the returned item for order *${id}*. Your refund will be processed shortly.`;
          case 'refunded':
            return `Namaste ${name} 🙏\nThe refund for order *${id}* has been processed to your original payment method. It may take 5–7 working days to reflect.`;
          default:
      return `Namaste ${name} 🙏\nUpdate on your order *${id}*: ${ORDER_STATUS_LABEL[order.status ?? ''] ?? order.status}.\nTrack: ${track}`;
  }
}

export interface ShipmentInput extends OrderMessageInput {
  phone?: string;
  paymentMethod?: string;
  shippingAddress?: { line1?: string; line2?: string; landmark?: string; city?: string; state?: string; pincode?: string };
}

/** Pickup / shipment request the owner forwards to the delivery partner. */
export function deliveryPartnerMessage(order: ShipmentInput) {
  const a = order.shippingAddress ?? {};
  const address = [a.line1, a.line2, a.landmark && `Near ${a.landmark}`, [a.city, a.state].filter(Boolean).join(', '), a.pincode]
    .filter(Boolean)
    .join('\n');
  const cod = order.paymentMethod === 'cod' && order.paymentStatus !== 'paid';
  const pieces = (order.items ?? []).reduce((n, i) => n + (i.quantity ?? 1), 0);
  return `📦 *Pickup request — Nikunj Sakhi*\nOrder: *${order.orderNumber ?? ''}*\n\n*Deliver to*\n${order.customerName ?? ''}\n📞 ${order.phone ?? ''}\n${address}\n\n*Contents* (${pieces} pc)\n${itemLines(order.items)}\n\n${cod ? `💰 *COD — collect ${inr(order.total)}*` : '✅ Prepaid — do not collect cash'}\n\nPlease share the AWB / tracking number after pickup.`;
}

/** WhatsApp text a customer sends to the shop right after placing an order. */
export function orderPlacedMessage(order: OrderMessageInput & { paymentMethod?: string; city?: string }, origin: string) {
  return `Namaste 🙏 I have placed an order on Nikunj Sakhi.\n\nOrder ID: *${order.orderNumber}*\n${itemLines(order.items)}\n\nTotal: *${inr(order.total)}*${order.paymentMethod ? `\nPayment: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid online'}` : ''}${order.city ? `\nDeliver to: ${order.city}` : ''}\n\nTrack: ${trackOrderUrl(origin, order.orderNumber)}`;
}
