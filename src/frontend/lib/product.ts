import type { CartItem, Product, SanityImage } from '@/types';
import { getVariantPricing } from '@/cms/lib/pricing';

/** Build a reliable detail URL for both new and legacy CMS product records. */
export function getProductHref(product: Pick<Product, '_id' | 'slug'>) {
  const slug = product.slug?.current;
  const pathSegment = slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)
    ? slug
    : product._id;

  return `/products/${encodeURIComponent(pathSegment)}`;
}

export const cartItemId = (productId: string, size?: string, color?: string) =>
  [productId, size || '', color || ''].join('_');

/**
 * Product photos plus any colour-specific photos (deduplicated), so selecting a
 * colour can jump straight to its image.
 */
export function productGallery(product: Pick<Product, 'images' | 'colors'>): SanityImage[] {
  const gallery = (product.images ?? []).filter((img) => img?.asset);
  const seen = new Set(gallery.map((img) => img.asset._id || img.asset.url));
  for (const c of product.colors ?? []) {
    const img = c.image;
    if (!img?.asset) continue;
    const key = img.asset._id || img.asset.url;
    if (seen.has(key)) continue;
    seen.add(key);
    gallery.push({ ...img, alt: img.alt || c.label });
  }
  return gallery;
}

/** Index of the selected colour's photo in `productGallery`, or -1. */
export function colourImageIndex(gallery: SanityImage[], product: Pick<Product, 'colors'>, colour?: string): number {
  const img = product.colors?.find((c) => c.label === colour)?.image;
  if (!img?.asset) return -1;
  const key = img.asset._id || img.asset.url;
  return gallery.findIndex((g) => (g.asset._id || g.asset.url) === key);
}

/** Colour whose photo is at `index`, if any. */
export function colourAtImage(gallery: SanityImage[], product: Pick<Product, 'colors'>, index: number): string | undefined {
  const g = gallery[index];
  if (!g?.asset) return undefined;
  const key = g.asset._id || g.asset.url;
  return product.colors?.find((c) => c.image?.asset && (c.image.asset._id || c.image.asset.url) === key)?.label;
}

/** True when the shopper must choose an option or colour before adding to cart. */
export const needsChoice = (product: Pick<Product, 'sizes' | 'colors'>) =>
  Boolean(product.sizes?.length || product.colors?.length);

/** Single place that turns a product + choices into a complete cart line. */
export function toCartItem(
  product: Product,
  opts: { size?: string; color?: string; quantity?: number; image?: string } = {},
): CartItem {
  const variant = product.sizes?.find((s) => s.label === opts.size);
  const colour = product.colors?.find((c) => c.label === opts.color);
  const color = colour?.label;
  const pricing = getVariantPricing(product, variant?.label, color);
  return {
    id: cartItemId(product._id, variant?.label, color),
    productId: product._id,
    name: product.name,
    slug: product.slug?.current ?? product._id,
    href: getProductHref(product),
    basePrice: product.price,
    price: pricing.price,
    originalPrice: pricing.mrp,
    baseOriginalPrice: product.originalPrice,
    image: opts.image ?? colour?.image?.asset?.url ?? product.images?.find((img) => img?.asset?.url)?.asset.url ?? '',
    deity: typeof product.deity === 'string' ? product.deity : '',
    category: product.category?.name,
    productType: product.productType?.name,
    quantity: Math.max(1, Math.min(opts.quantity ?? 1, pricing.stock || 1)),
    selectedSize: variant?.label,
    selectedColor: color,
    stock: pricing.stock,
    productStock: product.stock,
    options: product.sizes,
    colors: product.colors,
  };
}
