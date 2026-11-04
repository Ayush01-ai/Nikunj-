// Reconcile MongoDB orders against Sanity. Dry-run is read-only; pass --apply only
// after reviewing the report and backing up both stores.
// Preview: npx sanity exec scripts/reconcile-orders-sanity.mjs --with-user-token
// Apply:   npx sanity exec scripts/reconcile-orders-sanity.mjs --with-user-token -- --apply
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import mongoose from 'mongoose';
import { getCliClient } from 'sanity/cli';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const separator = line.indexOf('=');
    const key = line.slice(0, separator).trim();
    if (!process.env[key]) process.env[key] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 100;
const HOLD_MINUTES = 30;
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI missing in .env.local');
  process.exit(1);
}

const client = getCliClient({ apiVersion: '2024-01-01' }).withConfig({
  useCdn: false,
  ...(process.env.SANITY_API_TOKEN ? { token: process.env.SANITY_API_TOKEN } : {}),
});

const sanityId = (orderId) => `orders.${orderId}`;
const stockLines = (order) => (order.items ?? []).map((item) => ({
  productId: item.productId,
  option: item.selectedSize,
  quantity: item.quantity,
}));

function buildStockPatches(products, lines, sign) {
  const patches = [];
  for (const product of products) {
    const publishedId = product._id.replace(/^drafts\./, '');
    const inc = {};
    for (const line of lines.filter((item) => item.productId.replace(/^drafts\./, '') === publishedId)) {
      const quantity = sign * line.quantity;
      const field = product.hasQty ? 'stockQuantity' : product.hasLegacy ? 'stock' : null;
      if (field) inc[field] = (inc[field] ?? 0) + quantity;
      const variant = line.option ? product.variants?.find((item) => item.label === line.option) : undefined;
      if (variant?.hasStock) {
        const fieldPath = `sizes[label==${JSON.stringify(variant.label)}].stock`;
        inc[fieldPath] = (inc[fieldPath] ?? 0) + quantity;
      }
    }
    if (Object.keys(inc).length) patches.push({ id: product._id, inc });
  }
  return patches;
}

async function getStockData(order) {
  const lines = stockLines(order);
  const ids = [...new Set(lines.map((item) => item.productId.replace(/^drafts\./, '')))]
    .flatMap((id) => [id, `drafts.${id}`]);
  const products = await client.fetch(
    `*[_id in $ids]{"_id":_id,"hasQty":defined(stockQuantity),"hasLegacy":defined(stock),stockQuantity,stock,"variants":sizes[]{"label":label,"hasStock":defined(stock),stock}}`,
    { ids },
  );
  return { products, lines };
}

function findInsufficientStockLines(products, lines) {
  const grouped = new Map();
  for (const line of lines) {
    const key = `${line.productId.replace(/^drafts\./, '')}|${line.option ?? ''}`;
    const existing = grouped.get(key);
    grouped.set(key, existing ? { ...existing, quantity: existing.quantity + line.quantity } : line);
  }
  const insufficient = new Map();
  for (const product of products) {
    const productId = product._id.replace(/^drafts\./, '');
    const productStock = product.hasQty ? product.stockQuantity : product.hasLegacy ? product.stock : undefined;
    const trackedVariants = (product.variants ?? []).filter((variant) => typeof variant.stock === 'number');
    const variantsTracked = trackedVariants.length > 0 && !(
      trackedVariants.every((variant) => variant.stock === 0) && typeof productStock === 'number' && productStock > 0
    );
    for (const line of grouped.values()) {
      if (line.productId.replace(/^drafts\./, '') !== productId) continue;
      const variant = line.option ? product.variants?.find((item) => item.label === line.option) : undefined;
      const stock = variant && variantsTracked && variant.hasStock ? variant.stock : productStock;
      if (typeof stock === 'number' && Number.isFinite(stock) && stock < line.quantity) {
        insufficient.set(`${productId}|${line.option ?? ''}`, line);
      }
    }
  }
  return [...insufficient.values()];
}

async function getStockPatches(order, sign) {
  const { products, lines } = await getStockData(order);
  return buildStockPatches(products, lines, sign);
}

function buildOrderDocument(order, status, paymentStatus, stockAdjusted = false) {
  const address = order.shippingAddress ?? {};
  const at = new Date(order.createdAt ?? Date.now()).toISOString();
  return {
    _id: sanityId(order.orderId),
    _type: 'order',
    orderNumber: order.orderId,
    status,
    placedAt: at,
    customerName: address.fullName,
    phone: address.phone,
    shippingAddress: {
      line1: address.line1,
      line2: address.line2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    },
    items: (order.items ?? []).map((item) => ({
      productId: item.productId,
      productName: item.name,
      image: item.image || undefined,
      option: item.selectedSize,
      colour: item.selectedColor,
      price: item.price,
      quantity: item.quantity,
    })),
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    discount: order.discount,
    couponCode: order.couponCode,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus,
    paymentGateway: order.paymentGateway,
    cashfreeOrderId: order.cashfreeOrderId,
    cashfreePaymentId: order.cashfreePaymentId,
    razorpayPaymentId: order.razorpayPaymentId,
    upiReference: order.upiReference,
    statusHistory: [{ status, at: new Date().toISOString(), note: 'Reconciled from MongoDB order state' }],
    stockAdjusted,
  };
}

async function repairPaidOrder(order, sanityOrder) {
  if (!sanityOrder) {
    // There is no Sanity stockAdjusted marker to prove whether inventory was already changed.
    // Create the missing admin document, but leave inventory for manual reconciliation.
    await client.createIfNotExists(buildOrderDocument(order, order.status === 'pending' ? 'confirmed' : order.status, 'paid'));
    return 'created; stock not adjusted (no prior Sanity marker)';
  }

  const id = sanityId(order.orderId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await client.fetch(
      '*[_id == $id][0]{_rev,status,paymentStatus,stockAdjusted}',
      { id },
    );
    if (!current) throw new Error(`Sanity order disappeared during apply: ${order.orderId}`);

    const stockData = current.stockAdjusted === true ? null : await getStockData(order);
    const stockPatches = stockData ? buildStockPatches(stockData.products, stockData.lines, -1) : [];
    const insufficientStockLines = stockData ? findInsufficientStockLines(stockData.products, stockData.lines) : [];
    const attentionItems = insufficientStockLines.map((line) => {
      const item = order.items?.find((candidate) =>
        candidate.productId === line.productId && candidate.selectedSize === line.option,
      );
      return `${item?.name ?? line.productId}${line.option ? ` (${line.option})` : ''}`;
    });
    const nextStatus = ['pending', 'payment_failed'].includes(current.status)
      ? 'confirmed'
      : current.status || 'confirmed';
    const changed = current.status !== nextStatus || current.paymentStatus !== 'paid';
    const orderPatch = client
      .patch(id)
      .ifRevisionId(current._rev)
      .set({
        status: nextStatus,
        paymentStatus: 'paid',
        paymentGateway: order.paymentGateway,
        cashfreeOrderId: order.cashfreeOrderId,
        ...(order.cashfreePaymentId ? { cashfreePaymentId: order.cashfreePaymentId } : {}),
        stockAdjusted: current.stockAdjusted === true || stockPatches.length > 0,
        ...(attentionItems.length
          ? {
              needsAttention: true,
              attentionNote: `Paid order exceeded tracked stock for ${attentionItems.join(', ')}. Review inventory and fulfillment manually.`,
            }
          : {}),
      })
      .setIfMissing({ statusHistory: [] });
    if (changed) {
      orderPatch.append('statusHistory', [{
        status: nextStatus,
        at: new Date().toISOString(),
        note: 'Reconciled paid MongoDB order',
      }]);
    }
    const tx = client.transaction().patch(id, orderPatch);
    for (const stockPatch of stockPatches) tx.patch(stockPatch.id, (patch) => patch.inc(stockPatch.inc));

    try {
      await tx.commit({ autoGenerateArrayKeys: true });
      return [
        stockPatches.length ? 'confirmed; inventory adjusted' : 'confirmed; no inventory adjustment needed',
        ...(attentionItems.length ? ['needs attention flagged for stock shortage'] : []),
      ].join('; ');
    } catch (error) {
      if (error?.statusCode !== 409 || attempt === 2) throw error;
    }
  }
  throw new Error(`Could not reconcile paid order ${order.orderId} after concurrent updates.`);
}

async function repairFailedOrder(order, sanityOrder) {
  if (!sanityOrder || sanityOrder.stockAdjusted !== true) return 'skipped; no confirmed stock adjustment';

  const id = sanityId(order.orderId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await client.fetch('*[_id == $id][0]{_rev,status,paymentStatus,stockAdjusted}', { id });
    if (!current || current.stockAdjusted !== true) return 'skipped; stock already restored';
    const protectedStatuses = new Set([
      'confirmed',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'return_requested',
      'return_approved',
      'returned',
      'refunded',
    ]);
    if (current.paymentStatus === 'paid' || protectedStatuses.has(current.status)) {
      return 'skipped; Sanity indicates payment or fulfillment already progressed';
    }
    const stockPatches = await getStockPatches(order, 1);
    if (!stockPatches.length) throw new Error(`Cannot restore adjusted stock for ${order.orderId}: products not found.`);
    const nextStatus = 'payment_failed';
    const orderPatch = client
      .patch(id)
      .ifRevisionId(current._rev)
      .set({ status: nextStatus, paymentStatus: 'failed', stockAdjusted: false })
      .setIfMissing({ statusHistory: [] })
      .append('statusHistory', [{
        status: nextStatus,
        at: new Date().toISOString(),
        note: 'Restored stock for failed online payment',
      }]);
    const tx = client.transaction().patch(id, orderPatch);
    for (const stockPatch of stockPatches) tx.patch(stockPatch.id, (patch) => patch.inc(stockPatch.inc));
    try {
      await tx.commit({ autoGenerateArrayKeys: true });
      return 'failed payment recorded; inventory restored';
    } catch (error) {
      if (error?.statusCode !== 409 || attempt === 2) throw error;
    }
  }
  throw new Error(`Could not reconcile failed order ${order.orderId} after concurrent updates.`);
}

await mongoose.connect(process.env.MONGODB_URI);
try {
  const collection = mongoose.connection.collection('orders');
  const orders = await collection.find({}).sort({ createdAt: 1 }).toArray();
  const sanityByOrderId = new Map();
  const ids = orders.map((order) => order.orderId).filter(Boolean);
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE).map(sanityId);
    const rows = await client.fetch('*[_id in $ids]{_id,orderNumber,status,paymentStatus,stockAdjusted}', { ids: batch });
    for (const row of rows) sanityByOrderId.set(row.orderNumber ?? row._id.replace(/^orders\./, ''), row);
  }

  const cutoff = Date.now() - HOLD_MINUTES * 60_000;
  const paidNotConfirmed = [];
  const failedWithAdjustedStock = [];
  const staleOnlineWithAdjustedStock = [];
  const statusMismatches = [];

  for (const order of orders) {
    if (!order.orderId) continue;
    const sanityOrder = sanityByOrderId.get(order.orderId);
    if (
      order.paymentStatus === 'paid' &&
      (!sanityOrder || sanityOrder.paymentStatus !== 'paid' || ['pending', 'payment_failed'].includes(sanityOrder.status))
    ) {
      paidNotConfirmed.push({ order, sanityOrder });
    }
    if (order.paymentMethod === 'online' && order.paymentStatus === 'failed' && sanityOrder?.stockAdjusted === true) {
      failedWithAdjustedStock.push({ order, sanityOrder });
    } else if (
      order.paymentMethod === 'online' &&
      order.paymentStatus === 'pending' &&
      order.status === 'pending' &&
      new Date(order.createdAt).getTime() <= cutoff &&
      sanityOrder?.stockAdjusted === true
    ) {
      staleOnlineWithAdjustedStock.push({ order, sanityOrder });
    }
    if (sanityOrder && sanityOrder.status !== order.status) {
      statusMismatches.push({ order, sanityOrder });
    }
  }

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Mongo orders scanned: ${orders.length}`);
  console.log('\nMongo paid, but Sanity is missing or not marked paid/confirmed:');
  for (const { order, sanityOrder } of paidNotConfirmed) {
    console.log(`  ${order.orderId} | Mongo=${order.status}/${order.paymentStatus} | Sanity=${sanityOrder?.status ?? 'missing'}/${sanityOrder?.paymentStatus ?? 'missing'}`);
  }
  console.log('\nFailed online payments with Sanity stockAdjusted=true:');
  for (const { order } of failedWithAdjustedStock) console.log(`  ${order.orderId} | Mongo=${order.status}/${order.paymentStatus}`);
  console.log('\nStale pending online orders with Sanity stockAdjusted=true (abandoned is unverified):');
  for (const { order } of staleOnlineWithAdjustedStock) console.log(`  ${order.orderId} | Mongo=${order.status}/${order.paymentStatus}`);
  console.log('\nMongo/Sanity fulfillment status disagreements (not auto-resolved):');
  for (const { order, sanityOrder } of statusMismatches) {
    console.log(`  ${order.orderId} | Mongo=${order.status} | Sanity=${sanityOrder.status}`);
  }

  if (APPLY) {
    for (const { order, sanityOrder } of paidNotConfirmed) {
      console.log(`  APPLY ${order.orderId}: ${await repairPaidOrder(order, sanityOrder)}`);
    }
    for (const { order, sanityOrder } of failedWithAdjustedStock) {
      console.log(`  APPLY ${order.orderId}: ${await repairFailedOrder(order, sanityOrder)}`);
    }
    if (staleOnlineWithAdjustedStock.length) {
      console.log(`\nSkipped ${staleOnlineWithAdjustedStock.length} stale pending order(s): verify Cashfree state before applying a failure repair.`);
    }
    if (statusMismatches.length) {
      console.log(`Skipped ${statusMismatches.length} generic status disagreement(s): Mongo/Sanity authority needs manual review.`);
    }
  } else {
    console.log('\nNo changes written. Back up MongoDB and Sanity, review this report, then rerun with -- --apply.');
  }
} finally {
  await mongoose.disconnect();
}
