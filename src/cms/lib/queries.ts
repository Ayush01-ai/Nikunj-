import { groq } from 'next-sanity';

// ─── Reusable field fragments ───────────────────────────────────────────────

const IMAGE_FIELDS = groq`
  asset->{_id, url, metadata{lqip, dimensions}},
  hotspot,
  crop,
  alt
`;

const CATEGORY_FIELDS = groq`
  _id,
  name,
  slug,
  description,
  emoji,
  displayOrder,
  "image": image{${IMAGE_FIELDS}},
  isFeatured,
  isActive,
  seoTitle,
  seoDescription
`;

const DEITY_FIELDS = groq`
  _id,
  name,
  slug,
  description,
  "image": image{${IMAGE_FIELDS}},
  displayOrder,
  isActive
`;

const PRODUCT_TYPE_FIELDS = groq`
  _id,
  name,
  slug,
  description,
  displayOrder,
  appliesFacets,
  "image": image{${IMAGE_FIELDS}},
  icon,
  "category": category->{_id, name, slug}
`;

const FRAGRANCE_FIELDS = groq`
  _id,
  name,
  slug,
  description
`;

const PRODUCT_CARD_FIELDS = groq`
  _id,
  name,
  slug,
  "deity": deity->name,
  "deityRef": deity->{_id, name, slug},
  "productType": productType->{_id, name, slug},
  "fragrance": fragrance->{_id, name, slug},
  shortDescription,
  // price = regular price (MRP), salePrice = discounted selling price.
  // Legacy originalPrice is only used when it is genuinely above the selling price.
  "price": select(defined(salePrice) && salePrice > 0 && salePrice < price => salePrice, price),
  "originalPrice": select(
    defined(salePrice) && salePrice > 0 && salePrice < price => price,
    defined(originalPrice) && originalPrice > price => originalPrice,
    null
  ),
  "stock": coalesce(stockQuantity, stock, 0),
  inStock,
  isFeatured,
  isBestseller,
  isNewArrival,
  isPremium,
  "displayOrder": coalesce(displayOrder, sortOrder, 0),
  "category": category->{_id, name, slug},
  "images": select(
    defined(images) && count(images) > 0 => images[]{${IMAGE_FIELDS}},
    [mainImage, ...coalesce(galleryImages[asset._ref != ^.mainImage.asset._ref], [])][defined(asset)]{${IMAGE_FIELDS}}
  ),
  material,
  "sizes": sizes[defined(label)]{label, "priceModifier": coalesce(priceModifier, 0), price, mrp, stock},
  "colors": colors[defined(label)]{label, hex, price, mrp, "image": select(defined(image.asset) => image{${IMAGE_FIELDS}}, null)},
  careInstructions,
  returnPolicy,
  specifications,
  seoTitle,
  seoDescription
`;

const PRODUCT_FULL_FIELDS = groq`
  ${PRODUCT_CARD_FIELDS},
  sku,
  "description": longDescription,
  "ogImage": ogImage{${IMAGE_FIELDS}}
`;

// Fields a shopper might type: "payal", "attar", "laddu gopal", "rose", a SKU…
const SEARCHABLE = groq`[name, deity->name, productType->name, category->name, fragrance->name, sku, shortDescription, material]`;

/**
 * Turn free text into a GROQ match pattern where every word is a prefix
 * ("radha haa" -> "radha* haa*"), so partial multi-word queries still match.
 */
export function toSearchPattern(input: string): string {
  const words = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return words.map((w) => `${w}*`).join(' ');
}

// ─── Queries ────────────────────────────────────────────────────────────────

/** Site-wide settings (singleton) */
export const SITE_SETTINGS_QUERY = groq`
  *[_type == "siteSettings"][0]{
    brandName,
    tagline,
    "logo": logo{${IMAGE_FIELDS}},
    announcement,
    announcementActive,
    showWhyUs,
    showReviews,
    showInstagram,
    showFeedbackForm,
    whatsappNumber,
    email,
    phone,
    address,
    instagramHandle,
    instagramUrl,
    facebookUrl,
    youtubeUrl,
    freeDeliveryThreshold,
    deliveryCharge,
    estimatedDeliveryDays,
    seoTitle,
    seoDescription,
    "ogImage": ogImage{${IMAGE_FIELDS}},
    homeHeroTitle,
    homeHeroSubtitle,
    homeHeroDescription,
    returnPolicy,
    shippingPolicy,
    privacyPolicy
  }
`;

/** Hero slides (active, ordered) */
export const HERO_SLIDES_QUERY = groq`
  *[_type == "heroSlide" && isActive == true] | order(displayOrder asc){
    _id,
    title,
    subtitle,
    description,
    "image": image{${IMAGE_FIELDS}},
    "mobileImage": mobileImage{${IMAGE_FIELDS}},
    ctaPrimary,
    ctaSecondary,
    overlayColor,
    textColor
  }
`;

/** All active + ordered categories */
export const CATEGORIES_QUERY = groq`
  *[_type == "category" && isActive == true] | order(displayOrder asc){
    ${CATEGORY_FIELDS}
  }
`;

/** Active deities for filters */
export const DEITIES_QUERY = groq`
  *[_type == "deity" && isActive == true] | order(displayOrder asc){
    ${DEITY_FIELDS}
  }
`;

/** Product types for filters */
export const PRODUCT_TYPES_QUERY = groq`
  *[_type == "productType" && isActive != false] | order(displayOrder asc){
    ${PRODUCT_TYPE_FIELDS}
  }
`;

/** Active categories with live product counts (catalog sidebar + route lookup) */
export const CATALOG_CATEGORIES_QUERY = groq`
  *[_type == "category" && isActive == true] | order(displayOrder asc){
    ${CATEGORY_FIELDS},
    "bannerImage": bannerImage{${IMAGE_FIELDS}},
    "productCount": count(*[_type == "product" && isActive == true && references(^._id)])
  }
`;

/** Active product types (optionally within one category) with live product counts */
export const CATALOG_TYPES_QUERY = groq`
  *[
    _type == "productType"
    && isActive != false
    && ($category == "" || category->slug.current == $category)
  ] | order(displayOrder asc){
    ${PRODUCT_TYPE_FIELDS},
    "productCount": count(*[_type == "product" && isActive == true && references(^._id)])
  }
`;

/** Shop mega-menu: categories → types, only those with active products */
export const NAV_MENU_QUERY = groq`
  *[_type == "category" && isActive == true && showInMenu != false] | order(displayOrder asc){
    _id,
    name,
    "slug": slug.current,
    "productCount": count(*[_type == "product" && isActive == true && references(^._id)]),
    "types": *[
      _type == "productType" && isActive != false && showInMenu != false && references(^._id)
    ] | order(displayOrder asc){
      _id,
      name,
      "slug": slug.current,
      "productCount": count(*[_type == "product" && isActive == true && references(^._id)])
    }[productCount > 0]
  }[productCount > 0]
`;

/** Category + type paths for the sitemap */
export const ALL_TYPE_PATHS_QUERY = groq`
  *[_type == "productType" && isActive != false && defined(slug.current) && category->isActive == true]{
    "slug": slug.current,
    "category": category->slug.current
  }
`;

/** Fragrances for filters */
export const FRAGRANCES_QUERY = groq`
  *[_type == "fragrance"] | order(name asc){
    ${FRAGRANCE_FIELDS}
  }
`;

/** Featured categories for homepage */
export const FEATURED_CATEGORIES_QUERY = groq`
  *[_type == "category" && isActive == true && isFeatured == true] | order(displayOrder asc){
    ${CATEGORY_FIELDS}
  }
`;

/** All active products (with optional filters) */
export const PRODUCTS_QUERY = groq`
  *[
    _type == "product"
    && isActive == true
    && ($category == "" || category->slug.current == $category)
    && ($deity == "" || deity->slug.current == $deity)
    && ($productType == "" || productType->slug.current == $productType)
    && ($fragrance == "" || fragrance->slug.current == $fragrance)
    && ($search == "" || ${SEARCHABLE} match $search)
    && ($minPrice == 0 || coalesce(salePrice, price) >= $minPrice)
    && ($maxPrice == 0 || coalesce(salePrice, price) <= $maxPrice)
    && (!$featuredOnly || isFeatured == true)
    && (!$bestsellerOnly || isBestseller == true)
    && (!$newArrivalOnly || isNewArrival == true)
  ] | order(
    select($sort == "price_asc" => coalesce(salePrice, price), 0) asc,
    select($sort == "price_desc" => coalesce(salePrice, price), 0) desc,
    select($sort == "newest" => _createdAt, "") desc,
    select($sort == "featured" => coalesce(isFeatured, false), false) desc,
    coalesce(sortOrder, displayOrder, 0) asc,
    _createdAt desc
  )[$from...$to]{
    ${PRODUCT_CARD_FIELDS}
  }
`;

/** Count of products matching filters */
export const PRODUCTS_COUNT_QUERY = groq`
  count(*[
    _type == "product"
    && isActive == true
    && ($category == "" || category->slug.current == $category)
    && ($deity == "" || deity->slug.current == $deity)
    && ($productType == "" || productType->slug.current == $productType)
    && ($fragrance == "" || fragrance->slug.current == $fragrance)
    && ($search == "" || ${SEARCHABLE} match $search)
    && ($minPrice == 0 || coalesce(salePrice, price) >= $minPrice)
    && ($maxPrice == 0 || coalesce(salePrice, price) <= $maxPrice)
    && (!$featuredOnly || isFeatured == true)
    && (!$bestsellerOnly || isBestseller == true)
    && (!$newArrivalOnly || isNewArrival == true)
  ])
`;

/** Featured products for homepage */
export const FEATURED_PRODUCTS_QUERY = groq`
  *[_type == "product" && isActive == true && isFeatured == true] | order(coalesce(sortOrder, displayOrder, 0) asc, _createdAt desc)[0...8]{
    ${PRODUCT_CARD_FIELDS}
  }
`;

/** Products for the home coverflow. This intentionally includes every active product. */
export const HOME_PRODUCTS_QUERY = groq`
  *[_type == "product" && isActive == true] | order(coalesce(sortOrder, displayOrder, 0) asc, _createdAt desc)[0...12]{
    ${PRODUCT_CARD_FIELDS}
  }
`;

/** Bestsellers */
export const BESTSELLERS_QUERY = groq`
  *[_type == "product" && isActive == true && isBestseller == true] | order(coalesce(sortOrder, displayOrder, 0) asc, _createdAt desc)[0...8]{
    ${PRODUCT_CARD_FIELDS}
  }
`;

/** New arrivals */
export const NEW_ARRIVALS_QUERY = groq`
  *[_type == "product" && isActive == true && isNewArrival == true] | order(_createdAt desc)[0...8]{
    ${PRODUCT_CARD_FIELDS}
  }
`;

/** Single product by slug */
export const PRODUCT_BY_SLUG_QUERY = groq`
  *[_type == "product" && (_id == $slug || slug.current == $slug) && isActive == true][0]{
    ${PRODUCT_FULL_FIELDS}
  }
`;

/** Related products (same category) */
/**
 * "You may also like": same category, product type or deity — best matches first.
 * Unset references are passed as "" so they never match.
 */
export const RELATED_PRODUCTS_QUERY = groq`
  *[
    _type == "product"
    && isActive == true
    && _id != $productId
    && (category._ref == $categoryId || productType._ref == $productTypeId || deity._ref == $deityId)
  ]
  | score(
      boost(category._ref == $categoryId, 3),
      boost(productType._ref == $productTypeId, 2),
      boost(deity._ref == $deityId, 2),
      boost(isBestseller == true, 1),
      boost(inStock == true, 1)
    )
  | order(_score desc, coalesce(sortOrder, displayOrder, 0) asc, _createdAt desc)[0...8]{
    ${PRODUCT_CARD_FIELDS}
  }
`;

/** Candidates for "Explore something different": popular products from other categories. */
export const DIFFERENT_PRODUCTS_QUERY = groq`
  *[
    _type == "product"
    && isActive == true
    && _id != $productId
    && category._ref != $categoryId
  ] | order(coalesce(isBestseller, false) desc, coalesce(isFeatured, false) desc, _updatedAt desc)[0...40]{
    ${PRODUCT_CARD_FIELDS}
  }
`;

/** All products slugs (for generateStaticParams) */
export const ALL_PRODUCT_SLUGS_QUERY = groq`
  *[_type == "product" && isActive == true && defined(slug.current)]{
    "slug": slug.current,
    _updatedAt
  }
`;

/** All category slugs */
export const ALL_CATEGORY_SLUGS_QUERY = groq`
  *[_type == "category" && isActive == true && defined(slug.current)]{
    "slug": slug.current
  }
`;

/** Testimonials (active, ordered) */
export const TESTIMONIALS_QUERY = groq`
  *[_type == "testimonial" && isActive == true && coalesce(status, "approved") == "approved"] | order(displayOrder asc, _createdAt desc)[0...50]{
    _id,
    customerName,
    location,
    "avatar": avatar{${IMAGE_FIELDS}},
    initials,
    rating,
    review,
    isVerified,
    productName,
    "productPurchased": productPurchased->{name, slug}
  }
`;

/** Approved reviews linked to one product */
export const PRODUCT_REVIEWS_QUERY = groq`
  *[
    _type == "testimonial"
    && isActive == true
    && coalesce(status, "approved") == "approved"
    && productPurchased._ref == $productId
  ] | order(_createdAt desc)[0...20]{
    _id,
    customerName,
    location,
    initials,
    rating,
    review,
    isVerified
  }
`;

/** Wishlist products (same shape as product cards) */
export const WISHLIST_PRODUCTS_QUERY = groq`
  *[_type == "product" && _id in $ids && isActive == true]{
    ${PRODUCT_CARD_FIELDS}
  }
`;

/** Validate coupon code */
export const COUPON_BY_CODE_QUERY = groq`
  *[_type == "coupon" && code == $code && isActive == true][0]{
    _id,
    code,
    discountType,
    discountValue,
    minimumOrderValue,
    maximumDiscountCap,
    usageLimit,
    validFrom,
    validUntil,
    applicableCategories[]->{_id, name}
  }
`;

/** Search products */
export const SEARCH_PRODUCTS_QUERY = groq`
  *[
    _type == "product"
    && isActive == true
    && ${SEARCHABLE} match $query
  ] | order(coalesce(sortOrder, displayOrder, 0) asc, _createdAt desc)[0...20]{
    ${PRODUCT_CARD_FIELDS}
  }
`;

/** Lightweight index of every active product, used for instant search suggestions. */
export const SEARCH_INDEX_QUERY = groq`
  *[_type == "product" && isActive == true] | order(coalesce(sortOrder, displayOrder, 0) asc, _createdAt desc){
    _id,
    name,
    slug,
    sku,
    "deity": deity->name,
    "productType": productType->name,
    "category": category->name,
    "fragrance": fragrance->name,
    "price": select(defined(salePrice) && salePrice > 0 && salePrice < price => salePrice, price),
    "originalPrice": select(
      defined(salePrice) && salePrice > 0 && salePrice < price => price,
      defined(originalPrice) && originalPrice > price => originalPrice,
      null
    ),
    "image": coalesce(images[0].asset->url, mainImage.asset->url, galleryImages[0].asset->url)
  }
`;
