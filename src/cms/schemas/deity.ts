import { defineField, defineType } from 'sanity';

export const deity = defineType({
  name: 'deity',
  title: 'Deity',
  type: 'document',
  icon: () => '🛕',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Display name used in filters and product relationships.',
      validation: (rule) => rule.required().min(2).max(80),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'name', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      description: 'Short description for admin clarity and optional frontend use.',
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: { hotspot: true },
      fields: [defineField({ name: 'alt', title: 'Alt Text', type: 'string' })],
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display Order',
      type: 'number',
      initialValue: 0,
      validation: (rule) => rule.required().min(0).integer(),
    }),
    defineField({
      name: 'isActive',
      title: 'Active Status',
      type: 'boolean',
      initialValue: true,
      description: 'Disable to hide from product filters without deleting records.',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      media: 'image',
      active: 'isActive',
      order: 'displayOrder',
    },
    prepare({ title, media, active, order }) {
      return {
        title: `${active ? '✅' : '❌'} ${title}`,
        subtitle: `Order: ${order ?? 0}`,
        media,
      };
    },
  },
});
