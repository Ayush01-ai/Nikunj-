import type { StructureBuilder } from 'sanity/structure';

const filteredProducts = (S: StructureBuilder, id: string, title: string, filter: string) =>
  S.listItem()
    .id(id)
    .title(title)
    .child(
      S.documentList()
        .title(title)
        .schemaType('product')
        .filter(`_type == "product" && (${filter})`)
        .defaultOrdering([{ field: '_updatedAt', direction: 'desc' }]),
    );

const filteredReviews = (S: StructureBuilder, id: string, title: string, filter: string) =>
  S.listItem()
    .id(id)
    .title(title)
    .child(
      S.documentList()
        .title(title)
        .schemaType('testimonial')
        .filter(`_type == "testimonial" && (${filter})`)
        .defaultOrdering([{ field: '_createdAt', direction: 'desc' }]),
    );

// Orders are created by the website only, so no "+" button in these lists.
const ordersByStatus = (S: StructureBuilder, id: string, title: string, filter: string) =>
  S.listItem()
    .id(id)
    .title(title)
    .child(
      S.documentList()
        .id(id)
        .title(title)
        .schemaType('order')
        .filter(`_type == "order" && (${filter})`)
        .defaultOrdering([{ field: 'placedAt', direction: 'desc' }])
        .initialValueTemplates([]),
    );

const productsByCategory = (S: StructureBuilder) =>
  S.listItem()
    .id('productsByCategory')
    .title('📂 Products by Category')
    .child(
      S.documentTypeList('category')
        .title('Choose a Category')
        .defaultOrdering([{ field: 'displayOrder', direction: 'asc' }])
        .child((categoryId) =>
          S.documentList()
            .id(`types-${categoryId}`)
            .title('Choose a Product Type')
            .schemaType('productType')
            .filter('_type == "productType" && category._ref == $categoryId')
            .params({ categoryId })
            .defaultOrdering([{ field: 'displayOrder', direction: 'asc' }])
            .initialValueTemplates([S.initialValueTemplateItem('productType-in-category', { categoryId })])
            .child((typeId) =>
              S.documentList()
                .id(`products-${typeId}`)
                .title('Products')
                .schemaType('product')
                .filter('_type == "product" && productType._ref == $typeId')
                .params({ typeId })
                .defaultOrdering([{ field: 'sortOrder', direction: 'asc' }])
                .initialValueTemplates([S.initialValueTemplateItem('product-in-type', { categoryId, typeId })]),
            ),
        ),
    );

export const deskStructure = (S: StructureBuilder) =>
  S.list()
    .title('Nikunj Sakhi CMS')
    .items([
      S.listItem()
        .id('catalog')
        .title('🛍️ Catalog')
        .child(
          S.list()
            .title('Catalog')
            .items([
              S.listItem().id('products').title('All Products').child(S.documentTypeList('product').title('All Products')),
              productsByCategory(S),
              filteredProducts(S, 'needsCategory', '🧩 Missing Category / Type', '!defined(category) || !defined(productType)'),
              filteredProducts(S, 'outOfStock', '⚠️ Out of Stock', 'inStock == false || coalesce(stockQuantity, stock, 0) <= 0'),
              filteredProducts(S, 'hiddenProducts', '❌ Hidden / Inactive', 'isActive != true'),
              filteredProducts(S, 'featuredProducts', '⭐ Featured', 'isFeatured == true'),
              filteredProducts(S, 'bestsellers', '🔥 Best Sellers', 'isBestseller == true'),
              filteredProducts(S, 'newArrivals', '🆕 New Arrivals', 'isNewArrival == true'),
              S.divider(),
              S.listItem().id('categories').title('Categories').child(S.documentTypeList('category').title('Categories')),
              S.listItem().id('productTypes').title('Product Types').child(S.documentTypeList('productType').title('Product Types')),
              S.listItem().id('deities').title('Deities').child(S.documentTypeList('deity').title('Deities')),
              S.listItem().id('fragrances').title('Fragrances').child(S.documentTypeList('fragrance').title('Fragrances')),
            ]),
        ),
      S.listItem()
        .id('homepage')
        .title('🏠 Homepage')
        .child(
          S.list()
            .title('Homepage')
            .items([
              S.listItem().id('heroSlides').title('Hero Slides / Banners').child(S.documentTypeList('heroSlide').title('Hero Slides')),
              S.listItem()
                .id('sectionVisibility')
                .title('Section Visibility')
                .child(S.document().schemaType('siteSettings').documentId('siteSettings').title('Site Settings')),
            ]),
        ),
      S.listItem()
        .id('reviews')
        .title('💬 Reviews & Feedback')
        .child(
          S.list()
            .title('Reviews & Feedback')
            .items([
              filteredReviews(S, 'reviewsPending', '🕒 Pending Approval', 'status == "pending"'),
              filteredReviews(S, 'reviewsShown', '✅ Shown on Website', 'coalesce(status, "approved") == "approved" && isActive == true'),
              filteredReviews(S, 'reviewsHidden', '🚫 Rejected / Hidden', 'status == "rejected" || (coalesce(status, "approved") == "approved" && isActive != true)'),
              S.listItem().id('reviewsAll').title('All Reviews').child(S.documentTypeList('testimonial').title('All Reviews')),
            ]),
        ),
      S.listItem().id('coupons').title('🏷️ Coupons').child(S.documentTypeList('coupon').title('Coupons')),
      S.listItem()
        .id('orders')
        .title('📦 Orders')
        .child(
          S.list()
            .title('Orders')
            .items([
              ordersByStatus(S, 'ordersNew', '🆕 New — to pack', 'status == "confirmed"'),
              ordersByStatus(S, 'ordersProcessing', '📦 Packing', 'status == "processing"'),
              ordersByStatus(S, 'ordersShipped', '🚚 Shipped', 'status == "shipped"'),
              ordersByStatus(S, 'ordersDelivered', '✅ Delivered', 'status == "delivered"'),
              ordersByStatus(S, 'ordersCancelled', '❌ Cancelled', 'status == "cancelled"'),
              ordersByStatus(S, 'ordersReturns', '🔁 Returns in progress', 'status in ["return_requested", "return_approved", "returned"]'),
              ordersByStatus(S, 'ordersRefunded', '💸 Refunded', 'status == "refunded" || paymentStatus == "refunded"'),
              ordersByStatus(S, 'ordersRefundDue', '💸 Refund due', 'paymentStatus == "refund_due"'),
              S.divider(),
              ordersByStatus(S, 'ordersAll', 'All Orders', 'true'),
            ]),
        ),
      S.listItem()
        .id('leads')
        .title('📱 Checkout Leads')
        .child(
          S.list()
            .id('leads')
            .title('Checkout Leads')
            .items(
              [
                ['leadsOpen', '🛒 Did not order', 'converted != true'],
                ['leadsConverted', '✅ Ordered', 'converted == true'],
                ['leadsAll', 'All leads', 'true'],
              ].map(([id, title, filter]) =>
                S.listItem()
                  .id(id)
                  .title(title)
                  .child(
                    S.documentList()
                      .id(id)
                      .title(title)
                      .schemaType('lead')
                      .filter(`_type == "lead" && (${filter})`)
                      .defaultOrdering([{ field: 'lastSeenAt', direction: 'desc' }])
                      .initialValueTemplates([]),
                  ),
              ),
            ),
        ),
      S.divider(),
      S.listItem()
        .id('siteSettings')
        .title('⚙️ Site Settings')
        .child(S.document().schemaType('siteSettings').documentId('siteSettings').title('Site Settings')),
      S.listItem()
        .id('adminAccess')
        .title('🔐 Admin Access')
        .child(S.document().schemaType('adminSettings').documentId('settings.admin').title('Admin Access')),
    ]);
