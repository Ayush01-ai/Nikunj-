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
  ],
  preview: { prepare: () => ({ title: 'Admin Access' }) },
});
