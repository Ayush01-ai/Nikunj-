// One-time catch-up: copies status / payment / courier changes the owner made in Sanity Studio onto MongoDB,
// because Studio edits did not previously sync back. Dry-run by default; nothing is written without --apply.
// Preview: npx sanity exec scripts/sync-sanity-status-to-mongo.mjs --with-user-token
// Apply:   npx sanity exec scripts/sync-sanity-status-to-mongo.mjs --with-user-token -- --apply
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import mongoose from 'mongoose';
import { getCliClient } from 'sanity/cli';
import { buildMongoStatusUpdate } from '../src/backend/lib/orderStatusSync.ts';

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
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI missing in .env.local');
  process.exit(1);
}

const client = getCliClient({ apiVersion: '2024-01-01' }).withConfig({
  useCdn: false,
  ...(process.env.SANITY_API_TOKEN ? { token: process.env.SANITY_API_TOKEN } : {}),
});

await mongoose.connect(process.env.MONGODB_URI);
const orders = mongoose.connection.collection('orders');

const mongoOrders = await orders.find({}, { projection: { orderId: 1, status: 1, paymentStatus: 1, paymentMethod: 1, tracking: 1 } }).toArray();
const sanityOrders = await client.fetch(
  `*[_type == "order" && orderNumber in $ids]{orderNumber, status, paymentStatus, tracking{courier, trackingNumber, trackingUrl}}`,
  { ids: mongoOrders.map((o) => o.orderId) },
);
const sanityById = new Map(sanityOrders.map((o) => [o.orderNumber, o]));

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
console.log(`Mongo orders scanned: ${mongoOrders.length} | found in Sanity: ${sanityById.size}\n`);

const changes = [];
const notes = [];
for (const mongoOrder of mongoOrders) {
  const sanity = sanityById.get(mongoOrder.orderId);
  if (!sanity) continue;
  // Sanity-only states have no Mongo equivalent (and no 'pending' regression): never copied.
  if (sanity.status === 'pending' || sanity.status === 'payment_failed') continue;
  const set = buildMongoStatusUpdate(sanity, mongoOrder);
  const diff = Object.fromEntries(
    Object.entries(set).filter(([key, value]) => {
      const current = key.includes('.') ? key.split('.').reduce((acc, part) => acc?.[part], mongoOrder) : mongoOrder[key];
      return current !== value;
    }),
  );
  if (sanity.paymentStatus === 'refund_due') notes.push(`${mongoOrder.orderId}: Sanity paymentStatus=refund_due (Mongo has no such state; stays "${mongoOrder.paymentStatus}" until refunded)`);
  if (Object.keys(diff).length) changes.push({ orderId: mongoOrder.orderId, from: `${mongoOrder.status}/${mongoOrder.paymentStatus}`, to: `${diff.status ?? mongoOrder.status}/${diff.paymentStatus ?? mongoOrder.paymentStatus}`, diff });
}

if (!changes.length) console.log('Nothing to sync: MongoDB already matches Sanity.');
for (const c of changes) {
  console.log(`  ${c.orderId} | ${c.from}  ->  ${c.to}${Object.keys(c.diff).some((k) => k.startsWith('tracking') || k === 'awbCode') ? ' (+ tracking)' : ''}`);
  if (APPLY) {
    const res = await orders.updateOne({ orderId: c.orderId }, { $set: c.diff });
    console.log(`    APPLY ${c.orderId}: ${res.modifiedCount ? 'updated' : 'unchanged'}`);
  }
}
if (notes.length) console.log(`\nNotes:\n${notes.map((n) => `  ${n}`).join('\n')}`);
console.log(APPLY ? `\nDone. ${changes.length} order(s) processed.` : `\nNo changes written. ${changes.length} order(s) would be updated. Re-run with -- --apply after backing up MongoDB.`);

await mongoose.disconnect();
