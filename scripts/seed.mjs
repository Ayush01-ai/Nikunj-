import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@sanity/client';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['\"]|['\"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function makeSlug(current) {
  return { _type: 'slug', current };
}

loadEnvLocal();

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const token = process.env.SANITY_API_TOKEN;

if (!projectId) {
  console.error('Missing NEXT_PUBLIC_SANITY_PROJECT_ID in environment.');
  process.exit(1);
}

if (!token) {
  console.error('Missing SANITY_API_TOKEN in environment.');
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2025-01-01',
  token,
  useCdn: false,
});

const categories = [
  {
    _id: 'category.deity-shringar',
    _type: 'category',
    name: 'Deity Shringar',
    slug: makeSlug('deity-shringar'),
    description: 'Sacred ornaments and complete shringar products for deities.',
    displayOrder: 1,
    isActive: true,
    isFeatured: true,
  },
  {
    _id: 'category.ittar-collection',
    _type: 'category',
    name: 'Ittar Collection',
    slug: makeSlug('ittar-collection'),
    description: 'Traditional devotional fragrances and ittar offerings.',
    displayOrder: 2,
    isActive: true,
    isFeatured: true,
  },
  {
    _id: 'category.dhoop-agarbatti',
    _type: 'category',
    name: 'Dhoop & Agarbatti',
    slug: makeSlug('dhoop-agarbatti'),
    description: 'Dhoop sticks, cones, and agarbatti for puja rituals.',
    displayOrder: 3,
    isActive: true,
    isFeatured: true,
  },
];

const deities = [
  { name: 'Radha Krishna', displayOrder: 1 },
  { name: 'Laddu Gopal', displayOrder: 2 },
  { name: 'Yugal Sarkar', displayOrder: 3 },
].map((item) => ({
  _id: `deity.${slugify(item.name)}`,
  _type: 'deity',
  name: item.name,
  slug: makeSlug(slugify(item.name)),
  description: `${item.name} devotional collection`,
  displayOrder: item.displayOrder,
  isActive: true,
}));

const productTypes = [
  'Haar',
  'Mala',
  'Mukut',
  'Earrings',
  'Bracelet',
  'Payal',
  'Complete Shringar Set',
].map((name, index) => ({
  _id: `productType.${slugify(name)}`,
  _type: 'productType',
  name,
  slug: makeSlug(slugify(name)),
  description: `${name} product type`,
  displayOrder: index + 1,
}));

const fragrances = [
  'Rose',
  'Sandalwood',
  'Mogra',
  'Kesar',
  'Oudh',
  'Jasmine',
  'Guggal',
  'Loban',
].map((name) => ({
  _id: `fragrance.${slugify(name)}`,
  _type: 'fragrance',
  name,
  slug: makeSlug(slugify(name)),
  description: `${name} fragrance profile`,
}));

async function seed() {
  const docs = [...categories, ...deities, ...productTypes, ...fragrances];

  for (const doc of docs) {
    await client.createOrReplace(doc);
    console.log(`Seeded ${doc._type}: ${doc.name}`);
  }

  console.log('\nSeed completed successfully.');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
});
