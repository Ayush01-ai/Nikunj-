import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@sanity/client';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { file: '', dryRun: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--help' || item === '-h') args.help = true;
    else if (item === '--dry-run') args.dryRun = true;
    else if (item === '--file' && argv[i + 1]) {
      args.file = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((v) => v.trim());
}

function parseCsv(content) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y'].includes(normalized);
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugObject(value) {
  return { _type: 'slug', current: String(value).trim() };
}

function portableTextFromPlainText(value) {
  if (!value) return [];
  return [
    {
      _type: 'block',
      style: 'normal',
      children: [
        {
          _type: 'span',
          text: String(value),
        },
      ],
      markDefs: [],
    },
  ];
}

async function uploadImageFromUrl(client, url, dryRun) {
  if (!url) return null;
  if (dryRun) {
    return {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: 'dryrun-image-asset',
      },
    };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}) for URL: ${url}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename = path.basename(new URL(url).pathname) || 'image.jpg';

  const asset = await client.assets.upload('image', buffer, {
    filename,
    contentType,
  });

  return {
    _type: 'image',
    asset: {
      _type: 'reference',
      _ref: asset._id,
    },
  };
}

async function getSlugMap(client, typeName) {
  const docs = await client.fetch(
    `*[_type == $type && defined(slug.current)]{_id, "slug": slug.current}`,
    { type: typeName },
  );

  const map = new Map();
  for (const doc of docs) map.set(doc.slug, doc._id);
  return map;
}

function usage() {
  console.log('Usage: npm run import:products -- --file ./path/to/products.csv [--dry-run]');
}

async function run() {
  loadEnvLocal();
  const args = parseArgs(process.argv);

  if (args.help || !args.file) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;

  if (!projectId) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is missing in env');
  if (!token) throw new Error('SANITY_API_TOKEN is missing in env');

  const client = createClient({
    projectId,
    dataset,
    token,
    useCdn: false,
    apiVersion: '2025-01-01',
  });

  const filePath = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
  if (!fs.existsSync(filePath)) throw new Error(`CSV file not found: ${filePath}`);

  const csv = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(csv);
  if (rows.length === 0) throw new Error('CSV has no data rows');

  const [categoryMap, deityMap, productTypeMap, fragranceMap] = await Promise.all([
    getSlugMap(client, 'category'),
    getSlugMap(client, 'deity'),
    getSlugMap(client, 'productType'),
    getSlugMap(client, 'fragrance'),
  ]);

  let createdOrUpdated = 0;
  let failed = 0;

  for (const row of rows) {
    const name = row.name?.trim();
    const slug = row.slug?.trim();
    const categorySlug = row.categorySlug?.trim();

    if (!name || !slug || !categorySlug) {
      console.error(`Skipping row: name/slug/categorySlug required. Row name="${name || ''}"`);
      failed += 1;
      continue;
    }

    const categoryId = categoryMap.get(categorySlug);
    if (!categoryId) {
      console.error(`Skipping ${slug}: category slug not found -> ${categorySlug}`);
      failed += 1;
      continue;
    }

    const deityId = row.deitySlug ? deityMap.get(row.deitySlug.trim()) : undefined;
    const productTypeId = row.productTypeSlug ? productTypeMap.get(row.productTypeSlug.trim()) : undefined;
    const fragranceId = row.fragranceSlug ? fragranceMap.get(row.fragranceSlug.trim()) : undefined;

    try {
      const mainImage = await uploadImageFromUrl(client, row.mainImageUrl?.trim(), args.dryRun);

      const galleryUrls = String(row.galleryImageUrls || '')
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean);

      const galleryImages = [];
      for (const imgUrl of galleryUrls) {
        const img = await uploadImageFromUrl(client, imgUrl, args.dryRun);
        if (img) galleryImages.push(img);
      }

      const doc = {
        _id: `product.${slug}`,
        _type: 'product',
        name,
        slug: slugObject(slug),
        shortDescription: row.shortDescription || '',
        longDescription: portableTextFromPlainText(row.longDescription || ''),
        sku: row.sku || `SKU-${slug.toUpperCase()}`,
        price: toNumber(row.price, 0),
        salePrice: row.salePrice ? toNumber(row.salePrice, 0) : undefined,
        stockQuantity: toNumber(row.stockQuantity, 0),
        inStock: toBool(row.inStock, true),
        mainImage,
        galleryImages,
        category: { _type: 'reference', _ref: categoryId },
        deity: deityId ? { _type: 'reference', _ref: deityId } : undefined,
        productType: productTypeId ? { _type: 'reference', _ref: productTypeId } : undefined,
        fragrance: fragranceId ? { _type: 'reference', _ref: fragranceId } : undefined,
        isFeatured: toBool(row.isFeatured, false),
        isBestseller: toBool(row.isBestseller, false),
        isNewArrival: toBool(row.isNewArrival, false),
        isPremium: toBool(row.isPremium, false),
        sortOrder: toNumber(row.sortOrder, 0),
        isActive: toBool(row.isActive, true),
        seoTitle: row.seoTitle || undefined,
        seoDescription: row.seoDescription || undefined,
      };

      if (!args.dryRun) {
        await client.createOrReplace(doc);
      }

      createdOrUpdated += 1;
      console.log(`${args.dryRun ? '[DRY RUN] ' : ''}Upserted ${doc._id}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed row for slug ${slug}: ${error.message || error}`);
    }
  }

  console.log('\nImport summary');
  console.log(`Processed: ${rows.length}`);
  console.log(`Success: ${createdOrUpdated}`);
  console.log(`Failed: ${failed}`);
}

run().catch((error) => {
  console.error(`Import failed: ${error.message || error}`);
  process.exit(1);
});
