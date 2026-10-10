import { defineArrayMember, defineField, defineType } from 'sanity';

export const ORDER_STATUS_LIST = [
  { title: '⏳ Awaiting payment', value: 'pending' },
  { title: '🆕 New — to pack', value: 'confirmed' },
  { title: '📦 Packing / Processing', value: 'processing' },
  { title: '🚚 Shipped', value: 'shipped' },
  { title: '✅ Delivered', value: 'delivered' },
  { title: '❌ Cancelled', value: 'cancelled' },
  { title: '🔁 Return requested', value: 'return_requested' },
  { title: '↩️ Return approved — awaiting pickup', value: 'return_approved' },
  { title: '📥 Returned — item received', value: 'returned' },
  { title: '💸 Refunded', value: 'refunded' },
];

const statusTitle = (value?: string) => ORDER_STATUS_LIST.find((s) => s.value === value)?.title ?? value ?? '';

// Orders are created by the website (never by hand) under the private ID path `orders.<orderId>`,
// so customer names, phones and addresses are not readable from the public dataset API.
export const order = defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  icon: () => '📦',
  liveEdit: true,
  groups: [
    { name: 'manage', title: 'Manage', default: true },
    { name: 'items', title: 'Items & Payment' },
    { name: 'customer', title: 'Customer' },
    { name: 'history', title: 'History' },
  ],
  fields: [
    defineField({
      name: 'orderNumber',
      title: 'Order ID',
      type: 'string',
      group: 'manage',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Order Status',
      type: 'string',
      group: 'manage',
      readOnly: true,
      description: 'Use the buttons at the bottom (e.g. "Mark as Shipped") — the customer sees changes instantly.',
      options: { list: ORDER_STATUS_LIST },
    }),
    defineField({
      name: 'tracking',
      title: 'Courier & Tracking',
      type: 'object',
      group: 'manage',
      description: 'Fill this in before marking the order as Shipped. It is shown to the customer.',
      fields: [
        defineField({
          name: 'courier',
          title: 'Courier Name',
          type: 'string',
          description: 'e.g. Delhivery, Shiprocket, India Post, DTDC, Blue Dart, local rider',
        }),
        defineField({ name: 'trackingNumber', title: 'Tracking / AWB Number', type: 'string' }),
        defineField({
          name: 'trackingUrl',
          title: 'Tracking Link',
          type: 'url',
          validation: (R) => R.uri({ scheme: ['https'] }),
        }),
        defineField({
          name: 'handedOverAt',
          title: 'Sent to Delivery Partner At',
          type: 'datetime',
          description: 'Filled automatically by the "Send to Delivery Partner" button.',
        }),
      ],
    }),
    defineField({
      name: 'returnInfo',
      title: 'Return / Refund',
      type: 'object',
      group: 'manage',
      description: 'Managed from the Orders Dashboard. Returns are accepted within the return window (Admin Settings) after delivery.',
      hidden: ({ document }) =>
        !document?.returnInfo && !['return_requested', 'return_approved', 'returned', 'refunded'].includes(String(document?.status ?? '')),
      fields: [
        defineField({ name: 'reasonCategory', title: 'Reason (chosen by customer)', type: 'string', readOnly: true }),
        defineField({ name: 'reason', title: 'Return Reason / Details', type: 'text', rows: 2 }),
        defineField({
          name: 'photos',
          title: 'Customer Photos (defect proof)',
          type: 'array',
          readOnly: true,
          of: [defineArrayMember({ type: 'image' })],
          options: { layout: 'grid' },
        }),
        defineField({
          name: 'requestedBy',
          title: 'Requested By',
          type: 'string',
          readOnly: true,
          options: { list: [{ title: 'Customer (website)', value: 'customer' }, { title: 'Admin', value: 'admin' }] },
        }),
        defineField({ name: 'requestedAt', title: 'Requested At', type: 'datetime' }),
        defineField({ name: 'rejectedReason', title: 'Rejection Note (shown to customer)', type: 'text', rows: 2 }),
        defineField({ name: 'rejectedAt', title: 'Rejected At', type: 'datetime' }),
        defineField({ name: 'approvedAt', title: 'Approved At', type: 'datetime' }),
        defineField({ name: 'receivedAt', title: 'Item Received At', type: 'datetime' }),
        defineField({ name: 'refundAmount', title: 'Refund Amount (INR)', type: 'number', validation: (R) => R.min(0) }),
        defineField({ name: 'refundedAt', title: 'Refunded At', type: 'datetime' }),
        defineField({ name: 'withinWindow', title: 'Requested within return window', type: 'boolean', readOnly: true }),
      ],
    }),
    defineField({
      name: 'cancelRequest',
      title: 'Cancellation Request (from customer)',
      type: 'object',
      group: 'manage',
      readOnly: true,
      description: 'Raised by the customer on the Track Order page. Approve or reject it from the Orders Dashboard.',
      hidden: ({ value }) => !value,
      fields: [
        defineField({
          name: 'state',
          title: 'Decision',
          type: 'string',
          options: {
            list: [
              { title: '⏳ Awaiting review', value: 'pending' },
              { title: '✅ Approved — order cancelled', value: 'approved' },
              { title: '🚫 Rejected', value: 'rejected' },
            ],
          },
        }),
        defineField({ name: 'reasonCategory', title: 'Reason', type: 'string' }),
        defineField({ name: 'details', title: 'Customer Comments', type: 'text', rows: 2 }),
        defineField({ name: 'requestedAt', title: 'Requested At', type: 'datetime' }),
        defineField({ name: 'decidedAt', title: 'Decided At', type: 'datetime' }),
        defineField({ name: 'decisionNote', title: 'Note to Customer', type: 'text', rows: 2 }),
      ],
    }),
    defineField({
      name: 'internalNotes',
      title: 'Private Notes',
      type: 'text',
      rows: 3,
      group: 'manage',
      description: 'Only visible to you.',
    }),
    defineField({
      name: 'placedAt',
      title: 'Placed At',
      type: 'datetime',
      group: 'manage',
      readOnly: true,
    }),

    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      group: 'items',
      readOnly: true,
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({ name: 'productId', title: 'Product ID', type: 'string' }),
            defineField({ name: 'productName', title: 'Product', type: 'string' }),
            defineField({ name: 'image', title: 'Image URL', type: 'url' }),
            defineField({ name: 'option', title: 'Option / Size', type: 'string' }),
            defineField({ name: 'colour', title: 'Colour', type: 'string' }),
            defineField({ name: 'price', title: 'Unit Price (INR)', type: 'number' }),
            defineField({ name: 'quantity', title: 'Quantity', type: 'number' }),
          ],
          preview: {
            select: { title: 'productName', option: 'option', colour: 'colour', qty: 'quantity', price: 'price' },
            prepare: ({ title, option, colour, qty, price }) => ({
              title: `${qty ?? 1} × ${title ?? 'Item'}`,
              subtitle: [option, colour, price !== undefined ? `₹${price} each` : ''].filter(Boolean).join(' · '),
            }),
          },
        }),
      ],
    }),
    defineField({ name: 'subtotal', title: 'Subtotal (INR)', type: 'number', group: 'items', readOnly: true }),
    defineField({ name: 'deliveryCharge', title: 'Delivery (INR)', type: 'number', group: 'items', readOnly: true }),
    defineField({ name: 'discount', title: 'Discount (INR)', type: 'number', group: 'items', readOnly: true }),
    defineField({ name: 'couponCode', title: 'Coupon', type: 'string', group: 'items', readOnly: true }),
    defineField({ name: 'total', title: 'Total (INR)', type: 'number', group: 'items', readOnly: true }),
    defineField({
      name: 'paymentMethod',
      title: 'Payment Method',
      type: 'string',
      group: 'items',
      readOnly: true,
      options: {
        list: [
          { title: 'Cash on Delivery', value: 'cod' },
          { title: 'UPI', value: 'upi' },
          { title: 'Card', value: 'card' },
          { title: 'Net Banking', value: 'netbanking' },
          { title: 'WhatsApp', value: 'whatsapp' },
        ],
      },
    }),
    defineField({
      name: 'paymentStatus',
      title: 'Payment Status',
      type: 'string',
      group: 'items',
      description: 'For Cash on Delivery, change this to Paid once you receive the money.',
      options: {
        list: [
          { title: 'Pending', value: 'pending' },
          { title: 'Paid', value: 'paid' },
          { title: 'Refund due', value: 'refund_due' },
          { title: 'Refunded', value: 'refunded' },
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
    }),
    defineField({ name: 'razorpayPaymentId', title: 'Razorpay Payment ID', type: 'string', group: 'items', readOnly: true, hidden: ({ value }) => !value }),

    defineField({ name: 'customerName', title: 'Customer Name', type: 'string', group: 'customer', readOnly: true }),
    defineField({ name: 'phone', title: 'Phone', type: 'string', group: 'customer', readOnly: true }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      group: 'customer',
      readOnly: true,
      fields: [
        defineField({ name: 'line1', title: 'Address Line 1', type: 'string' }),
        defineField({ name: 'line2', title: 'Address Line 2', type: 'string' }),
        defineField({ name: 'landmark', title: 'Landmark', type: 'string' }),
        defineField({ name: 'city', title: 'City', type: 'string' }),
        defineField({ name: 'state', title: 'State', type: 'string' }),
        defineField({ name: 'pincode', title: 'Pincode', type: 'string' }),
      ],
    }),

    defineField({
      name: 'statusHistory',
      title: 'Status History',
      type: 'array',
      group: 'history',
      readOnly: true,
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({ name: 'status', title: 'Status', type: 'string', options: { list: ORDER_STATUS_LIST } }),
            defineField({ name: 'at', title: 'At', type: 'datetime' }),
            defineField({ name: 'note', title: 'Note', type: 'string' }),
          ],
          preview: {
            select: { status: 'status', at: 'at', note: 'note' },
            prepare: ({ status, at, note }) => ({
              title: statusTitle(status),
              subtitle: [at ? new Date(at).toLocaleString('en-IN') : '', note].filter(Boolean).join(' · '),
            }),
          },
        }),
      ],
    }),
    defineField({ name: 'stockAdjusted', title: 'Stock Adjusted', type: 'boolean', readOnly: true, hidden: true }),
  ],
  preview: {
    select: {
      orderNumber: 'orderNumber',
      customer: 'customerName',
      city: 'shippingAddress.city',
      total: 'total',
      status: 'status',
      placedAt: 'placedAt',
    },
    prepare({ orderNumber, customer, city, total, status, placedAt }) {
      const date = placedAt ? new Date(placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
      return {
        title: `${statusTitle(status).split(' ')[0]} ${orderNumber ?? 'Order'} · ${customer ?? ''}`,
        subtitle: [`₹${total ?? 0}`, city, date].filter(Boolean).join(' · '),
      };
    },
  },
  orderings: [{ title: 'Newest first', name: 'placedAtDesc', by: [{ field: 'placedAt', direction: 'desc' }] }],
});
