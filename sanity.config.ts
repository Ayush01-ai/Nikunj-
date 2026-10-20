import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schema } from './src/cms/schemas';
import { deskStructure } from './src/cms/deskStructure';
import { ApproveReviewAction, RejectReviewAction } from './src/cms/actions/reviewActions';
import { ViewProductOnSiteAction } from './src/cms/actions/productActions';
import { AdvanceOrderStatusAction, CancelOrderAction, SendToDeliveryPartnerAction, WhatsAppOrderUpdateAction } from './src/cms/actions/orderActions';
import { PackageIcon } from '@sanity/icons/Package';
import { UploadIcon } from '@sanity/icons/Upload';
import { ChartUpwardIcon } from '@sanity/icons/ChartUpward';
import { OrdersDashboard } from './src/cms/tools/OrdersDashboard';
import { AnalyticsDashboard } from './src/cms/tools/AnalyticsDashboard';
import { BulkProductImport } from './src/cms/tools/BulkProductImport';

const SINGLETON_TYPES = new Set(['siteSettings', 'adminSettings', 'order', 'lead']);

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'x33a83r6';
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';

export default defineConfig({
  name: 'nikunj-sakhi',
  title: 'Nikunj Sakhi — Admin CMS',

  // Must match the Next.js catch-all route at src/app/studio/[[...tool]].
  // Without this, Sanity treats the first path segment ("studio") as a tool name.
  basePath: '/studio',

  projectId,
  dataset,

  // Token login gives the Orders Dashboard a credential it can send to the website's
  // owner-only APIs (e.g. /api/refunds/process), which verify it with Sanity.
  auth: { loginMethod: 'token' },

  plugins: [
    structureTool({
      structure: deskStructure,
    }),
    visionTool(),
  ],

  tools: (prev) => [
    ...prev.slice(0, 1),
    { name: 'orders', title: 'Orders Dashboard', icon: PackageIcon, component: OrdersDashboard },
    { name: 'analytics', title: 'Analytics', icon: ChartUpwardIcon, component: AnalyticsDashboard },
    { name: 'bulk-import', title: 'Bulk Import', icon: UploadIcon, component: BulkProductImport },
    ...prev.slice(1),
  ],

  document: {
    actions: (prev, context) => {
      if (context.schemaType === 'testimonial') return [ApproveReviewAction, RejectReviewAction, ...prev];
      if (context.schemaType === 'product') return [...prev, ViewProductOnSiteAction];
      // Orders change only through these buttons so the status history stays complete.
      if (context.schemaType === 'order') return [AdvanceOrderStatusAction, SendToDeliveryPartnerAction, WhatsAppOrderUpdateAction, CancelOrderAction];
      if (context.schemaType === 'adminSettings') return prev.filter((a) => a.action !== 'delete' && a.action !== 'duplicate');
      return prev;
    },
    // Singletons and website-created orders can't be made from the global "+ Create" menu.
    newDocumentOptions: (prev) => prev.filter((item) => !SINGLETON_TYPES.has(item.templateId)),
  },

  schema: {
    ...schema,
    templates: (prev) => [
      ...prev,
      {
        id: 'product-in-type',
        title: 'Product in this type',
        schemaType: 'product',
        parameters: [
          { name: 'categoryId', type: 'string' },
          { name: 'typeId', type: 'string' },
        ],
        value: ({ categoryId, typeId }: { categoryId: string; typeId: string }) => ({
          category: { _type: 'reference', _ref: categoryId },
          productType: { _type: 'reference', _ref: typeId },
          isActive: true,
          inStock: true,
          stockQuantity: 0,
          sortOrder: 0,
          isFeatured: false,
          isBestseller: false,
          isNewArrival: true,
          isPremium: false,
        }),
      },
      {
        id: 'productType-in-category',
        title: 'Product Type in this category',
        schemaType: 'productType',
        parameters: [{ name: 'categoryId', type: 'string' }],
        value: ({ categoryId }: { categoryId: string }) => ({
          category: { _type: 'reference', _ref: categoryId },
          isActive: true,
          showInMenu: true,
          displayOrder: 0,
        }),
      },
    ],
  },
});
