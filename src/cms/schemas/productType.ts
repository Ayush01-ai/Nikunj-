import { defineArrayMember, defineField, defineType } from 'sanity';

export const PRODUCT_FACETS = [
  { title: 'Deity', value: 'deity' },
  { title: 'Deity Size', value: 'size' },
  { title: 'Fragrance', value: 'fragrance' },
  { title: 'Volume / Pack Size', value: 'volume' },
  { title: 'Material', value: 'material' },
  { title: 'Colour', value: 'colour' },
];

export const productType = defineType({
  name: 'productType',
  title: 'Product Type',
  type: 'document',
  icon: () => '🏷️',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Sub-category shown in the Shop menu, e.g. Mukut, Mala, Attar, Agarbatti.',
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
      name: 'category',
      title: 'Parent Category',
      type: 'reference',
      to: [{ type: 'category' }],
      description: 'The main category this type belongs to, e.g. Mukut → Deity Shringar.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Tile Image',
      type: 'image',
      options: { hotspot: true },
      fields: [defineField({ name: 'alt', title: 'Alt Text', type: 'string' })],
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'appliesFacets',
      title: 'Filters for this type',
      type: 'array',
      of: [defineArrayMember({ type: 'string' })],
      options: { list: PRODUCT_FACETS, layout: 'grid' },
      description: 'Which filters customers see when browsing this type.',
    }),
    defineField({
      name: 'isActive',
      title: 'Active / Visible',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'showInMenu',
      title: 'Show in Shop Menu',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display Order',
      type: 'number',
      initialValue: 0,
      validation: (rule) => rule.required().min(0).integer(),
    }),
  ],
  preview: {
    select: {
      title: 'name',
      category: 'category.name',
      order: 'displayOrder',
      active: 'isActive',
      media: 'image',
    },
    prepare({ title, category, order, active, media }) {
      return {
        title: `${active === false ? '❌ ' : ''}${title}`,
        subtitle: `${category || '⚠️ No category'} · Order ${order ?? 0}`,
        media,
      };
    },
  },
  orderings: [
    {
      title: 'Category, then Order',
      name: 'categoryOrder',
      by: [
        { field: 'category.name', direction: 'asc' },
        { field: 'displayOrder', direction: 'asc' },
      ],
    },
  ],
});
