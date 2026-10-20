export interface SanityImage {
  asset: {
    _id: string;
    url: string;
    metadata?: {
      lqip?: string;
      dimensions?: { width: number; height: number; aspectRatio: number };
    };
  };
  hotspot?: { x: number; y: number };
  crop?: { top: number; bottom: number; left: number; right: number };
  alt?: string;
  caption?: string;
}

export interface Category {
  _id: string;
  name: string;
  slug: { current: string };
  description?: string;
  emoji?: string;
  image?: SanityImage;
  displayOrder: number;
  isFeatured: boolean;
  isActive: boolean;
  showInMenu?: boolean;
  bannerImage?: SanityImage;
  productCount?: number;
  seoTitle?: string;
  seoDescription?: string;
}

export interface NavMenuCategory {
  _id: string;
  name: string;
  slug: string;
  productCount: number;
  types: { _id: string; name: string; slug: string; productCount: number }[];
}

export interface Deity {
  _id: string;
  name: string;
  slug: { current: string };
  description?: string;
  image?: SanityImage;
  displayOrder: number;
  isActive: boolean;
}

export interface ProductType {
  _id: string;
  name: string;
  slug: { current: string };
  description?: string;
  displayOrder: number;
  appliesFacets?: string[];
  image?: SanityImage;
  icon?: string;
  category?: Pick<Category, '_id' | 'name' | 'slug'>;
  productCount?: number;
}

export interface Fragrance {
  _id: string;
  name: string;
  slug: { current: string };
  description?: string;
}

export interface ProductSize {
  label: string;
  priceModifier: number;
  /** Absolute selling price for this option (overrides product price + adjustment). */
  price?: number;
  /** Optional MRP for this option, shown struck-through when higher than `price`. */
  mrp?: number;
  stock?: number;
}

export interface ProductColor {
  label: string;
  hex?: string;
  /** Photo of the product in this colour — shown when the colour is selected. */
  image?: SanityImage;
  /** Optional selling price for this colour (overrides product / variant price). */
  price?: number;
  mrp?: number;
}

export interface ProductSpec {
  key: string;
  value: string;
}

export interface Product {
  _id: string;
  name: string;
  slug: { current: string };
  deity?: string;
  deityRef?: Pick<Deity, '_id' | 'name' | 'slug'>;
  productType?: Pick<ProductType, '_id' | 'name' | 'slug'>;
  fragrance?: Pick<Fragrance, '_id' | 'name' | 'slug'>;
  shortDescription?: string;
  description?: unknown[]; // Portable Text
  price: number;
  originalPrice?: number;
  stock: number;
  sizes?: ProductSize[];
  colors?: ProductColor[];
  weight?: string;
  inStock?: boolean;
  sku?: string;
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
  isPremium?: boolean;
  displayOrder: number;
  category: Pick<Category, '_id' | 'name' | 'slug'>;
  images: SanityImage[];
  material?: string;
  careInstructions?: string;
  returnPolicy?: string;
  specifications?: ProductSpec[];
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: SanityImage;
}

export interface HeroSlide {
  _id: string;
  title: string;
  subtitle?: string;
  description?: string;
  image: SanityImage;
  mobileImage?: SanityImage;
  ctaPrimary?: { label: string; link: string };
  ctaSecondary?: { label: string; link: string };
  overlayColor?: number;
  textColor?: 'light' | 'dark';
}

export interface Testimonial {
  _id: string;
  customerName: string;
  location?: string;
  avatar?: SanityImage;
  initials?: string;
  rating: number;
  review: string;
  isVerified: boolean;
  productName?: string;
  productPurchased?: { name: string; slug: { current: string } };
}

export interface Coupon {
  _id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minimumOrderValue: number;
  maximumDiscountCap: number;
  usageLimit: number;
  validFrom?: string;
  validUntil?: string;
  applicableCategories?: Pick<Category, '_id' | 'name'>[];
}

export interface SiteSettings {
  brandName: string;
  tagline: string;
  logo?: SanityImage;
  announcement?: string;
  announcementActive?: boolean;
  showWhyUs?: boolean;
  showReviews?: boolean;
  showInstagram?: boolean;
  showFeedbackForm?: boolean;
  whatsappNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  instagramHandle?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  freeDeliveryThreshold: number;
  deliveryCharge: number;
  estimatedDeliveryDays: number;
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: SanityImage;
  homeHeroTitle?: string;
  homeHeroSubtitle?: string;
  homeHeroDescription?: string;
}

// ── Cart ──────────────────────────────────────────────────────────────────

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  slug: string;
  href?: string;
  price: number;
  /** Price before the selected option's adjustment. */
  basePrice?: number;
  originalPrice?: number;
  /** Product-level MRP, used to recompute the variant MRP when the option changes. */
  baseOriginalPrice?: number;
  image: string;
  deity: string;
  category?: string;
  productType?: string;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
  stock: number;
  productStock?: number;
  options?: ProductSize[];
  colors?: ProductColor[];
}

// ── Order ─────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'return_requested'
  | 'return_approved'
  | 'returned'
  | 'refunded';

export interface OrderItem {
  productId: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

export interface ShippingAddress {
  _id?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  isDefault?: boolean;
}

export interface Order {
  _id: string;
  orderId: string;
  userId?: string;
  guestPhone?: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  total: number;
  couponCode?: string;
  paymentMethod: 'upi' | 'card' | 'netbanking' | 'cod' | 'whatsapp';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentGateway?: 'razorpay' | 'cashfree';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  cashfreeOrderId?: string;
  cashfreePaymentSessionId?: string;
  cashfreePaymentId?: string;
  status: OrderStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface User {
  _id: string;
  phone?: string;
  name?: string;
  email?: string;
  avatar?: string;
  authProviders?: ('phone' | 'email' | 'google' | 'clerk' | 'whatsapp')[];
  role: 'user' | 'admin';
  addresses?: ShippingAddress[];
  wishlist?: string[];
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ── API responses ─────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Filters ───────────────────────────────────────────────────────────────

export interface ProductFilters {
  category?: string;
  deity?: string;
  productType?: string;
  fragrance?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  featuredOnly?: boolean;
  bestsellerOnly?: boolean;
  newArrivalOnly?: boolean;
  sort?: 'featured' | 'price_asc' | 'price_desc' | 'newest' | 'default';
  page?: number;
  limit?: number;
}
