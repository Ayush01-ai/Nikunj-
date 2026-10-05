// Shared by the website server (order confirmed → decrement) and Studio (order cancelled → restore).

export interface StockLine {
  productId: string;
  option?: string;
  quantity: number;
}

interface StockProduct {
  _id: string;
  hasQty: boolean;
  hasLegacy: boolean;
  variants?: { label: string; hasStock: boolean }[] | null;
}

/** Fetch with `{ ids }` = published + draft IDs of every product in the order. */
export const STOCK_PRODUCTS_QUERY = `*[_id in $ids]{
  _id,
  "hasQty": defined(stockQuantity),
  "hasLegacy": defined(stock),
  "variants": sizes[]{ label, "hasStock": defined(stock) }
}`;

export const stockLookupIds = (lines: StockLine[]) =>
  [...new Set(lines.map((l) => l.productId.replace(/^drafts\./, '')))].flatMap((id) => [id, `drafts.${id}`]);

/** Build `inc` patches (sign -1 = sell, +1 = restore). Drafts are patched too so a later publish can't undo it. */
export function buildStockPatches(products: StockProduct[], lines: StockLine[], sign: 1 | -1) {
  const patches: { id: string; inc: Record<string, number> }[] = [];
  for (const product of products) {
    const publishedId = product._id.replace(/^drafts\./, '');
    const inc: Record<string, number> = {};
    for (const line of lines.filter((l) => l.productId.replace(/^drafts\./, '') === publishedId)) {
      const qty = sign * line.quantity;
      const field = product.hasQty ? 'stockQuantity' : product.hasLegacy ? 'stock' : null;
      if (field) inc[field] = (inc[field] ?? 0) + qty;
      const variant = line.option ? product.variants?.find((v) => v.label === line.option) : undefined;
      if (variant?.hasStock) {
        const path = `sizes[label==${JSON.stringify(variant.label)}].stock`;
        inc[path] = (inc[path] ?? 0) + qty;
      }
    }
    if (Object.keys(inc).length > 0) patches.push({ id: product._id, inc });
  }
  return patches;
}
