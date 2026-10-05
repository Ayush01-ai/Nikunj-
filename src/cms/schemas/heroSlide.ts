import { defineType, defineField } from 'sanity';

export const heroSlide = defineType({
  name: 'heroSlide',
  title: 'Hero Slide / Banner',
  type: 'document',
  icon: () => '🖼️',
  fields: [
    defineField({
      name: 'title',
      title: 'Main Title',
      type: 'string',
      validation: (R) => R.required().max(80),
    }),
    defineField({
      name: 'subtitle',
      title: 'Subtitle / Tagline',
      type: 'string',
      validation: (R) => R.max(120),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      validation: (R) => R.max(200),
    }),
    defineField({
      name: 'image',
      title: 'Background Image',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({ name: 'alt', type: 'string', title: 'Alt Text' }),
      ],
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'mobileImage',
      title: 'Mobile Background Image',
      type: 'image',
      options: { hotspot: true },
      description: 'Optional — optimized for portrait screens',
    }),
    defineField({
      name: 'ctaPrimary',
      title: 'Primary CTA Button',
      type: 'object',
      fields: [
        defineField({ name: 'label', type: 'string', title: 'Label', initialValue: 'Explore Collection' }),
        defineField({ name: 'link', type: 'string', title: 'Link/URL', initialValue: '/collections' }),
      ],
    }),
    defineField({
      name: 'ctaSecondary',
      title: 'Secondary CTA Button',
      type: 'object',
      fields: [
        defineField({ name: 'label', type: 'string', title: 'Label', initialValue: 'View Offers' }),
        defineField({ name: 'link', type: 'string', title: 'Link/URL', initialValue: '#products' }),
      ],
    }),
    defineField({
      name: 'overlayColor',
      title: 'Overlay Color Opacity',
      type: 'number',
      initialValue: 0.3,
      validation: (R) => R.min(0).max(1),
    }),
    defineField({
      name: 'textColor',
      title: 'Text Color',
      type: 'string',
      options: { list: ['light', 'dark'] },
      initialValue: 'light',
    }),
    defineField({
      name: 'isActive',
      title: 'Active',
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
      title: 'title',
      subtitle: 'subtitle',
      media: 'image',
      active: 'isActive',
    },
    prepare({ title, subtitle, media, active }) {
      return {
        title: `${active ? '✅' : '❌'} ${title}`,
        subtitle,
        media,
      };
    },
  },
});
