import type { Product, ProductSize } from '@/types';

/**
 * Single source of truth for product / variant pricing, stock and discount.
 * Pure functions — shared by the storefront, the cart and the order API so the
 * price a shopper sees is exactly the price the server charges.
 */

type PricedProduct = Pick<Product, 'price' | 'originalPrice' | 'stock' | 'sizes'> & Partial<Pick<Product, 'colors'>>;

export interface VariantPricing {
  /** Selling price for one unit. */
  price: number;
  /** Struck-through MRP, only when it is higher than `price`. */
  mrp?: number;
  /** Whole-number discount %, 0 when there is no real discount. */
  discount: number;
  /** Units available for this choice. */
  stock: number;
}

export function discountPercent(mrp: number | undefined | null, price: number): number {
  if (!mrp || mrp <= price || price < 0) return 0;
  // Floor so we never advertise more than the real saving (e.g. 33.3% → 33%).
  return Math.floor(((mrp - price) / mrp) * 100);
}

export function variantStock(product: PricedProduct, variant?: ProductSize): number {
  const productStock = Math.max(0, product.stock ?? 0);
  if (!variant || variant.stock === null || variant.stock === undefined) return productStock;
  return Math.max(0, variant.stock);
}

export function getVariantPricing(product: PricedProduct, sizeLabel?: string, colorLabel?: string): VariantPricing {
  const variant = sizeLabel ? product.sizes?.find((s) => s.label === sizeLabel) : undefined;
  const colour = colorLabel ? product.colors?.find((c) => c.label === colorLabel) : undefined;
  let price = product.price;
  let mrp = product.originalPrice;

  if (variant) {
    if (typeof variant.price === 'number' && variant.price > 0) {
      price = variant.price;
      mrp = typeof variant.mrp === 'number' ? variant.mrp : undefined;
    } else {
      const modifier = variant.priceModifier ?? 0;
      price = product.price + modifier;
      mrp = mrp ? mrp + modifier : undefined;
    }
  }

  // A colour with its own price (set in Sanity next to the colour image) wins.
  if (colour && typeof colour.price === 'number' && colour.price > 0) {
    price = colour.price;
    mrp = typeof colour.mrp === 'number' ? colour.mrp : undefined;
  }

  price = Math.max(0, Math.round(price));
  const discount = discountPercent(mrp, price);
  return {
    price,
    mrp: discount > 0 ? Math.round(mrp as number) : undefined,
    discount,
    stock: variantStock(product, variant),
  };
}

/** First option that can actually be bought, so the page never opens on a sold-out variant. */
export function defaultVariant(product: PricedProduct): ProductSize | undefined {
  const sizes = product.sizes ?? [];
  return sizes.find((s) => variantStock(product, s) > 0) ?? sizes[0];
}

/** Lowest price across all variants (for "From ₹X" on cards). */
export function lowestPricing(product: PricedProduct): VariantPricing & { hasRange: boolean } {
  const sizes = product.sizes ?? [];
  const colours = product.colors ?? [];
  const colourPriced = colours.some((c) => typeof c.price === 'number' && c.price > 0);
  if (sizes.length === 0 && !colourPriced) return { ...getVariantPricing(product), hasRange: false };
  const sizeLabels = sizes.length ? sizes.map((s) => s.label) : [undefined];
  const colourLabels = colourPriced ? colours.map((c) => c.label) : [undefined];
  const all = sizeLabels.flatMap((s) => colourLabels.map((c) => getVariantPricing(product, s, c)));
  const lowest = all.reduce((a, b) => (b.price < a.price ? b : a));
  return { ...lowest, hasRange: new Set(all.map((p) => p.price)).size > 1 };
}

export const formatINR = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`;

/** Used only when Site Settings leaves the delivery fields empty. */
export const DEFAULT_FREE_DELIVERY_THRESHOLD = 399;
export const DEFAULT_DELIVERY_CHARGE = 99;
export const COD_MINIMUM_ORDER_VALUE = 200;
export const COD_DELIVERY_CHARGE = 60;
export const PREPAID_DISCOUNT = 0;

export type DeliverySettings = { freeDeliveryThreshold?: number | null; deliveryCharge?: number | null } | null | undefined;

const nonNegative = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;

/** Delivery rules from Site Settings (Studio), with safe defaults. */
export function deliveryPolicy(settings: DeliverySettings) {
  return {
    freeDeliveryThreshold: nonNegative(settings?.freeDeliveryThreshold, DEFAULT_FREE_DELIVERY_THRESHOLD),
    deliveryCharge: nonNegative(settings?.deliveryCharge, DEFAULT_DELIVERY_CHARGE),
  };
}

/**
 * Single source of truth for an order's delivery charge and payable total, used by the checkout
 * summary, the cart and the order API, so what the shopper sees is exactly what is charged.
 * COD uses a fixed delivery charge; prepaid orders receive a discount. Free delivery is decided
 * on the item subtotal (before any coupon).
 */
export function orderTotals(
  subtotal: number,
  discount: number,
  settings: DeliverySettings,
  paymentMethod?: 'cod' | 'online',
) {
  const { freeDeliveryThreshold, deliveryCharge: charge } = deliveryPolicy(settings);
  const sub = Math.max(0, Math.round(subtotal));
  const couponDiscount = Math.min(Math.max(0, Math.round(discount)), sub);
  const prepaidDiscount =
    paymentMethod === 'online' ? Math.min(PREPAID_DISCOUNT, sub - couponDiscount) : 0;
  const totalDiscount = couponDiscount + prepaidDiscount;
  const deliveryCharge =
    paymentMethod === 'cod' ? COD_DELIVERY_CHARGE : sub >= freeDeliveryThreshold ? 0 : charge;
  return {
    subtotal: sub,
    discount: totalDiscount,
    couponDiscount,
    prepaidDiscount,
    deliveryCharge,
    freeDeliveryThreshold,
    total: sub + deliveryCharge - totalDiscount,
  };
}
