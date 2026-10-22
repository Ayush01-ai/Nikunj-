// Copy existing website orders (MongoDB) into Sanity so the owner can manage them in Studio.
// Also recovers orders whose live sync failed (e.g. SANITY_API_TOKEN missing in production);
// manual-UPI orders still awaiting payment are copied as "Awaiting payment".
// Past orders are copied as-is: stock is NOT changed for them.
// Preview:  npx sanity exec scripts/sync-orders-to-sanity.mjs --with-user-token
// Apply:    npx sanity exec scripts/sync-orders-to-sanity.mjs --with-user-token -- --apply
// (SANITY_API_TOKEN from .env.local is used when set; otherwise your `sanity login` token.)
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
    const key = line.slice(0, line.indexOf('=')).trim();
    if (!process.env[key]) process.env[key] = line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}

const APPLY = process.argv.includes('--apply');
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI missing in .env.local');
  process.exit(1);
}

const client = getCliClient({ apiVersion: '2024-01-01' }).withConfig({
  useCdn: false,
  ...(process.env.SANITY_API_TOKEN ? { token: process.env.SANITY_API_TOKEN } : {}),
});
await mongoose.connect(process.env.MONGODB_URI);
const isManualUpiPending = (o) => o.paymentMethod === 'upi' && o.paymentStatus !== 'paid' && o.status === 'pending' && !o.paymentGateway;
const orders = await mongoose.connection
  .collection('orders')
  .find({
    $or: [
      { paymentMethod: 'cod' },
      { paymentStatus: 'paid' },
      { status: { $nin: ['pending'] } },
      // Manual-UPI orders (no gateway) that never reached Studio.
      { paymentMethod: 'upi', status: 'pending', stockHeld: true, paymentGateway: { $exists: false } },
    ],
  })
  .sort({ createdAt: 1 })
  .toArray();

const existing = new Set(
  await client.fetch('*[_type == "order" && _id in $ids]._id', { ids: orders.map((o) => `orders.${o.orderId}`) }),
);
const missing = orders.filter((o) => !existing.has(`orders.${o.orderId}`));

console.log(`\nMode: ${APPLY ? 'APPLY' : 'DRY RUN'} | confirmed orders in MongoDB: ${orders.length} | already in Sanity: ${existing.size} | to copy: ${missing.length}\n`);

const tx = client.transaction();
for (const o of missing) {
  const status = isManualUpiPending(o) ? 'pending' : o.status === 'pending' ? 'confirmed' : o.status === 'refunded' ? 'cancelled' : o.status;
  const at = new Date(o.createdAt ?? Date.now()).toISOString();
  const a = o.shippingAddress ?? {};
  console.log(`  + ${o.orderId}  ${at.slice(0, 10)}  ${a.fullName ?? ''}  ₹${o.total}  ${status}`);
  tx.create({
    _id: `orders.${o.orderId}`,
    _type: 'order',
    orderNumber: o.orderId,
    status,
    placedAt: at,
    customerName: a.fullName,
    phone: a.phone,
    shippingAddress: { line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode },
    items: (o.items ?? []).map((i) => ({
      productId: i.productId,
      productName: i.name,
      image: i.image || undefined,
      option: i.selectedSize,
      colour: i.selectedColor,
      price: i.price,
      quantity: i.quantity,
    })),
    subtotal: o.subtotal,
    deliveryCharge: o.deliveryCharge,
    discount: o.discount,
    couponCode: o.couponCode,
    total: o.total,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    razorpayPaymentId: o.razorpayPaymentId,
    paymentGateway: o.paymentGateway,
    upiReference: o.upiReference,
    statusHistory: [{ status, at, note: 'Imported from website records' }],
    stockAdjusted: false,
  });
}

if (APPLY && missing.length > 0) {
  const res = await tx.commit({ autoGenerateArrayKeys: true });
  console.log(`\nCopied ${missing.length} orders (transaction ${res.transactionId}).`);
  // Copied orders are in Studio now; stop counting them as website stock holds.
  await mongoose.connection
    .collection('orders')
    .updateMany({ orderId: { $in: missing.map((o) => o.orderId) }, stockHeld: true }, { $set: { stockHeld: false } });
} else if (!APPLY) {
  console.log('\nNo changes written. Re-run with -- --apply to copy.');
}
await mongoose.disconnect();
