import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { Order } from '@/backend/models/Order';

/**
 * Stock reservation for orders that are placed but not yet confirmed into Sanity (where stock is
 * actually decremented). Without this, two customers could buy the last piece at the same time —
 * especially with online payment, where the order waits minutes for the customer to pay.
 *
 *  - Every new order is created with `stockHeld: true`; its quantities count against available stock.
 *  - The hold is released once the order is pushed to Sanity (stock decremented there) or, for an
 *    online order that is never paid, after HOLD_MINUTES.
 *  - The check + order creation runs under a short per-product lock in MongoDB, so concurrent
 *    checkouts across server instances are serialised.
 */
export const HOLD_MINUTES = 30;
const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 4_000;

export const holdKey = (productId: string, option?: string) => (option ? `${productId}|${option}` : productId);

/** Quantities held by unconfirmed orders, keyed by productId and by productId|option. */
export async function heldQuantities(productIds: string[]): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  if (productIds.length === 0) return held;
  try {
    const since = new Date(Date.now() - HOLD_MINUTES * 60_000);
    const rows = await Order.aggregate<{ _id: { productId: string; option?: string | null }; qty: number }>([
      { $match: { stockHeld: true, createdAt: { $gte: since }, status: { $nin: ['cancelled'] }, 'items.productId': { $in: productIds } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': { $in: productIds } } },
      { $group: { _id: { productId: '$items.productId', option: '$items.selectedSize' }, qty: { $sum: '$items.quantity' } } },
    ]);
    for (const row of rows ?? []) {
      const { productId, option } = row._id;
      held.set(productId, (held.get(productId) ?? 0) + row.qty);
      if (option) held.set(holdKey(productId, option), (held.get(holdKey(productId, option)) ?? 0) + row.qty);
    }
  } catch (error) {
    console.error('[stock-hold] could not read holds', error instanceof Error ? error.message : error);
  }
  return held;
}

interface LockDoc {
  _id: string;
  owner: string;
  expiresAt: Date;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` while holding a lock on every product id. If MongoDB isn't connected (tests / outage)
 * or the lock can't be taken in time, `fn` still runs — the reservation check is then best-effort.
 */
export async function withStockLock<T>(productIds: string[], fn: () => Promise<T>): Promise<T> {
  const conn = mongoose.connection;
  if (conn.readyState !== 1 || !conn.db) return fn();
  const col = conn.db.collection<LockDoc>('stocklocks');
  const owner = randomUUID();
  const keys = [...new Set(productIds)].sort().map((id) => `stock:${id}`);
  const taken: string[] = [];
  const deadline = Date.now() + LOCK_WAIT_MS;
  try {
    for (const key of keys) {
      for (;;) {
        try {
          await col.insertOne({ _id: key, owner, expiresAt: new Date(Date.now() + LOCK_TTL_MS) });
          taken.push(key);
          break;
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
          await col.deleteOne({ _id: key, expiresAt: { $lt: new Date() } });
          if (Date.now() > deadline) throw new Error(`lock timeout on ${key}`);
          await sleep(60 + Math.random() * 90);
        }
      }
    }
  } catch (error) {
    console.error('[stock-hold] lock not acquired, continuing without it', error instanceof Error ? error.message : error);
  }
  try {
    return await fn();
  } finally {
    if (taken.length) await col.deleteMany({ _id: { $in: taken }, owner }).catch(() => undefined);
  }
}

/** Stock for this order is now decremented in Sanity (or the order is void) — stop counting it as held. */
export async function releaseStockHold(orderId: string): Promise<void> {
  try {
    await Order.updateOne({ orderId, stockHeld: true }, { $set: { stockHeld: false } });
  } catch (error) {
    console.error('[stock-hold] release failed', orderId, error instanceof Error ? error.message : error);
  }
}
