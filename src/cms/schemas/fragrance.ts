import { defineField, defineType } from 'sanity';

export const fragrance = defineType({
  name: 'fragrance',
  title: 'Fragrance',
  type: 'document',
  icon: () => '🌸',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
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
      description: 'Optional scent notes for merchandising.',
    }),
  ],
  preview: {
    select: { title: 'name' },
  },
});
