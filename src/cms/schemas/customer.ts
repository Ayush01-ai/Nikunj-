import { defineField, defineType } from 'sanity';

export const customer = defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
  icon: () => '👤',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required().min(2).max(100),
    }),
    defineField({
      name: 'phone',
      title: 'Phone',
      type: 'string',
      validation: (rule) =>
        rule.required().regex(/^[6-9]\d{9}$/, {
          name: 'indian-mobile',
          invert: false,
        }),
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (rule) => rule.email(),
    }),
    defineField({
      name: 'isActive',
      title: 'Active Status',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'phone',
      email: 'email',
    },
    prepare({ title, subtitle, email }) {
      return {
        title,
        subtitle: email ? `${subtitle} · ${email}` : subtitle,
      };
    },
  },
});
