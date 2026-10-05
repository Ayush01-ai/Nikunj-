import { defineType, defineField } from 'sanity';

export const category = defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  icon: () => '📂',
  fields: [
    defineField({
      name: 'name',
      title: 'Category Name',
      type: 'string',
      description: 'Main category label shown in storefront navigation and filters.',
      validation: (R) => R.required().min(2).max(60),
    }),
    defineField({
      name: 'slug',
      title: 'Slug (URL)',
      type: 'slug',
      options: { source: 'name', maxLength: 80 },
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      description: 'Short summary used for SEO snippets or category headers.',
    }),
    defineField({
      name: 'image',
      title: 'Featured Image',
      type: 'image',
      options: { hotspot: true },
      description: 'Primary image for the category card.',
      fields: [
        defineField({ name: 'alt', type: 'string', title: 'Alt Text' }),
      ],
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'emoji',
      title: 'Emoji Icon',
      type: 'string',
      description: 'Used as fallback icon (e.g. 🪬)',
      validation: (R) => R.max(4),
    }),
    defineField({
      name: 'isActive',
      title: 'Active / Visible',
      type: 'boolean',
      initialValue: true,
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'isFeatured',
      title: 'Show on Homepage',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'showInMenu',
      title: 'Show in Shop Menu',
      type: 'boolean',
      initialValue: true,
      description: 'Categories only appear in the menu once they have at least one active product.',
    }),
    defineField({
      name: 'bannerImage',
      title: 'Collection Page Banner',
      type: 'image',
      options: { hotspot: true },
      description: 'Optional wide image shown at the top of the category page.',
      fields: [defineField({ name: 'alt', type: 'string', title: 'Alt Text' })],
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display Order',
      type: 'number',
      initialValue: 0,
      validation: (R) => R.required().min(0).integer(),
    }),
    defineField({
      name: 'seoTitle',
      title: 'SEO Title',
      type: 'string',
      validation: (R) => R.max(60),
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO Description',
      type: 'text',
      rows: 2,
      validation: (R) => R.max(160),
    }),
  ],

  preview: {
    select: {
      title: 'name',
      media: 'image',
      active: 'isActive',
      featured: 'isFeatured',
      emoji: 'emoji',
    },
    prepare({ title, media, active, featured, emoji }) {
      return {
        title: `${active ? '✅' : '❌'} ${featured ? '🏠 ' : ''}${emoji || ''} ${title}`,
        media,
      };
    },
  },

  orderings: [
    {
      title: 'Display Order',
      name: 'displayOrderAsc',
      by: [{ field: 'displayOrder', direction: 'asc' }],
    },
  ],
});
