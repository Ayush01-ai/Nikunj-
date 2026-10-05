import { defineType, defineField } from 'sanity';

export const coupon = defineType({
  name: 'coupon',
  title: 'Coupon / Discount Code',
  type: 'document',
  icon: () => '🏷️',
  fields: [
    defineField({
      name: 'code',
      title: 'Coupon Code',
      type: 'string',
      validation: (R) =>
        R.required()
          .uppercase()
          .regex(/^[A-Z0-9]{3,20}$/, { name: 'alphanumeric', invert: false })
          .custom((value) => {
            if (value && value !== value.toUpperCase()) {
              return 'Coupon code must be uppercase';
            }
            return true;
          }),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'string',
      description: 'Internal note — e.g. "Diwali Special 20% off"',
    }),
    defineField({
      name: 'discountType',
      title: 'Discount Type',
      type: 'string',
      options: {
        list: [
          { title: 'Percentage (%)', value: 'percentage' },
          { title: 'Fixed Amount (₹)', value: 'fixed' },
        ],
        layout: 'radio',
      },
      initialValue: 'percentage',
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'discountValue',
      title: 'Discount Value',
      type: 'number',
      description: 'Percentage (e.g. 15 = 15%) or fixed amount (e.g. 100 = ₹100)',
      validation: (R) => R.required().positive(),
    }),
    defineField({
      name: 'minimumOrderValue',
      title: 'Minimum Order Value (₹)',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'maximumDiscountCap',
      title: 'Maximum Discount Cap (₹)',
      type: 'number',
      description: 'For percentage coupons — max discount allowed (0 = no cap)',
      initialValue: 0,
    }),
    defineField({
      name: 'usageLimit',
      title: 'Total Usage Limit',
      type: 'number',
      description: '0 = unlimited',
      initialValue: 0,
    }),
    defineField({
      name: 'perUserLimit',
      title: 'Per User Limit',
      type: 'number',
      description: '0 = unlimited',
      initialValue: 1,
    }),
    defineField({
      name: 'validFrom',
      title: 'Valid From',
      type: 'datetime',
    }),
    defineField({
      name: 'validUntil',
      title: 'Valid Until',
      type: 'datetime',
    }),
    defineField({
      name: 'applicableCategories',
      title: 'Applicable Categories',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'category' }] }],
      description: 'Leave empty for all categories',
    }),
    defineField({
      name: 'isActive',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
    }),
  ],

  preview: {
    select: {
      title: 'code',
      subtitle: 'description',
      active: 'isActive',
      type: 'discountType',
      value: 'discountValue',
    },
    prepare({ title, subtitle, active, type, value }) {
      const discount = type === 'percentage' ? `${value}% off` : `₹${value} off`;
      return {
        title: `${active ? '✅' : '❌'} ${title} — ${discount}`,
        subtitle: subtitle || '',
      };
    },
  },
});
