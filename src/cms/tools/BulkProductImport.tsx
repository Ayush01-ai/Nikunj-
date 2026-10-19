import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from 'sanity';
import { Badge, Box, Button, Card, Checkbox, Flex, Heading, Radio, Spinner, Stack, Text } from '@sanity/ui';
import { DownloadIcon } from '@sanity/icons/Download';
import { UploadIcon } from '@sanity/icons/Upload';

const loadSheets = () => import('./spreadsheet');

interface RefDoc {
  _id: string;
  _type: 'category' | 'productType' | 'deity' | 'fragrance';
  name?: string;
  slug?: string;
  category?: string;
}

interface ExistingProduct {
  _id: string;
  slug?: string;
}

// Column order of the template. `*` = required.
const COLUMNS: { key: string; header: string; help: string; example: string | number }[] = [
  { key: 'name', header: 'Name*', help: 'Product name, 3–120 characters.', example: 'Shringar Mukut — Peacock Feather' },
  { key: 'slug', header: 'Slug', help: 'URL name. Leave empty to generate from Name. Same slug as an existing product = update.', example: '' },
  { key: 'category', header: 'Category*', help: 'Category name or slug — see the "Lists" sheet.', example: '' },
  { key: 'productType', header: 'Product Type*', help: 'Product type name or slug in that category — see "Lists".', example: '' },
  { key: 'deity', header: 'Deity', help: 'Optional deity name or slug — see "Lists".', example: '' },
  { key: 'fragrance', header: 'Fragrance', help: 'Optional fragrance name or slug — see "Lists".', example: '' },
  { key: 'shortDescription', header: 'Short Description*', help: '10–220 characters. Shown on product cards.', example: 'Handcrafted peacock-feather mukut with kundan work for Laddu Gopal ji.' },
  { key: 'longDescription', header: 'Long Description', help: 'Plain text. Each new line becomes a paragraph.', example: 'Made by hand in Vrindavan.\nPerfect for daily shringar and festivals.' },
  { key: 'sku', header: 'SKU', help: 'Optional, max 40 characters.', example: 'MUK-PEA-01' },
  { key: 'price', header: 'Price*', help: 'Regular price (MRP) in ₹, numbers only.', example: 599 },
  { key: 'salePrice', header: 'Sale Price', help: 'Optional discounted price, must be lower than Price.', example: 449 },
  { key: 'stockQuantity', header: 'Stock*', help: 'Whole number of pieces in stock.', example: 25 },
  { key: 'inStock', header: 'In Stock', help: 'yes / no. Default: yes when Stock > 0.', example: 'yes' },
  { key: 'mainImage', header: 'Main Image*', help: 'Image URL (https://…) OR the file name of an image you select in the "Images" picker.', example: 'mukut-peacock.jpg' },
  { key: 'mainImageAlt', header: 'Main Image Alt', help: 'Short image description for accessibility. Default: product name.', example: '' },
  { key: 'gallery', header: 'Gallery Images', help: 'More images, separated by | (URLs or file names).', example: 'mukut-side.jpg | mukut-back.jpg' },
  { key: 'variants', header: 'Variants', help: 'Size / volume options separated by |. Each: Label;Price;MRP;Stock (MRP and Stock optional).', example: 'Size 0;449;599;10 | Size 1;549;699;8' },
  { key: 'colours', header: 'Colours', help: 'Colour options separated by |. Each: Colour;Price;MRP;Hex;Image (all but Colour optional).', example: 'Red;;;#C62828;mukut-red.jpg | Green;499;649;#2E7D32;mukut-green.jpg' },
  { key: 'material', header: 'Material', help: 'e.g. Brass, Kundan, Velvet.', example: 'Kundan, brass' },
  { key: 'specifications', header: 'Specifications', help: 'Key: Value pairs separated by |.', example: 'Height: 3 inch | Weight: 40 g' },
  { key: 'careInstructions', header: 'Care Instructions', help: 'Optional text. Empty = site default.', example: '' },
  { key: 'returnPolicy', header: 'Return Policy', help: 'Optional text. Empty = site default.', example: '' },
  { key: 'isFeatured', header: 'Featured', help: 'yes / no', example: 'no' },
  { key: 'isBestseller', header: 'Best Seller', help: 'yes / no', example: 'no' },
  { key: 'isNewArrival', header: 'New Arrival', help: 'yes / no (default yes)', example: 'yes' },
  { key: 'isPremium', header: 'Premium', help: 'yes / no', example: 'no' },
  { key: 'sortOrder', header: 'Sort Order', help: 'Whole number ≥ 0; lower shows first. Default 0.', example: 0 },
  { key: 'isActive', header: 'Active', help: 'yes / no (default yes). "no" hides it from the website.', example: 'yes' },
  { key: 'seoTitle', header: 'SEO Title', help: 'Optional, max 60 characters.', example: '' },
  { key: 'seoDescription', header: 'SEO Description', help: 'Optional, max 160 characters.', example: '' },
];

const norm = (s: unknown) => String(s ?? '').trim();
const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_TO_KEY = new Map(COLUMNS.flatMap((c) => [[keyOf(c.header), c.key], [keyOf(c.key), c.key]]));
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
const randomKey = () => Math.random().toString(36).slice(2, 12);
const num = (v: string) => (v === '' ? undefined : Number(v.replace(/[₹,\s]/g, '')));
const yes = (v: string, fallback: boolean) => (v === '' ? fallback : /^(y|yes|true|1|haan|ha)$/i.test(v));
const list = (v: string) => v.split('|').map((x) => x.trim()).filter(Boolean);

interface ParsedRow {
  row: number;
  name: string;
  slug: string;
  existingId?: string;
  errors: string[];
  warnings: string[];
  images: string[];
  build: (img: (ref: string) => { _type: 'image'; asset: { _type: 'reference'; _ref: string } }) => Record<string, unknown>;
}

type RowState = 'pending' | 'done' | 'failed' | 'skipped';

export function BulkProductImport() {
  const client = useClient({ apiVersion: '2024-01-01' });
  const [refs, setRefs] = useState<RefDoc[] | null>(null);
  const [existing, setExisting] = useState<ExistingProduct[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [localImages, setLocalImages] = useState<Map<string, File>>(new Map());
  const [publish, setPublish] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Record<number, { state: RowState; message?: string }>>({});
  const [message, setMessage] = useState('');
  const rawRef = useRef<Record<string, unknown>[]>([]);

  useEffect(() => {
    void (async () => {
      const [r, p] = await Promise.all([
        client.fetch<RefDoc[]>(
          `*[_type in ["category","productType","deity","fragrance"] && !(_id in path("drafts.**"))]{_id, _type, name, "slug": slug.current, "category": category._ref} | order(_type asc, name asc)`,
        ),
        client.fetch<ExistingProduct[]>(`*[_type == "product" && !(_id in path("drafts.**"))]{_id, "slug": slug.current}`),
      ]);
      setRefs(r);
      setExisting(p);
    })().catch((e) => setMessage(e instanceof Error ? e.message : 'Could not load categories'));
  }, [client]);

  const findRef = useCallback(
    (type: RefDoc['_type'], value: string, categoryId?: string) => {
      const v = value.trim().toLowerCase();
      if (!v || !refs) return undefined;
      const pool = refs.filter((r) => r._type === type && (!categoryId || r.category === categoryId));
      return pool.find((r) => r.slug?.toLowerCase() === v) ?? pool.find((r) => r.name?.trim().toLowerCase() === v);
    },
    [refs],
  );

  const parseRows = useCallback(
    (raw: Record<string, unknown>[], images: Map<string, File>) => {
      const bySlug = new Map(existing.map((p) => [p.slug, p._id]));
      const seen = new Set<string>();
      const isImageRef = (v: string) => /^https?:\/\//i.test(v) || images.has(v.toLowerCase());

      return raw
        .map((source, i): ParsedRow | null => {
          const r: Record<string, string> = {};
          for (const [h, v] of Object.entries(source)) {
            const key = HEADER_TO_KEY.get(keyOf(h));
            if (key) r[key] = norm(v);
          }
          if (Object.values(r).every((v) => v === '')) return null;

          const errors: string[] = [];
          const warnings: string[] = [];
          const row = i + 2;
          const name = r.name ?? '';
          if (name.length < 3 || name.length > 120) errors.push('Name must be 3–120 characters');
          const slug = slugify(r.slug || name);
          if (!slug) errors.push('Slug could not be generated');
          if (seen.has(slug)) errors.push(`Duplicate slug "${slug}" in this file`);
          seen.add(slug);
          const existingId = bySlug.get(slug);
          if (existingId && !updateExisting) warnings.push('Already exists — will be skipped');

          const category = findRef('category', r.category ?? '');
          if (!category) errors.push(`Unknown category "${r.category ?? ''}"`);
          const productType = findRef('productType', r.productType ?? '', category?._id);
          if (!productType) errors.push(`Unknown product type "${r.productType ?? ''}"${category ? ` in ${category.name}` : ''}`);
          const deity = r.deity ? findRef('deity', r.deity) : undefined;
          if (r.deity && !deity) errors.push(`Unknown deity "${r.deity}"`);
          const fragrance = r.fragrance ? findRef('fragrance', r.fragrance) : undefined;
          if (r.fragrance && !fragrance) errors.push(`Unknown fragrance "${r.fragrance}"`);

          const short = r.shortDescription ?? '';
          if (short.length < 10 || short.length > 220) errors.push('Short Description must be 10–220 characters');
          const price = num(r.price ?? '');
          if (price === undefined || Number.isNaN(price) || price < 0) errors.push('Price must be a number');
          const salePrice = num(r.salePrice ?? '');
          if (salePrice !== undefined && (Number.isNaN(salePrice) || (price !== undefined && salePrice >= price))) errors.push('Sale Price must be lower than Price');
          const stock = num(r.stockQuantity ?? '');
          if (stock === undefined || !Number.isInteger(stock) || stock < 0) errors.push('Stock must be a whole number ≥ 0');
          const sortOrder = num(r.sortOrder ?? '') ?? 0;
          if (!Number.isInteger(sortOrder) || sortOrder < 0) errors.push('Sort Order must be a whole number ≥ 0');
          if ((r.sku ?? '').length > 40) errors.push('SKU max 40 characters');
          if ((r.seoTitle ?? '').length > 60) errors.push('SEO Title max 60 characters');
          if ((r.seoDescription ?? '').length > 160) errors.push('SEO Description max 160 characters');

          const mainImage = r.mainImage ?? '';
          if (!mainImage) errors.push('Main Image is required');
          else if (!isImageRef(mainImage)) errors.push(`Main image "${mainImage}" is not a URL or a selected file`);
          const gallery = list(r.gallery ?? '');
          for (const g of gallery) if (!isImageRef(g)) errors.push(`Gallery image "${g}" is not a URL or a selected file`);

          const variants = list(r.variants ?? '').map((entry) => {
            const [label = '', p = '', m = '', s = ''] = entry.split(';').map((x) => x.trim());
            const v = { label, price: num(p), mrp: num(m), stock: num(s) };
            if (!label) errors.push(`Variant "${entry}" needs a label`);
            if (v.price !== undefined && (Number.isNaN(v.price) || v.price < 1)) errors.push(`Variant "${label}" price is invalid`);
            if (v.mrp !== undefined && v.price !== undefined && v.mrp <= v.price) errors.push(`Variant "${label}" MRP must be higher than its price`);
            if (v.stock !== undefined && (!Number.isInteger(v.stock) || v.stock < 0)) errors.push(`Variant "${label}" stock is invalid`);
            return v;
          });
          if (new Set(variants.map((v) => v.label.toLowerCase())).size !== variants.length) errors.push('Variant labels must be unique');

          const colours = list(r.colours ?? '').map((entry) => {
            const parts = entry.split(';').map((x) => x.trim());
            const [label = '', p = '', m = '', hex = ''] = parts;
            const image = parts.slice(4).join(';').trim();
            const c = { label, price: num(p), mrp: num(m), hex, image };
            if (!label) errors.push(`Colour "${entry}" needs a name`);
            if (c.price !== undefined && (Number.isNaN(c.price) || c.price < 1)) errors.push(`Colour "${label}" price is invalid`);
            if (c.mrp !== undefined && c.price !== undefined && c.mrp <= c.price) errors.push(`Colour "${label}" MRP must be higher than its price`);
            if (image && !isImageRef(image)) errors.push(`Colour "${label}" image is not a URL or a selected file`);
            if (!image) warnings.push(`Colour "${label}" has no image`);
            return c;
          });

          const specs = list(r.specifications ?? '').map((entry) => {
            const at = entry.indexOf(':');
            return at > 0 ? { key: entry.slice(0, at).trim(), value: entry.slice(at + 1).trim() } : { key: entry, value: '' };
          });

          const images = [mainImage, ...gallery, ...colours.map((c) => c.image)].filter(Boolean);
          const longText = r.longDescription ?? '';

          const build: ParsedRow['build'] = (img) => {
            const doc: Record<string, unknown> = {
              _type: 'product',
              name,
              slug: { _type: 'slug', current: slug },
              category: { _type: 'reference', _ref: category?._id },
              productType: { _type: 'reference', _ref: productType?._id },
              shortDescription: short,
              price,
              stockQuantity: stock,
              inStock: yes(r.inStock ?? '', (stock ?? 0) > 0),
              mainImage: { ...img(mainImage), alt: r.mainImageAlt || name },
              isFeatured: yes(r.isFeatured ?? '', false),
              isBestseller: yes(r.isBestseller ?? '', false),
              isNewArrival: yes(r.isNewArrival ?? '', true),
              isPremium: yes(r.isPremium ?? '', false),
              sortOrder,
              isActive: yes(r.isActive ?? '', true),
            };
            if (salePrice !== undefined) doc.salePrice = salePrice;
            if (r.sku) doc.sku = r.sku;
            if (deity) doc.deity = { _type: 'reference', _ref: deity._id };
            if (fragrance) doc.fragrance = { _type: 'reference', _ref: fragrance._id };
            if (r.material) doc.material = r.material;
            if (r.careInstructions) doc.careInstructions = r.careInstructions;
            if (r.returnPolicy) doc.returnPolicy = r.returnPolicy;
            if (r.seoTitle) doc.seoTitle = r.seoTitle;
            if (r.seoDescription) doc.seoDescription = r.seoDescription;
            if (longText) {
              doc.longDescription = longText
                .split(/\r?\n/)
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => ({
                  _type: 'block',
                  _key: randomKey(),
                  style: 'normal',
                  markDefs: [],
                  children: [{ _type: 'span', _key: randomKey(), text: t, marks: [] }],
                }));
            }
            if (gallery.length) doc.galleryImages = gallery.map((g) => ({ _key: randomKey(), ...img(g), alt: name }));
            if (variants.length) {
              doc.sizes = variants.map((v) => ({
                _key: randomKey(),
                label: v.label,
                ...(v.price !== undefined && { price: v.price }),
                ...(v.mrp !== undefined && { mrp: v.mrp }),
                ...(v.stock !== undefined && { stock: v.stock }),
                priceModifier: 0,
              }));
            }
            if (colours.length) {
              doc.colors = colours.map((c) => ({
                _key: randomKey(),
                label: c.label,
                ...(c.image && { image: { ...img(c.image), alt: `${name} — ${c.label}` } }),
                ...(c.price !== undefined && { price: c.price }),
                ...(c.mrp !== undefined && { mrp: c.mrp }),
                ...(c.hex && { hex: c.hex }),
              }));
            }
            if (specs.length) doc.specifications = specs.map((s) => ({ _key: randomKey(), ...s }));
            return doc;
          };

          return { row, name, slug, existingId, errors, warnings, images, build };
        })
        .filter((r): r is ParsedRow => r !== null);
    },
    [existing, findRef, updateExisting],
  );

  // Re-validate when options / images / reference data change.
  useEffect(() => {
    if (rawRef.current.length) setRows(parseRows(rawRef.current, localImages));
  }, [parseRows, localImages]);

  const onFile = async (file?: File) => {
    if (!file) return;
    setMessage('');
    setProgress({});
    try {
      const { readProductRows } = await loadSheets();
      const raw = await readProductRows(await file.arrayBuffer());
      rawRef.current = raw;
      setFileName(file.name);
      setRows(parseRows(raw, localImages));
      if (!raw.length) setMessage('The sheet has no product rows.');
    } catch (e) {
      setMessage(`Could not read the file: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const onImages = (files: FileList | null) => {
    const next = new Map(localImages);
    for (const f of Array.from(files ?? [])) next.set(f.name.toLowerCase(), f);
    setLocalImages(next);
  };

  const downloadTemplate = async () => {
    const { buildWorkbook } = await loadSheets();
    const cats = (refs ?? []).filter((r) => r._type === 'category');
    const types = (refs ?? []).filter((r) => r._type === 'productType');
    const example = COLUMNS.map((c) => {
      if (c.key === 'category') return cats[0]?.name ?? '';
      if (c.key === 'productType') return types.find((t) => t.category === cats[0]?._id)?.name ?? '';
      return c.example;
    });
    const productsRows = [COLUMNS.map((c) => c.header), example];

    const helpRows = [
      ['Column', 'Required', 'How to fill'],
      ...COLUMNS.map((c) => [c.header.replace('*', ''), c.header.endsWith('*') ? 'Yes' : '', c.help]),
      [],
      ['Tips'],
      ['• Keep the header row exactly as is. Delete the example row before importing.'],
      ['• Images: paste public https:// links, or type the file name (e.g. mukut.jpg) and select those files in the "Images" picker before importing.'],
      ['• Use | to separate multiple values, and ; between the parts of one variant / colour.'],
      ['• A row whose slug matches an existing product updates that product (if "Update existing" is ticked).'],
    ];

    const catName = (id?: string) => cats.find((c) => c._id === id)?.name ?? '';
    const listsRows = [
      ['Category', 'Product Type', '', 'Deity', '', 'Fragrance'],
      ...Array.from({ length: Math.max(types.length, 1) }, (_, i) => [
        catName(types[i]?.category),
        types[i]?.name ?? '',
        '',
        (refs ?? []).filter((r) => r._type === 'deity')[i]?.name ?? '',
        '',
        (refs ?? []).filter((r) => r._type === 'fragrance')[i]?.name ?? '',
      ]),
    ];

    const bytes = await buildWorkbook([
      { name: 'Products', rows: productsRows, widths: COLUMNS.map((c) => Math.max(14, Math.min(40, c.header.length + 6))) },
      { name: 'Instructions', rows: helpRows, widths: [22, 10, 110] },
      { name: 'Lists', rows: listsRows, widths: [26, 28, 2, 22, 2, 22] },
    ]);
    const url = URL.createObjectURL(
      new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nikunj-sakhi-product-import-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const valid = rows.filter((r) => r.errors.length === 0 && !(r.existingId && !updateExisting));
  const invalidCount = rows.filter((r) => r.errors.length > 0).length;

  const runImport = async () => {
    setBusy(true);
    setMessage('');
    const assetCache = new Map<string, string>();
    const uploadImage = async (ref: string) => {
      const k = ref.toLowerCase();
      const cached = assetCache.get(k);
      if (cached) return cached;
      let blob: Blob;
      let filename = ref.split('/').pop()?.split('?')[0] || 'image.jpg';
      const local = localImages.get(k);
      if (local) {
        blob = local;
        filename = local.name;
      } else {
        const res = await fetch(ref).catch(() => null);
        if (!res?.ok) throw new Error(`Could not download ${ref} — select the file in the Images picker instead`);
        blob = await res.blob();
      }
      const asset = await client.assets.upload('image', blob, { filename });
      assetCache.set(k, asset._id);
      return asset._id;
    };

    let ok = 0;
    for (const r of rows) {
      if (r.errors.length || (r.existingId && !updateExisting)) {
        setProgress((p) => ({ ...p, [r.row]: { state: 'skipped' } }));
        continue;
      }
      setProgress((p) => ({ ...p, [r.row]: { state: 'pending' } }));
      try {
        const ids = new Map<string, string>();
        for (const img of r.images) ids.set(img.toLowerCase(), await uploadImage(img));
        const doc = r.build((ref) => ({ _type: 'image', asset: { _type: 'reference', _ref: ids.get(ref.toLowerCase())! } }));
        const baseId = r.existingId ?? `product-${r.slug}`.slice(0, 120);
        const id = publish ? baseId : `drafts.${baseId}`;
        if (r.existingId) {
          const { _type, ...fields } = doc as { _type: string } & Record<string, unknown>;
          await client.transaction().createIfNotExists({ _id: id, _type }).patch(id, (p) => p.set(fields)).commit();
        } else {
          await client.createOrReplace({ _id: id, ...doc } as { _id: string; _type: string });
        }
        ok += 1;
        setProgress((p) => ({ ...p, [r.row]: { state: 'done' } }));
      } catch (e) {
        setProgress((p) => ({ ...p, [r.row]: { state: 'failed', message: e instanceof Error ? e.message : 'Failed' } }));
      }
    }
    setBusy(false);
    setMessage(`Imported ${ok} of ${valid.length} product(s)${publish ? ' (published)' : ' as drafts'}.`);
    const p = await client.fetch<ExistingProduct[]>(`*[_type == "product" && !(_id in path("drafts.**"))]{_id, "slug": slug.current}`);
    setExisting(p);
  };

  const doneCount = useMemo(() => Object.values(progress).filter((p) => p.state === 'done' || p.state === 'failed').length, [progress]);

  return (
    <Box padding={[3, 4, 5]} style={{ height: '100%', overflow: 'auto' }}>
      <Stack gap={5} style={{ maxWidth: 1100 }}>
        <Stack gap={3}>
          <Heading size={3}>📥 Bulk Product Import (Excel)</Heading>
          <Text size={1} muted>
            Add or update many products at once. 1) Download the template, 2) fill one row per product, 3) upload it here, check the preview and import.
          </Text>
        </Stack>

        <Card padding={4} radius={3} border tone="primary">
          <Flex gap={3} wrap="wrap" align="center">
            <Button icon={DownloadIcon} text="Download Excel template" tone="primary" onClick={() => void downloadTemplate()} disabled={!refs} />
            <Text size={1} muted>
              Includes an Instructions sheet and a Lists sheet with your current categories, product types, deities and fragrances.
            </Text>
          </Flex>
        </Card>

        <Card padding={4} radius={3} border>
          <Stack gap={4}>
            <Flex gap={3} wrap="wrap" align="center">
              <label>
                <input type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={(e) => void onFile(e.currentTarget.files?.[0])} />
                <Button as="span" icon={UploadIcon} text={fileName ? `File: ${fileName}` : 'Choose Excel / CSV file'} mode="ghost" />
              </label>
              <label>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => onImages(e.currentTarget.files)} />
                <Button as="span" icon={UploadIcon} text={`Images (${localImages.size} selected)`} mode="ghost" />
              </label>
              {!refs && <Spinner muted />}
            </Flex>
            <Flex gap={5} wrap="wrap">
              <Flex as="label" gap={2} align="center">
                <Radio checked={publish} onChange={() => setPublish(true)} />
                <Text size={1}>Publish immediately (live on website)</Text>
              </Flex>
              <Flex as="label" gap={2} align="center">
                <Radio checked={!publish} onChange={() => setPublish(false)} />
                <Text size={1}>Import as drafts (review before publishing)</Text>
              </Flex>
              <Flex as="label" gap={2} align="center">
                <Checkbox checked={updateExisting} onChange={(e) => setUpdateExisting(e.currentTarget.checked)} />
                <Text size={1}>Update existing products with the same slug</Text>
              </Flex>
            </Flex>
          </Stack>
        </Card>

        {message && (
          <Card padding={3} radius={2} border tone={message.startsWith('Imported') ? 'positive' : 'caution'}>
            <Text size={1}>{message}</Text>
          </Card>
        )}

        {rows.length > 0 && (
          <Stack gap={3}>
            <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
              <Flex gap={2} wrap="wrap">
                <Badge tone="positive">{valid.length} ready</Badge>
                {invalidCount > 0 && <Badge tone="critical">{invalidCount} with errors (skipped)</Badge>}
                <Badge>{rows.filter((r) => r.existingId).length} existing</Badge>
              </Flex>
              <Flex gap={3} align="center">
                {busy && (
                  <Text size={1} muted>
                    {doneCount} / {valid.length}
                  </Text>
                )}
                <Button
                  text={busy ? 'Importing…' : `Import ${valid.length} product(s)`}
                  tone="positive"
                  disabled={busy || valid.length === 0}
                  onClick={() => void runImport()}
                />
              </Flex>
            </Flex>
            {busy && (
              <Box style={{ height: 6, background: 'var(--card-border-color)', borderRadius: 3, overflow: 'hidden' }}>
                <Box style={{ height: '100%', width: `${valid.length ? (doneCount / valid.length) * 100 : 0}%`, background: 'var(--card-focus-ring-color)', transition: 'width .3s' }} />
              </Box>
            )}
            <Stack gap={2}>
              {rows.map((r) => {
                const p = progress[r.row];
                const tone = p?.state === 'failed' || r.errors.length ? 'critical' : p?.state === 'done' ? 'positive' : r.warnings.length ? 'caution' : 'default';
                return (
                  <Card key={r.row} padding={3} radius={2} border tone={tone}>
                    <Stack gap={2}>
                      <Flex gap={2} align="center" wrap="wrap">
                        <Text size={1} muted>
                          Row {r.row}
                        </Text>
                        <Text size={1} weight="semibold">
                          {r.name || '(no name)'}
                        </Text>
                        <Text size={1} muted>
                          /{r.slug}
                        </Text>
                        {r.existingId && <Badge tone="primary">update</Badge>}
                        {p?.state === 'pending' && <Spinner muted />}
                        {p?.state === 'done' && <Badge tone="positive">imported</Badge>}
                        {p?.state === 'failed' && <Badge tone="critical">failed</Badge>}
                      </Flex>
                      {[...r.errors, ...(p?.message ? [p.message] : [])].map((e) => (
                        <Text key={e} size={1}>
                          ❌ {e}
                        </Text>
                      ))}
                      {r.warnings.map((w) => (
                        <Text key={w} size={1} muted>
                          ⚠️ {w}
                        </Text>
                      ))}
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
