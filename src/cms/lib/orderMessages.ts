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
  refunded: 'Refunded',
};

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
    default:
      return `Namaste ${name} 🙏\nUpdate on your order *${id}*: ${ORDER_STATUS_LABEL[order.status ?? ''] ?? order.status}.\nTrack: ${track}`;
  }
}

/** WhatsApp text a customer sends to the shop right after placing an order. */
export function orderPlacedMessage(order: OrderMessageInput & { paymentMethod?: string; city?: string }, origin: string) {
  return `Namaste 🙏 I have placed an order on Nikunj Sakhi.\n\nOrder ID: *${order.orderNumber}*\n${itemLines(order.items)}\n\nTotal: *${inr(order.total)}*${order.paymentMethod ? `\nPayment: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid online'}` : ''}${order.city ? `\nDeliver to: ${order.city}` : ''}\n\nTrack: ${trackOrderUrl(origin, order.orderNumber)}`;
}
