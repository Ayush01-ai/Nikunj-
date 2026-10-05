import { defineType, defineField } from 'sanity';

export const testimonial = defineType({
  name: 'testimonial',
  title: 'Review / Feedback',
  type: 'document',
  icon: () => '⭐',
  fields: [
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: '🕒 Pending approval', value: 'pending' },
          { title: '✅ Approved', value: 'approved' },
          { title: '🚫 Rejected', value: 'rejected' },
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      initialValue: 'approved',
      description: 'Use the "Approve & Publish" / "Reject" buttons for website submissions.',
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      options: { list: [{ title: 'Website form', value: 'website-form' }, { title: 'Added manually', value: 'manual' }] },
      initialValue: 'manual',
      readOnly: true,
    }),
    defineField({
      name: 'customerName',
      title: 'Customer Name',
      type: 'string',
      validation: (R) => R.required().max(80),
    }),
    defineField({
      name: 'phone',
      title: 'Phone (private)',
      type: 'string',
      readOnly: true,
      hidden: ({ value }) => !value,
      description: 'Only visible to you. Removed automatically when the review is approved.',
      // Blocks the default Publish button so phone numbers never reach the public dataset.
      validation: (R) =>
        R.custom((value) => (value ? 'Use "Approve & Publish" to publish — it removes the phone number first.' : true)),
    }),
    defineField({
      name: 'location',
      title: 'Location (City / State)',
      type: 'string',
    }),
    defineField({
      name: 'avatar',
      title: 'Customer Photo',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'initials',
      title: 'Initials (Fallback Avatar)',
      type: 'string',
      description: 'e.g. "RK" — shown when no photo uploaded',
      validation: (R) => R.max(3),
    }),
    defineField({
      name: 'rating',
      title: 'Rating (1–5)',
      type: 'number',
      validation: (R) => R.required().min(1).max(5).integer(),
      initialValue: 5,
    }),
    defineField({
      name: 'review',
      title: 'Review Text',
      type: 'text',
      rows: 5,
      validation: (R) => R.required().max(500),
    }),
    defineField({
      name: 'productPurchased',
      title: 'Product Purchased',
      type: 'reference',
      to: [{ type: 'product' }],
      description: 'Optional — link to the product they reviewed',
    }),
    defineField({
      name: 'productName',
      title: 'Product (as typed by customer)',
      type: 'string',
      readOnly: true,
      hidden: ({ value }) => !value,
    }),
    defineField({
      name: 'submittedAt',
      title: 'Submitted At',
      type: 'datetime',
      readOnly: true,
      hidden: ({ value }) => !value,
    }),
    defineField({
      name: 'isVerified',
      title: 'Verified Purchase',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'isActive',
      title: 'Show on Website',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display Order',
      type: 'number',
      initialValue: 0,
    }),
  ],

  preview: {
    select: {
      title: 'customerName',
      subtitle: 'review',
      media: 'avatar',
      rating: 'rating',
      active: 'isActive',
      status: 'status',
    },
    prepare({ title, subtitle, media, rating, active, status }) {
      const stars = '★'.repeat(rating || 0);
      const badge = status === 'pending' ? '🕒' : status === 'rejected' ? '🚫' : active ? '✅' : '❌';
      return {
        title: `${badge} ${stars} ${title}`,
        subtitle: subtitle ? `${subtitle.substring(0, 60)}${subtitle.length > 60 ? '…' : ''}` : '',
        media,
      };
    },
  },
});
