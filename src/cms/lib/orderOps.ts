// Order mutations shared by the document actions and the Orders Dashboard tool.
import type { SanityClient } from 'sanity';
import { STOCK_PRODUCTS_QUERY, buildStockPatches, stockLookupIds } from './orderStock';

export interface OrderItemLine {
  productId?: string;
  productName?: string;
  option?: string;
  colour?: string;
  quantity?: number;
  price?: number;
}

export const historyEntry = (status: string, note?: string) => ({
  _key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  status,
  at: new Date().toISOString(),
  ...(note && { note }),
});

type Tx = ReturnType<SanityClient['transaction']>;

/** Adds stock-restore patches (cancel / return received) to a transaction. */
export async function addRestockPatches(client: SanityClient, tx: Tx, items: OrderItemLine[] = []) {
  const lines = items
    .filter((i): i is OrderItemLine & { productId: string } => Boolean(i.productId))
    .map((i) => ({ productId: i.productId, option: i.option, quantity: i.quantity ?? 1 }));
  if (!lines.length) return;
  const products = await client.fetch(STOCK_PRODUCTS_QUERY, { ids: stockLookupIds(lines) });
  for (const patch of buildStockPatches(products, lines, 1)) tx.patch(patch.id, (p) => p.inc(patch.inc));
}

/** Status change + history entry (+ extra fields) in one commit. */
export async function setOrderStatus(
  client: SanityClient,
  id: string,
  status: string,
  opts: { note?: string; set?: Record<string, unknown>; setIfMissing?: Record<string, unknown>; restockItems?: OrderItemLine[] } = {},
) {
  const tx = client.transaction();
  tx.patch(id, (p) =>
    p
      .setIfMissing({ statusHistory: [], ...opts.setIfMissing })
      .set({ status, ...opts.set })
      .append('statusHistory', [historyEntry(status, opts.note)]),
  );
  if (opts.restockItems) await addRestockPatches(client, tx, opts.restockItems);
  await tx.commit();
}
