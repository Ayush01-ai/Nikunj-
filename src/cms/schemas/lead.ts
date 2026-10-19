import { defineField, defineType } from 'sanity';

/** Created by the website when a shopper types a valid mobile number at checkout (see /api/analytics/track). */
export const lead = defineType({
  name: 'lead',
  title: 'Checkout Lead',
  type: 'document',
  icon: () => '📱',
  readOnly: true,
  fields: [
    defineField({ name: 'phone', title: 'Phone', type: 'string' }),
    defineField({ name: 'name', title: 'Name', type: 'string' }),
    defineField({ name: 'cartValue', title: 'Cart value (₹)', type: 'number' }),
    defineField({ name: 'cartItems', title: 'Cart items', type: 'text', rows: 2 }),
    defineField({ name: 'firstSeenAt', title: 'First seen', type: 'datetime' }),
    defineField({ name: 'lastSeenAt', title: 'Last seen at checkout', type: 'datetime' }),
    defineField({ name: 'converted', title: 'Placed an order', type: 'boolean' }),
    defineField({ name: 'orderId', title: 'Latest order', type: 'string' }),
    defineField({ name: 'convertedAt', title: 'Ordered at', type: 'datetime' }),
  ],
  orderings: [{ title: 'Most recent', name: 'lastSeenDesc', by: [{ field: 'lastSeenAt', direction: 'desc' }] }],
  preview: {
    select: { phone: 'phone', name: 'name', converted: 'converted', cartValue: 'cartValue', orderId: 'orderId' },
    prepare: ({ phone, name, converted, cartValue, orderId }) => ({
      title: name ? `${name} · ${phone}` : phone,
      subtitle: converted ? `✅ Ordered ${orderId ?? ''}` : `🛒 Did not order${cartValue ? ` · cart ₹${cartValue}` : ''}`,
    }),
  },
});
