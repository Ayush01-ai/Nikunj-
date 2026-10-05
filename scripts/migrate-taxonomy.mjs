// Seeds the Category → Product Type taxonomy and moves existing products into it.
// Dry run by default. Use `--apply` to write changes.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@sanity/client';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const APPLY = process.argv.includes('--apply');
// `npx sanity exec scripts/migrate-taxonomy.mjs --with-user-token -- --apply` uses your Studio login.
const USE_CLI_AUTH = process.argv.includes('--use-cli-auth');
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const token = process.env.SANITY_API_TOKEN;

if (!projectId || (!token && !USE_CLI_AUTH)) {
  console.error('Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN in .env.local');
  process.exit(1);
}

const client = USE_CLI_AUTH
  ? (await import('sanity/cli')).getCliClient({ apiVersion: '2024-01-01' }).withConfig({ dataset, useCdn: false, perspective: 'raw' })
  : createClient({ projectId, dataset, token, apiVersion: '2024-01-01', useCdn: false, perspective: 'raw' });

const SHRINGAR_FACETS = ['deity', 'size', 'material', 'colour'];
const VASTRA_FACETS = ['deity', 'size', 'colour'];
const FRAGRANCE_FACETS = ['fragrance', 'volume'];
const ACCESSORY_FACETS = ['deity', 'material'];

const TAXONOMY = [
  {
    slug: 'deity-shringar', name: 'Deity Shringar', emoji: '👑',
    description: 'Mukut, mala, haar, shringar sets, earrings, payal and more for your Thakur Ji.',
    types: [
      { slug: 'mukut', name: 'Mukut', keywords: ['mukut', 'crown'], facets: SHRINGAR_FACETS },
      { slug: 'haar', name: 'Haar', keywords: ['haar', 'necklace'], facets: SHRINGAR_FACETS },
      { slug: 'mala', name: 'Mala', keywords: ['mala'], facets: SHRINGAR_FACETS },
      { slug: 'shringar-set', name: 'Shringar Set', keywords: ['shringar set', 'shringar'], facets: SHRINGAR_FACETS },
      { slug: 'earrings', name: 'Earrings / Kundal', keywords: ['earring', 'kundal'], facets: SHRINGAR_FACETS },
      { slug: 'payal', name: 'Payal', keywords: ['payal', 'anklet'], facets: SHRINGAR_FACETS },
      { slug: 'bansuri', name: 'Bansuri', keywords: ['bansuri', 'flute'], facets: SHRINGAR_FACETS },
    ],
  },
  {
    slug: 'poshak-vastra', name: 'Poshak & Vastra', emoji: '👗',
    description: 'Poshak, dresses, pagdi and patka for deities.',
    types: [
      { slug: 'poshak', name: 'Poshak / Dress', keywords: ['poshak', 'dress', 'vastra'], facets: VASTRA_FACETS },
      { slug: 'pagdi-patka', name: 'Pagdi & Patka', keywords: ['pagdi', 'patka'], facets: VASTRA_FACETS },
    ],
  },
  {
    slug: 'pooja-fragrances', name: 'Pooja Fragrances', emoji: '🪔',
    description: 'Attar, agarbatti, dhoop baati and sambrani for daily pooja.',
    types: [
      { slug: 'attar', name: 'Attar / Ittar', keywords: ['attar', 'ittar', 'itra', 'perfum'], facets: FRAGRANCE_FACETS },
      { slug: 'agarbatti', name: 'Agarbatti / Incense Sticks', keywords: ['agarbatti', 'incense'], facets: FRAGRANCE_FACETS },
      { slug: 'dhoop-baati', name: 'Dhoop Baati', keywords: ['dhoop baati', 'dhoop batti', 'dhoop'], facets: FRAGRANCE_FACETS },
      { slug: 'dhoop-cone', name: 'Dhoop Cone', keywords: ['cone'], facets: FRAGRANCE_FACETS },
      { slug: 'sambrani', name: 'Sambrani', keywords: ['sambrani'], facets: FRAGRANCE_FACETS },
    ],
  },
  {
    slug: 'pooja-accessories', name: 'Pooja Accessories', emoji: '🛕',
    description: 'Singhasan, jhula and other pooja accessories.',
    types: [
      { slug: 'singhasan', name: 'Singhasan', keywords: ['singhasan', 'throne'], facets: ACCESSORY_FACETS },
      { slug: 'jhula', name: 'Jhula', keywords: ['jhula', 'swing'], facets: ACCESSORY_FACETS },
    ],
  },
];

const slugify = (v) => v.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const publishedId = (id) => id.replace(/^drafts\./, '');
const ref = (id) => ({ _type: 'reference', _ref: id });

const data = await client.fetch(`{
  "categories": *[_type == "category"]{_id, name, "slug": slug.current, image},
  "types": *[_type == "productType"]{_id, name, "slug": slug.current, "categoryId": category._ref},
  "deities": *[_type == "deity"]{_id, name, "slug": slug.current},
  "products": *[_type == "product"]{_id, name, "categoryId": category._ref, "typeId": productType._ref}
}`);

const tx = client.transaction();
const log = [];
const categoryIdBySlug = new Map();
const typeById = new Map();
const keywordIndex = [];

// 1. Categories
TAXONOMY.forEach((cat, i) => {
  const existing = data.categories.find((c) => !c._id.startsWith('drafts.') && c.slug === cat.slug);
  const id = existing?._id ?? `category-${cat.slug}`;
  categoryIdBySlug.set(cat.slug, id);
  if (!existing) {
    tx.createIfNotExists({
      _id: id, _type: 'category', name: cat.name, slug: { _type: 'slug', current: cat.slug },
      description: cat.description, emoji: cat.emoji, displayOrder: (i + 1) * 10,
      isActive: false, isFeatured: false,
    });
    log.push(`+ category  ${cat.name} (${id})`);
  }
});

// 2. Product types (reuse existing ones by name, fixing slug + parent category)
TAXONOMY.forEach((cat) => {
  cat.types.forEach((type, j) => {
    const existing = data.types.find(
      (t) => !t._id.startsWith('drafts.') && (t.slug === type.slug || slugify(t.name) === type.slug || slugify(t.name) === slugify(type.name)),
    );
    const id = existing?._id ?? `productType-${type.slug}`;
    const categoryId = categoryIdBySlug.get(cat.slug);
    typeById.set(id, { ...type, categoryId, categorySlug: cat.slug });
    keywordIndex.push({ id, keywords: type.keywords });
    if (existing) {
      tx.patch(id, (p) =>
        p.set({ slug: { _type: 'slug', current: type.slug }, category: ref(categoryId) })
          .setIfMissing({ appliesFacets: type.facets, isActive: true, showInMenu: true }),
      );
      log.push(`~ type      ${existing.name}: slug "${existing.slug}" → "${type.slug}", category → ${cat.name}`);
    } else {
      tx.createIfNotExists({
        _id: id, _type: 'productType', name: type.name, slug: { _type: 'slug', current: type.slug },
        category: ref(categoryId), appliesFacets: type.facets, isActive: true, showInMenu: true,
        displayOrder: (j + 1) * 10,
      });
      log.push(`+ type      ${cat.name} › ${type.name}`);
    }
  });
});

// 3. Products → type (existing or keyword match) → category
const unmatched = [];
const movedFrom = new Map();
const activeCategorySlugs = new Set();

for (const product of data.products) {
  let typeId = product.typeId && typeById.has(product.typeId) ? product.typeId : null;
  if (!typeId) {
    const name = (product.name || '').toLowerCase();
    typeId = keywordIndex.find((k) => k.keywords.some((kw) => name.includes(kw)))?.id ?? null;
  }
  if (!typeId) {
    unmatched.push(product);
    continue;
  }
  const type = typeById.get(typeId);
  if (product.typeId === typeId && product.categoryId === type.categoryId) continue;

  tx.patch(product._id, (p) => p.set({ productType: ref(typeId), category: ref(type.categoryId) }));
  log.push(`~ product   "${product.name}"${product._id.startsWith('drafts.') ? ' (draft)' : ''} → ${type.categorySlug} › ${type.slug}`);

  if (!product._id.startsWith('drafts.')) activeCategorySlugs.add(type.categorySlug);
  if (product.categoryId) movedFrom.set(type.categoryId, movedFrom.get(type.categoryId) ?? product.categoryId);
}

// 4. Activate seeded categories that now have products; borrow an image from the old category
for (const [slug, id] of categoryIdBySlug) {
  if (!activeCategorySlugs.has(slug)) continue;
  const current = data.categories.find((c) => c._id === id);
  const oldImage = data.categories.find((c) => c._id === movedFrom.get(id))?.image;
  const patch = { isActive: true, isFeatured: true };
  if (!current?.image && oldImage) patch.image = oldImage;
  tx.patch(id, (p) => p.set(patch));
  log.push(`~ category  ${slug}: activate + show on homepage${patch.image ? ' (image copied from old category)' : ''}`);
}

// 5. Hide old categories that no longer have any products
const seededIds = new Set(categoryIdBySlug.values());
const stillReferenced = new Set(
  data.products
    .filter((p) => unmatched.includes(p))
    .map((p) => p.categoryId)
    .filter(Boolean),
);
for (const cat of data.categories) {
  if (seededIds.has(publishedId(cat._id)) || stillReferenced.has(publishedId(cat._id))) continue;
  tx.patch(cat._id, (p) => p.set({ isActive: false, isFeatured: false }));
  log.push(`~ category  "${cat.name}" (old) → hidden (not deleted)`);
}

// 6. Fix malformed deity slugs
for (const deity of data.deities) {
  const clean = slugify(deity.slug || deity.name);
  if (clean && clean !== deity.slug) {
    tx.patch(deity._id, (p) => p.set({ slug: { _type: 'slug', current: clean } }));
    log.push(`~ deity     ${deity.name}: slug "${deity.slug}" → "${clean}"`);
  }
}

console.log(`\nDataset: ${projectId}/${dataset}  Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
log.forEach((l) => console.log(l));
if (unmatched.length) {
  console.log('\nNeeds manual assignment in Studio (no matching type found):');
  unmatched.forEach((p) => console.log(`  - "${p.name}" (${p._id})`));
}

if (APPLY) {
  const res = await tx.commit({ autoGenerateArrayKeys: true });
  console.log(`\nCommitted transaction ${res.transactionId} (${log.length} changes).`);
} else {
  console.log('\nNo changes written. Re-run with --apply to commit.');
}
