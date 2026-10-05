import type { CartItem, Product } from '@/types';

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

/** True when the shopper must choose an option or colour before adding to cart. */
export const needsChoice = (product: Pick<Product, 'sizes' | 'colors'>) =>
  Boolean(product.sizes?.length || product.colors?.length);

/** Single place that turns a product + choices into a complete cart line. */
export function toCartItem(
  product: Product,
  opts: { size?: string; color?: string; quantity?: number; image?: string } = {},
): CartItem {
  const variant = product.sizes?.find((s) => s.label === opts.size);
  const color = product.colors?.find((c) => c.label === opts.color)?.label;
  return {
    id: cartItemId(product._id, variant?.label, color),
    productId: product._id,
    name: product.name,
    slug: product.slug?.current ?? product._id,
    href: getProductHref(product),
    basePrice: product.price,
    price: product.price + (variant?.priceModifier ?? 0),
    originalPrice: product.originalPrice,
    image: opts.image ?? product.images?.find((img) => img?.asset?.url)?.asset.url ?? '',
    deity: typeof product.deity === 'string' ? product.deity : '',
    category: product.category?.name,
    productType: product.productType?.name,
    quantity: opts.quantity ?? 1,
    selectedSize: variant?.label,
    selectedColor: color,
    stock: variant?.stock ?? product.stock,
    productStock: product.stock,
    options: product.sizes,
    colors: product.colors,
  };
}
