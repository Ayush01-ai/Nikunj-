import { defineArrayMember, defineField, defineType } from 'sanity';
import { facetField } from '../components/FacetField';

const isEmpty = (value: unknown) => value === undefined || value === null || (Array.isArray(value) && value.length === 0);

export const product = defineType({
  name: 'product',
  title: 'Product',
  type: 'document',
  icon: () => '🪬',
  groups: [
    { name: 'basic', title: 'Basic Information', default: true },
    { name: 'media', title: 'Media' },
    { name: 'collections', title: 'Collections' },
    { name: 'seo', title: 'SEO' },
    { name: 'display', title: 'Display' },
    { name: 'details', title: 'Extra Details' },
  ],
  fields: [
    defineField({
      name: 'name',
      title: 'Product Name',
      type: 'string',
      group: 'basic',
      validation: (rule) => rule.required().min(3).max(120),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'basic',
      options: { source: 'name', maxLength: 100 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      group: 'basic',
      to: [{ type: 'category' }],
      description: 'Main category, e.g. Deity Shringar or Pooja Fragrances. Choose this before Product Type.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'productType',
      title: 'Product Type',
      type: 'reference',
      group: 'basic',
      to: [{ type: 'productType' }],
      description: 'Sub-category within the chosen category, e.g. Mukut, Mala, Attar. Decides which extra fields appear below.',
      options: {
        filter: ({ document }) => {
          const categoryId = (document?.category as { _ref?: string } | undefined)?._ref;
          return categoryId ? { filter: 'category._ref == $categoryId', params: { categoryId } } : {};
        },
      },
      validation: (rule) =>
        rule.required().custom(async (value, context) => {
          const typeId = (value as { _ref?: string } | undefined)?._ref;
          const categoryId = (context.document?.category as { _ref?: string } | undefined)?._ref;
          if (!typeId || !categoryId) return true;
          const typeCategoryId = await context
            .getClient({ apiVersion: '2024-01-01' })
            .fetch<string | null>('*[_id == $typeId][0].category._ref', { typeId });
          return !typeCategoryId || typeCategoryId === categoryId
            ? true
            : 'This product type belongs to a different category.';
        }),
    }),
    defineField({
      name: 'shortDescription',
      title: 'Short Description',
      type: 'text',
      rows: 3,
      group: 'basic',
      description: 'Used in product cards and quick previews.',
      validation: (rule) => rule.required().min(10).max(220),
    }),
    defineField({
      name: 'longDescription',
      title: 'Long Description',
      type: 'array',
      group: 'basic',
      of: [
        defineArrayMember({ type: 'block' }),
        defineArrayMember({ type: 'image', options: { hotspot: true } }),
      ],
    }),
    defineField({
      name: 'sku',
      title: 'SKU',
      type: 'string',
      group: 'basic',
      description: 'Optional stock keeping unit for inventory and operations.',
      validation: (rule) => rule.max(40),
    }),
    defineField({
      name: 'price',
      title: 'Price (INR)',
      type: 'number',
      group: 'basic',
      validation: (rule) => rule.required().min(0),
    }),
    defineField({
      name: 'salePrice',
      title: 'Sale Price (INR)',
      type: 'number',
      group: 'basic',
      description: 'Optional discounted sell price. Leave empty for regular price.',
      validation: (rule) =>
        rule.min(0).custom((value, context) => {
          const price = (context.document?.price as number | undefined) ?? 0;
          if (value && value >= price) return 'Sale price should be lower than regular price';
          return true;
        }),
    }),
    defineField({
      name: 'stockQuantity',
      title: 'Stock Quantity',
      type: 'number',
      group: 'basic',
      initialValue: 0,
      validation: (rule) => rule.required().min(0).integer(),
    }),

    // Legacy fields: only shown on older products that still hold a value.
    defineField({
      name: 'originalPrice',
      title: 'MRP / Original Price (Legacy)',
      type: 'number',
      group: 'basic',
      description: 'Shown struck-through on the site. Prefer Price + Sale Price for new products.',
      hidden: ({ value }) => isEmpty(value),
      validation: (rule) => rule.min(0),
    }),
    defineField({
      name: 'stock',
      title: 'Stock (Legacy)',
      type: 'number',
      group: 'basic',
      description: 'Older stock value. Use Stock Quantity instead.',
      hidden: ({ value }) => isEmpty(value),
      validation: (rule) => rule.min(0).integer(),
    }),
    defineField({
      name: 'inStock',
      title: 'In Stock',
      type: 'boolean',
      group: 'basic',
      initialValue: true,
      validation: (rule) => rule.required(),
    }),

    defineField({
      name: 'mainImage',
      title: 'Main Image',
      type: 'image',
      group: 'media',
      options: { hotspot: true },
      fields: [defineField({ name: 'alt', title: 'Alt Text', type: 'string' })],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'galleryImages',
      title: 'Gallery Images',
      type: 'array',
      group: 'media',
      of: [
        defineArrayMember({
          type: 'image',
          options: { hotspot: true },
          fields: [defineField({ name: 'alt', title: 'Alt Text', type: 'string' })],
        }),
      ],
    }),
    defineField({
      name: 'images',
      title: 'Images (Legacy)',
      type: 'array',
      group: 'media',
      description: 'Older image list. Use Main Image and Gallery Images instead.',
      hidden: ({ value }) => isEmpty(value),
      of: [
        defineArrayMember({
          type: 'image',
          options: { hotspot: true },
          fields: [
            defineField({ name: 'alt', title: 'Alt Text', type: 'string' }),
            defineField({ name: 'caption', title: 'Caption', type: 'string' }),
          ],
        }),
      ],
    }),

    defineField({
      name: 'deity',
      title: 'Deity',
      type: 'reference',
      group: 'basic',
      to: [{ type: 'deity' }],
      description: 'Which deity this is made for, e.g. Laddu Gopal, Radha Krishna.',
      components: { field: facetField(['deity']) },
    }),
    defineField({
      name: 'fragrance',
      title: 'Fragrance',
      type: 'reference',
      group: 'basic',
      to: [{ type: 'fragrance' }],
      description: 'Scent for attar, agarbatti and dhoop, e.g. Rose, Mogra, Chandan.',
      components: { field: facetField(['fragrance']) },
    }),
    defineField({
      name: 'sizes',
      title: 'Variants',
      type: 'array',
      group: 'basic',
      description:
        'Options the customer picks from (size / volume). Set "Variant Price" to the exact selling price of that option, or leave it empty and use "Price Adjustment" (added to the product price).',
      components: {
        field: facetField(['size', 'volume'], {
          size: 'Deity Sizes (e.g. Laddu Gopal 0, 1, 2 / 6 inch)',
          volume: 'Volume / Pack Size (e.g. 3 ml, 6 ml, 12 ml / 20 sticks)',
        }),
      },
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({ name: 'label', title: 'Option', type: 'string', validation: (rule) => rule.required().max(50) }),
            defineField({
              name: 'price',
              title: 'Variant Price (INR)',
              type: 'number',
              description: 'Final selling price for this option. Leave empty to use product price + adjustment.',
              validation: (rule) => rule.min(1),
            }),
            defineField({
              name: 'mrp',
              title: 'Variant MRP (INR)',
              type: 'number',
              description: 'Optional regular price for this option — shown struck-through with the sale %.',
              validation: (rule) =>
                rule.custom((mrp: number | undefined, ctx) => {
                  const price = (ctx.parent as { price?: number } | undefined)?.price;
                  if (mrp === undefined || price === undefined) return true;
                  return mrp > price ? true : 'MRP must be higher than the Variant Price.';
                }),
            }),
            defineField({
              name: 'priceModifier',
              title: 'Price Adjustment (INR)',
              type: 'number',
              initialValue: 0,
              description: 'Used only when Variant Price is empty. Added to the product price (negative = cheaper).',
            }),
            defineField({
              name: 'stock',
              title: 'Stock',
              type: 'number',
              description: 'Leave empty to use the product stock.',
              validation: (rule) => rule.min(0).integer(),
            }),
          ],
          preview: {
            select: { title: 'label', modifier: 'priceModifier', price: 'price', stock: 'stock' },
            prepare: ({ title, modifier, price, stock }) => ({
              title,
              subtitle: `${
                price ? `₹${price}` : modifier ? `${modifier > 0 ? '+' : ''}₹${modifier}` : 'Same price'
              }${stock !== undefined ? ` · ${stock} in stock` : ''}`,
            }),
          },
        }),
      ],
      validation: (rule) =>
        rule.custom((items: { label?: string }[] | undefined) => {
          const labels = (items ?? []).map((i) => i.label?.trim().toLowerCase()).filter(Boolean);
          return new Set(labels).size === labels.length ? true : 'Each variant option must be unique.';
        }),
    }),

    defineField({
      name: 'isFeatured',
      title: 'Featured Product',
      type: 'boolean',
      group: 'collections',
      initialValue: false,
    }),
    defineField({
      name: 'isBestseller',
      title: 'Best Seller',
      type: 'boolean',
      group: 'collections',
      initialValue: false,
    }),
    defineField({
      name: 'isNewArrival',
      title: 'New Arrival',
      type: 'boolean',
      group: 'collections',
      initialValue: false,
    }),
    defineField({
      name: 'isPremium',
      title: 'Premium Collection',
      type: 'boolean',
      group: 'collections',
      initialValue: false,
    }),

    defineField({
      name: 'seoTitle',
      title: 'SEO Title',
      type: 'string',
      group: 'seo',
      validation: (rule) => rule.max(60),
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO Description',
      type: 'text',
      rows: 3,
      group: 'seo',
      validation: (rule) => rule.max(160),
    }),
    defineField({
      name: 'ogImage',
      title: 'Open Graph Image',
      type: 'image',
      group: 'seo',
      options: { hotspot: true },
    }),

    defineField({
      name: 'sortOrder',
      title: 'Sort Order',
      type: 'number',
      group: 'display',
      initialValue: 0,
      validation: (rule) => rule.required().min(0).integer(),
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display Order (Legacy)',
      type: 'number',
      group: 'display',
      description: 'Ordering used by existing products. New products can use Sort Order.',
      validation: (rule) => rule.min(0).integer(),
    }),
    defineField({
      name: 'isActive',
      title: 'Active Status',
      type: 'boolean',
      group: 'display',
      initialValue: true,
      validation: (rule) => rule.required(),
    }),

    defineField({
      name: 'material',
      title: 'Material',
      type: 'string',
      group: 'details',
      components: { field: facetField(['material']) },
    }),
    defineField({
      name: 'colors',
      title: 'Colour Variants (image + price)',
      type: 'array',
      group: ['media', 'details'],
      description:
        'Add one entry per colour: upload the photo of that colour, name the colour and (optionally) its price. The product page switches to this photo and price when the customer picks the colour.',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name: 'image',
              title: 'Colour Image',
              type: 'image',
              options: { hotspot: true },
              fields: [defineField({ name: 'alt', title: 'Alt Text', type: 'string' })],
            }),
            defineField({
              name: 'label',
              title: 'Which colour is this image?',
              type: 'string',
              description: 'Colour name shown to customers, e.g. Red, Peacock Green, Gold.',
              validation: (rule) => rule.required().max(50),
            }),
            defineField({
              name: 'price',
              title: 'Price for this colour (INR)',
              type: 'number',
              description: 'Leave empty to use the product / variant price.',
              validation: (rule) => rule.min(1),
            }),
            defineField({
              name: 'mrp',
              title: 'MRP for this colour (INR)',
              type: 'number',
              description: 'Optional regular price, shown struck-through with the sale %.',
              validation: (rule) =>
                rule.custom((mrp: number | undefined, ctx) => {
                  const price = (ctx.parent as { price?: number } | undefined)?.price;
                  if (mrp === undefined || price === undefined) return true;
                  return mrp > price ? true : 'MRP must be higher than the colour price.';
                }),
            }),
            defineField({ name: 'hex', title: 'Swatch Hex Code', type: 'string', description: 'Optional, for example #C62828.' }),
          ],
          preview: {
            select: { title: 'label', media: 'image', price: 'price' },
            prepare: ({ title, media, price }) => ({
              title: title || 'Unnamed colour',
              subtitle: price ? `₹${price}` : 'Uses product / variant price',
              media,
            }),
          },
        }),
      ],
      validation: (rule) =>
        rule.custom((items: { label?: string }[] | undefined) => {
          const labels = (items ?? []).map((i) => i.label?.trim().toLowerCase()).filter(Boolean);
          return new Set(labels).size === labels.length ? true : 'Each colour must be unique.';
        }),
    }),
    defineField({
      name: 'careInstructions',
      title: 'Care Instructions',
      type: 'text',
      rows: 3,
      group: 'details',
      description: 'Shown in the "Care Instructions" column on the product page.',
    }),
    defineField({
      name: 'returnPolicy',
      title: 'Return Policy (this product)',
      type: 'text',
      rows: 3,
      group: 'details',
      description: 'Optional. Shown in the "Return Policy" column. Leave empty to show the standard 7-day return policy.',
    }),
    defineField({
      name: 'specifications',
      title: 'Specifications',
      type: 'array',
      group: 'details',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({ name: 'key', title: 'Attribute', type: 'string' }),
            defineField({ name: 'value', title: 'Value', type: 'string' }),
          ],
          preview: { select: { title: 'key', subtitle: 'value' } },
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'name',
      media: 'mainImage',
      category: 'category.name',
      type: 'productType.name',
      price: 'price',
      salePrice: 'salePrice',
      active: 'isActive',
      inStock: 'inStock',
      stockQuantity: 'stockQuantity',
      stock: 'stock',
    },
    prepare({ title, media, category, type, price, salePrice, active, inStock, stockQuantity, stock }) {
      const effectivePrice = salePrice ?? price;
      const qty = stockQuantity ?? stock ?? 0;
      const status = !active ? '❌' : inStock === false || qty <= 0 ? '⚠️' : '✅';
      return {
        title: `${status} ${title}`,
        subtitle: `${category || 'No category'} › ${type || 'No type'} · ₹${effectivePrice ?? 0} · ${qty} in stock`,
        media,
      };
    },
  },
  orderings: [
    {
      title: 'Sort Order',
      name: 'sortOrderAsc',
      by: [{ field: 'sortOrder', direction: 'asc' }],
    },
    {
      title: 'Price: Low to High',
      name: 'priceLow',
      by: [{ field: 'price', direction: 'asc' }],
    },
    {
      title: 'Price: High to Low',
      name: 'priceHigh',
      by: [{ field: 'price', direction: 'desc' }],
    },
    {
      title: 'Newest First',
      name: 'newest',
      by: [{ field: '_createdAt', direction: 'desc' }],
    },
  ],
});
