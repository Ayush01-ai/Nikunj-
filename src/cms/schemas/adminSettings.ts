import { defineArrayMember, defineField, defineType } from 'sanity';

const MOBILE = /^[6-9]\d{9}$/;

// Stored under the private ID `settings.admin` so these numbers are never exposed by the public API.
export const adminSettings = defineType({
  name: 'adminSettings',
  title: 'Admin Access',
  type: 'document',
  icon: () => '🔐',
  liveEdit: true,
  fields: [
    defineField({
      name: 'ownerWhatsApp',
      title: 'Order WhatsApp Number',
      type: 'string',
      description:
        '10-digit mobile number (no +91). Customers send their order confirmation to this WhatsApp number, and you send status updates from it.',
      validation: (R) => R.regex(MOBILE, { name: '10-digit Indian mobile number' }),
    }),
    defineField({
      name: 'adminPhones',
      title: 'Admin Mobile Numbers',
      type: 'array',
      description:
        '10-digit numbers (no +91) that get admin access when they log in on the website with OTP. Remove a number to revoke access.',
      of: [defineArrayMember({ type: 'string', validation: (R) => R.regex(MOBILE, { name: '10-digit Indian mobile number' }) })],
      validation: (R) => R.unique(),
    }),
    defineField({
      name: 'deliveryPartnerName',
      title: 'Delivery Partner',
      type: 'string',
      description: 'Your usual courier / pickup person, e.g. Delhivery, Shiprocket, India Post, local rider.',
    }),
    defineField({
      name: 'deliveryPartnerWhatsApp',
      title: 'Delivery Partner WhatsApp Number',
      type: 'string',
      description:
        '10-digit number (no +91). The "Send to Delivery Partner" button on an order opens WhatsApp to this number with the address, items and COD amount.',
      validation: (R) => R.regex(MOBILE, { name: '10-digit Indian mobile number' }),
    }),
    defineField({
      name: 'returnWindowDays',
      title: 'Return Window (days after delivery)',
      type: 'number',
      initialValue: 7,
      description: 'The Orders Dashboard flags return requests made after this many days from delivery.',
      validation: (R) => R.min(0).max(60).integer(),
    }),
    defineField({
      name: 'refundDeliveryCharge',
      title: 'Refund delivery / COD charges too',
      type: 'boolean',
      initialValue: false,
      description:
        'OFF (recommended): refunds return only the item value — delivery / COD charges are kept, and customers are told this politely before they cancel or return. ' +
        'ON: the full amount paid is refunded. You can still switch between "Full" and "Items only" for any single refund in the Orders Dashboard.',
    }),
  ],
  preview: { prepare: () => ({ title: 'Admin Access' }) },
});
