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
  stockQuantity?: number | null;
  stock?: number | null;
  variants?: { label: string; hasStock: boolean; stock?: number | null }[] | null;
}

/** Fetch with `{ ids }` = published + draft IDs of every product in the order. */
export const STOCK_PRODUCTS_QUERY = `*[_id in $ids]{
  _id,
  "hasQty": defined(stockQuantity),
  "hasLegacy": defined(stock),
  stockQuantity,
  stock,
  "variants": sizes[]{ label, "hasStock": defined(stock), stock }
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

/** Returns the requested lines that will take tracked stock below zero when sold. */
export function findInsufficientStockLines(products: StockProduct[], lines: StockLine[]): StockLine[] {
  const insufficient = new Map<string, StockLine>();
  const groupedLines = new Map<string, StockLine>();
  for (const line of lines) {
    const key = `${line.productId.replace(/^drafts\./, '')}|${line.option ?? ''}`;
    const existing = groupedLines.get(key);
    groupedLines.set(key, existing ? { ...existing, quantity: existing.quantity + line.quantity } : line);
  }

  for (const product of products) {
    const publishedId = product._id.replace(/^drafts\./, '');
    const productStock = product.hasQty ? product.stockQuantity : product.hasLegacy ? product.stock : undefined;

    for (const line of groupedLines.values()) {
      if (line.productId.replace(/^drafts\./, '') !== publishedId) continue;
      const variant = line.option ? product.variants?.find((item) => item.label === line.option) : undefined;
      const stock = variant?.hasStock && typeof variant.stock === 'number' ? variant.stock : productStock;
      if (typeof stock !== 'number' || !Number.isFinite(stock) || stock >= line.quantity) continue;
      const key = `${publishedId}|${line.option ?? ''}`;
      insufficient.set(key, line);
    }
  }
  return [...insufficient.values()];
}
