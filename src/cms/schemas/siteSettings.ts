import { defineType, defineField, defineArrayMember } from 'sanity';

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  icon: () => '⚙️',
  fields: [
    // ── Brand ──────────────────────────────────────────────
    defineField({
      name: 'brandName',
      title: 'Brand Name',
      type: 'string',
      initialValue: 'Nikunj Sakhi',
    }),
    defineField({
      name: 'tagline',
      title: 'Brand Tagline',
      type: 'string',
      initialValue: 'Serve with Devotion',
    }),
    defineField({
      name: 'logo',
      title: 'Logo (PNG/SVG)',
      type: 'image',
    }),
    defineField({
      name: 'favicon',
      title: 'Favicon',
      type: 'image',
    }),
    defineField({
      name: 'announcement',
      title: 'Announcement Bar Text',
      type: 'string',
      initialValue: '✦ Free delivery on orders above ₹999 | Follow us @jewelleryCollection.7 ✦',
    }),
    defineField({
      name: 'announcementActive',
      title: 'Show Announcement Bar',
      type: 'boolean',
      initialValue: true,
    }),

    // ── Homepage sections ───────────────────────────────────────────
    defineField({
      name: 'showWhyUs',
      title: 'Homepage: Show "Why Us" section',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'showReviews',
      title: 'Homepage: Show Customer Reviews',
      type: 'boolean',
      initialValue: true,
      description: 'Only reviews you have approved are ever shown.',
    }),
    defineField({
      name: 'showInstagram',
      title: 'Homepage: Show Instagram strip',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'showFeedbackForm',
      title: 'Homepage: Show "Leave a Review" form',
      type: 'boolean',
      initialValue: true,
    }),

    // ── Contact ─────────────────────────────────────────────
    defineField({
      name: 'whatsappNumber',
      title: 'WhatsApp Number (with country code, no +)',
      type: 'string',
      initialValue: '919XXXXXXXXX',
    }),
    defineField({
      name: 'email',
      title: 'Contact Email',
      type: 'string',
    }),
    defineField({
      name: 'phone',
      title: 'Phone Number',
      type: 'string',
    }),
    defineField({
      name: 'address',
      title: 'Business Address',
      type: 'text',
      rows: 3,
    }),

    // ── Social ──────────────────────────────────────────────
    defineField({
      name: 'instagramHandle',
      title: 'Instagram Handle',
      type: 'string',
      initialValue: 'jewelleryCollection.7',
    }),
    defineField({
      name: 'instagramUrl',
      title: 'Instagram URL',
      type: 'url',
    }),
    defineField({
      name: 'facebookUrl',
      title: 'Facebook URL',
      type: 'url',
    }),
    defineField({
      name: 'youtubeUrl',
      title: 'YouTube URL',
      type: 'url',
    }),
    defineField({
      name: 'pinterestUrl',
      title: 'Pinterest URL',
      type: 'url',
    }),

    // ── Homepage ────────────────────────────────────────────
    defineField({
      name: 'homeHeroTitle',
      title: 'Hero Main Title',
      type: 'string',
      initialValue: 'Serve with Devotion',
    }),
    defineField({
      name: 'homeHeroSubtitle',
      title: 'Hero Subtitle',
      type: 'string',
      initialValue: 'Serve with Devotion',
    }),
    defineField({
      name: 'homeHeroDescription',
      title: 'Hero Description',
      type: 'text',
      rows: 3,
    }),

    // ── Delivery ────────────────────────────────────────────
    defineField({
      name: 'freeDeliveryThreshold',
      title: 'Free Delivery Threshold (₹)',
      type: 'number',
      initialValue: 999,
    }),
    defineField({
      name: 'deliveryCharge',
      title: 'Delivery Charge (₹)',
      type: 'number',
      initialValue: 80,
    }),
    defineField({
      name: 'estimatedDeliveryDays',
      title: 'Estimated Delivery Days',
      type: 'number',
      initialValue: 10,
    }),

    // ── SEO ─────────────────────────────────────────────────
    defineField({
      name: 'seoTitle',
      title: 'Default SEO Title',
      type: 'string',
      initialValue: 'Nikunj Sakhi – Serve with Devotion | Handcrafted Deity Jewellery',
    }),
    defineField({
      name: 'seoDescription',
      title: 'Default SEO Description',
      type: 'text',
      rows: 3,
      initialValue:
        'Shop handcrafted divine god ornaments, deity jewellery, mukut, haar, mala set, and pooja samagri for Radha Krishna, Kanha Ji, and Laddu Gopal.',
    }),
    defineField({
      name: 'ogImage',
      title: 'Default OG Image',
      type: 'image',
    }),

    // ── Policies ────────────────────────────────────────────
    defineField({
      name: 'returnPolicy',
      title: 'Return Policy',
      type: 'array',
      of: [defineArrayMember({ type: 'block' })],
    }),
    defineField({
      name: 'shippingPolicy',
      title: 'Shipping Policy',
      type: 'array',
      of: [defineArrayMember({ type: 'block' })],
    }),
    defineField({
      name: 'privacyPolicy',
      title: 'Privacy Policy',
      type: 'array',
      of: [defineArrayMember({ type: 'block' })],
    }),
  ],

  preview: {
    prepare() {
      return { title: '⚙️ Site Settings (Global)' };
    },
  },
});
