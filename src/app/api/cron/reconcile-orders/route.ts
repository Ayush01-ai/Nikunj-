import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/backend/lib/mongodb';
import { Order, type IOrder } from '@/backend/models/Order';
import { settleCashfreeOrder } from '@/backend/lib/cashfreeSettlement';
import { resyncOrderToSanity } from '@/backend/lib/sanityOrders';
import { ensureShiprocketOrder } from '@/backend/lib/shiprocketFulfilment';
import { releaseStockHold, HOLD_MINUTES } from '@/backend/lib/stockHold';
import { alertOwnerOrderIssue } from '@/backend/lib/ownerAlert';

export const dynamic = 'force-dynamic';

const BATCH = 20;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
/** Orders older than this are left to the owner (manual scripts); the cron only handles recent ones. */
const LOOKBACK_DAYS = 14;
const ATTENTION_AFTER_MS = 60 * MIN;

function validSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const given = bearer ?? req.headers.get('x-cron-secret');
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function reconcile() {
  await connectDB();
  const now = Date.now();
  const since = new Date(now - LOOKBACK_DAYS * DAY);
  const summary = { ok: true, settled: 0, failed: 0, resynced: 0, shiprocketBooked: 0, alerted: 0, errors: 0 };
  const alert = async (o: Pick<IOrder, 'orderId' | 'shippingAddress' | 'total'>, stage: string, reason: string) => {
    const r = await alertOwnerOrderIssue({
      orderNumber: o.orderId,
      stage,
      reason,
      customerName: o.shippingAddress?.fullName,
      phone: o.shippingAddress?.phone,
      total: o.total,
    });
    if (r === 'sent') summary.alerted++;
  };

  // 1. Online orders whose payment window has passed: confirm if paid, otherwise fail them and free the stock hold.
  // No lookback floor here: an abandoned gateway order must never stay pending (holding stock) forever.
  // Covers legacy card/netbanking methods and any order tied to Cashfree; manual UPI is left to the owner.
  const abandoned = await Order.find({
    $or: [{ paymentMethod: { $in: ['online', 'card', 'netbanking'] } }, { paymentGateway: 'cashfree' }],
    paymentStatus: 'pending',
    status: 'pending',
    createdAt: { $lt: new Date(now - HOLD_MINUTES * MIN) },
  }).sort({ createdAt: 1 }).limit(BATCH);
  for (const order of abandoned) {
    try {
      if (!order.cashfreeOrderId || order.paymentGateway !== 'cashfree') {
        const failed = await Order.updateOne({ _id: order._id, paymentStatus: 'pending' }, { $set: { paymentStatus: 'failed' } });
        if (failed.modifiedCount) {
          await releaseStockHold(order.orderId);
          summary.failed++;
        }
        continue;
      }
      const result = await settleCashfreeOrder(order, 'Cashfree payment confirmed by background reconciliation');
      if (result.state === 'paid') summary.settled++;
      else if (result.state === 'failed') {
        await releaseStockHold(order.orderId);
        summary.failed++;
      } else if (result.state === 'mismatch') {
        await alert(order, 'stuck_order', 'Cashfree payment does not match this order. Check it in the Cashfree dashboard.');
      }
    } catch (e) {
      summary.errors++;
      console.error('[cron/reconcile] settle', order.orderId, errMsg(e));
    }
  }

  // 2. Paid / COD / manual-UPI orders that never reached Sanity (stockHeld is cleared once they do).
  const unsynced = await Order.find({
    stockHeld: true,
    status: { $ne: 'cancelled' },
    createdAt: { $lt: new Date(now - 5 * MIN), $gt: since },
    $or: [{ paymentMethod: 'cod' }, { paymentStatus: 'paid' }, { paymentMethod: 'upi', paymentGateway: { $exists: false } }],
  }).sort({ createdAt: 1 }).limit(BATCH);
  for (const order of unsynced) {
    try {
      if (await resyncOrderToSanity(order.orderId)) {
        summary.resynced++;
      } else if (order.createdAt.getTime() < now - HOLD_MINUTES * MIN) {
        await alert(order, 'stuck_order', 'Order is saved on the website but could not be copied to Sanity. Re-sync it or run scripts/sync-orders-to-sanity.mjs.');
      }
    } catch (e) {
      summary.errors++;
      console.error('[cron/reconcile] resync', order.orderId, errMsg(e));
    }
  }

  // 3. Confirmed orders that were never booked on Shiprocket (orders that already failed are flagged and skipped).
  if (process.env.SHIPROCKET_ENABLED === 'true') {
    const unbooked = await Order.find({
      shiprocketOrderId: null,
      status: { $in: ['confirmed', 'processing'] },
      needsAttention: { $ne: true },
      fulfilmentMode: { $ne: 'SELF_DELIVERY' },
      createdAt: { $lt: new Date(now - 5 * MIN), $gt: since },
      $or: [{ paymentStatus: 'paid' }, { paymentMethod: 'cod' }],
    }).sort({ createdAt: 1 }).limit(BATCH);
    for (const order of unbooked) {
      try {
        const r = await ensureShiprocketOrder(order.orderId);
        if (!r.ok) summary.errors++;
        else if (r.created) summary.shiprocketBooked++;
      } catch (e) {
        summary.errors++;
        console.error('[cron/reconcile] shiprocket', order.orderId, errMsg(e));
      }
    }
  }

  // 4. Orders still flagged for attention after an hour (deduped, so each issue alerts once).
  const flagged = await Order.find({
    needsAttention: true,
    status: { $nin: ['cancelled', 'delivered', 'refunded', 'returned'] },
    updatedAt: { $lt: new Date(now - ATTENTION_AFTER_MS) },
    createdAt: { $gt: since },
  }).sort({ updatedAt: 1 }).limit(BATCH);
  for (const order of flagged) {
    try {
      await alert(order, 'stuck_order', `Order is still flagged for attention: ${order.attentionNote ?? 'no details'}`);
    } catch (e) {
      summary.errors++;
      console.error('[cron/reconcile] alert', order.orderId, errMsg(e));
    }
  }

  return summary;
}

async function handle(req: NextRequest) {
  if (!validSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await reconcile());
  } catch (e) {
    console.error('[cron/reconcile] failed', errMsg(e));
    return NextResponse.json({ ok: false, error: 'Reconciliation failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
