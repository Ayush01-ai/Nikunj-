/* eslint-disable @next/next/no-img-element -- Studio thumbnails use Sanity CDN URLs directly. */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useClient } from 'sanity';
import { useRouter } from 'sanity/router';
import { Badge, Button, Card, Flex, Heading, Spinner, Stack, Text, TextInput } from '@sanity/ui';
import { useToast } from '@sanity/ui/toast';

interface CatalogVariant {
  _key?: string;
  label: string;
  sku?: string;
  price?: number;
  priceModifier?: number;
  stock?: number;
  weightGrams?: number;
}

interface CatalogProduct {
  _id: string;
  name: string;
  sku?: string;
  price: number;
  salePrice?: number;
  stockQuantity?: number;
  stock?: number;
  stockField: 'stockQuantity' | 'stock';
  inStock?: boolean;
  isActive?: boolean;
  weightGrams?: number;
  category?: string;
  imageUrl?: string;
  sizes?: CatalogVariant[];
}

interface CatalogRow {
  product: CatalogProduct;
  variant?: CatalogVariant;
  key: string;
  name: string;
  label?: string;
  sku?: string;
  price: number;
  stock: number;
  weightGrams?: number;
}

const CATALOG_QUERY = `*[_type == "product"] | order(name asc) {
  _id,
  name,
  sku,
  price,
  salePrice,
  stockQuantity,
  stock,
  "stockField": select(defined(stockQuantity) => "stockQuantity", defined(stock) => "stock", "stockQuantity"),
  inStock,
  isActive,
  weightGrams,
  "category": category->name,
  "imageUrl": coalesce(mainImage.asset->url, images[0].asset->url, galleryImages[0].asset->url),
  "sizes": sizes[]{_key, label, sku, price, priceModifier, stock, weightGrams}
}`;

function flattenProducts(products: CatalogProduct[]): CatalogRow[] {
  return products.flatMap((product) => {
    const variants = product.sizes?.filter((variant) => variant.label) ?? [];
    if (variants.length === 0) {
      return [{
        product,
        key: product._id,
        name: product.name,
        sku: product.sku,
        price: product.salePrice ?? product.price,
        stock: product.stockQuantity ?? product.stock ?? 0,
        weightGrams: product.weightGrams,
      }];
    }

    return variants.map((variant, index) => ({
      product,
      variant,
      key: `${product._id}:${variant._key ?? variant.label}:${index}`,
      name: product.name,
      label: variant.label,
      sku: variant.sku ?? product.sku,
      price: variant.price ?? (product.salePrice ?? product.price) + (variant.priceModifier ?? 0),
      stock: variant.stock ?? product.stockQuantity ?? product.stock ?? 0,
      weightGrams: variant.weightGrams ?? product.weightGrams,
    }));
  });
}

function variantPath(row: CatalogRow, field: string): string {
  if (!row.variant) return field;
  const selector = row.variant._key
    ? `_key==${JSON.stringify(row.variant._key)}`
    : `label==${JSON.stringify(row.variant.label)}`;
  return `sizes[${selector}].${field}`;
}

interface EditableFieldProps {
  value: number | undefined;
  label: string;
  min?: number;
  integer?: boolean;
  optional?: boolean;
  onInvalid: () => void;
  onSave: (value: number | undefined) => Promise<boolean>;
}

function EditableNumber({ value, label, min = 0, integer = false, optional = false, onInvalid, onSave }: EditableFieldProps) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [saving, setSaving] = useState(false);
  const skipBlurCommit = useRef(false);

  const commit = async () => {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false;
      return;
    }
    if (saving) return;
    const normalized = draft.trim();
    if (!normalized && optional) {
      if (value === undefined) return;
      setSaving(true);
      if (await onSave(undefined)) setDraft('');
      setSaving(false);
      return;
    }
    const next = Number(normalized);
    if (!normalized || !Number.isFinite(next) || next < min || (integer && !Number.isInteger(next))) {
      onInvalid();
      return;
    }
    if (next === value) return;

    setSaving(true);
    if (await onSave(next)) setDraft(String(next));
    setSaving(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      skipBlurCommit.current = true;
      setDraft(value === undefined ? '' : String(value));
      event.currentTarget.blur();
    }
  };

  return (
    <TextInput
      aria-label={label}
      type="number"
      min={min}
      step={integer ? 1 : 'any'}
      value={draft}
      disabled={saving}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => void commit()}
      onKeyDown={onKeyDown}
      style={{ width: 92 }}
    />
  );
}

interface EditableSkuProps {
  value?: string;
  label: string;
  onSave: (value: string) => Promise<boolean>;
}

function EditableSku({ value, label, onSave }: EditableSkuProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const skipBlurCommit = useRef(false);

  const commit = async () => {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false;
      return;
    }
    if (saving || draft === (value ?? '')) return;
    setSaving(true);
    if (await onSave(draft.trim())) setDraft(draft.trim());
    setSaving(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      skipBlurCommit.current = true;
      setDraft(value ?? '');
      event.currentTarget.blur();
    }
  };

  return (
    <TextInput
      aria-label={label}
      value={draft}
      placeholder="Product SKU"
      maxLength={40}
      disabled={saving}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => void commit()}
      onKeyDown={onKeyDown}
      style={{ width: 140 }}
    />
  );
}

export function CatalogDashboard() {
  const studioClient = useClient({ apiVersion: '2025-02-19' });
  const client = useMemo(() => studioClient.withConfig({ perspective: 'drafts' }), [studioClient]);
  const router = useRouter();
  const toast = useToast();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.fetch<CatalogProduct[]>(CATALOG_QUERY);
      setProducts(result);
    } catch (error) {
      toast.push({
        status: 'error',
        title: 'Could not load catalog',
        description: error instanceof Error ? error.message : 'Sanity returned an unknown error.',
      });
    } finally {
      setLoading(false);
    }
  }, [client, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return flattenProducts(products).filter((row) =>
      !term || [row.name, row.sku, row.label].some((value) => value?.toLocaleLowerCase().includes(term)),
    );
  }, [products, search]);

  const saveField = useCallback(async (
    row: CatalogRow,
    field: 'sku' | 'price' | 'stock' | 'weightGrams',
    value: string | number | undefined,
  ): Promise<boolean> => {
    const path = row.variant
      ? variantPath(row, field)
      : field === 'stock'
        ? row.product.stockField
        : field;
    try {
      let patch = client.patch(row.product._id);
      let productUpdate: Partial<CatalogProduct> | undefined;
      if (value === undefined || value === '') {
        patch = patch.unset([path]);
        if (!row.variant) {
          if (field === 'sku') productUpdate = { sku: undefined };
          else if (field === 'weightGrams') productUpdate = { weightGrams: undefined };
          else if (field === 'stock' && row.product.stockField === 'stock') productUpdate = { stock: undefined };
          else if (field === 'stock') productUpdate = { stockQuantity: undefined };
        }
      } else if (field === 'price' && !row.variant && typeof value === 'number' && row.product.salePrice !== undefined) {
        if (value < row.product.price) {
          await patch.set({ salePrice: value }).commit();
          productUpdate = { salePrice: value };
        } else {
          await patch.set({ price: value }).unset(['salePrice']).commit();
          productUpdate = { price: value, salePrice: undefined };
        }
      } else {
        const numeric = typeof value === 'number' ? value : undefined;
        if (field !== 'sku' && numeric === undefined) return false;
        const update: Record<string, string | number | boolean> = {
          [path]: field === 'sku' ? String(value).trim() : numeric as number,
        };
        if (!row.variant && field === 'stock') update.inStock = (numeric ?? 0) > 0;
        await patch.set(update).commit();
        if (!row.variant) {
          if (field === 'sku') productUpdate = { sku: String(value).trim() };
          else if (field === 'price') productUpdate = { price: numeric };
          else if (field === 'weightGrams') productUpdate = { weightGrams: numeric };
          else if (row.product.stockField === 'stock') {
            productUpdate = { stock: numeric, inStock: (numeric ?? 0) > 0 };
          } else {
            productUpdate = { stockQuantity: numeric, inStock: (numeric ?? 0) > 0 };
          }
        }
      }

      setProducts((current) => current.map((product) => {
        if (product._id !== row.product._id) return product;
        const nextValue = value === '' ? undefined : value;
        if (row.variant) {
          return {
            ...product,
            sizes: product.sizes?.map((variant) => {
              if (row.variant?._key ? variant._key !== row.variant._key : variant.label !== row.variant?.label) return variant;
              if (field === 'sku') return { ...variant, sku: typeof nextValue === 'string' ? nextValue : undefined };
              if (field === 'price') return { ...variant, price: typeof nextValue === 'number' ? nextValue : undefined };
              if (field === 'stock') return { ...variant, stock: typeof nextValue === 'number' ? nextValue : undefined };
              return { ...variant, weightGrams: typeof nextValue === 'number' ? nextValue : undefined };
            }),
          };
        }
        return { ...product, ...productUpdate };
      }));
      toast.push({ status: 'success', title: 'Catalog updated', description: `${field === 'weightGrams' ? 'Weight' : field} saved.` });
      return true;
    } catch (error) {
      toast.push({
        status: 'error',
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Sanity could not save this change.',
      });
      return false;
    }
  }, [client, toast]);

  return (
    <Stack padding={4} gap={4}>
      <Flex align="center" justify="space-between" gap={3} wrap="wrap">
        <Stack gap={2}>
          <Heading size={3}>Catalog</Heading>
          <Text muted size={1}>Review and update product and variant inventory in one place.</Text>
        </Stack>
        <Flex gap={2} align="center" wrap="wrap">
          <TextInput
            aria-label="Search products by title or SKU"
            placeholder="Search title or SKU"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            style={{ width: 260 }}
          />
          <Button text="Refresh / Sync" mode="ghost" onClick={() => void refresh()} disabled={loading} />
          <Button text="New SKU" tone="primary" onClick={() => router.navigateIntent('create', { type: 'product' })} />
        </Flex>
      </Flex>

      <Card radius={2} shadow={1} style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 900, width: '100%', color: 'var(--card-fg-color)' }}>
          <thead>
            <tr>
              {['Product', 'SKU', 'Price (INR)', 'Weight (g)', 'Stock', 'Status'].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  style={{
                    padding: '12px 14px',
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 600,
                    borderBottom: '1px solid var(--card-border-color)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center' }}><Spinner /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center' }}><Text muted>{search ? 'No matching products.' : 'No products found.'}</Text></td></tr>
            ) : rows.map((row) => {
              const isDraft = row.product._id.startsWith('drafts.');
              const status = isDraft ? 'Draft' : row.product.isActive === false ? 'Inactive' : 'Live';
              const statusTone = isDraft ? 'primary' : row.product.isActive === false ? 'critical' : 'positive';
              return (
                <tr key={row.key}>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--card-border-color)' }}>
                    <Flex align="center" gap={3}>
                      {row.product.imageUrl ? (
                        <img
                          src={`${row.product.imageUrl}?w=80&h=80&fit=crop&auto=format`}
                          alt=""
                          width={44}
                          height={44}
                          loading="lazy"
                          style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--card-muted-bg-color)' }} />}
                      <Stack gap={1}>
                        <Text size={1} weight="semibold">{row.name}</Text>
                        <Text muted size={0}>{[row.label ? `Option ${row.label}` : null, row.product.category].filter(Boolean).join(' · ') || 'Uncategorized'}</Text>
                      </Stack>
                    </Flex>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--card-border-color)' }}>
                    <EditableSku
                      key={`${row.key}:sku:${row.variant?.sku ?? (row.variant ? '' : row.product.sku ?? '')}`}
                      value={row.variant?.sku ?? (row.variant ? undefined : row.product.sku)}
                      label={`${row.name}${row.label ? ` ${row.label}` : ''} SKU`}
                      onSave={(value) => saveField(row, 'sku', value)}
                    />
                    {row.variant && row.sku && !row.variant.sku && (
                      <Text muted size={0} style={{ display: 'block', marginTop: 4 }}>Product SKU: {row.sku}</Text>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--card-border-color)' }}>
                    <EditableNumber
                      key={`${row.key}:price:${row.price}`}
                      value={row.price}
                      label={`${row.name}${row.label ? ` ${row.label}` : ''} price`}
                      onInvalid={() => toast.push({ status: 'warning', title: 'Invalid price', description: 'Enter a non-negative number.' })}
                      onSave={(value) => saveField(row, 'price', value)}
                    />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--card-border-color)' }}>
                    <EditableNumber
                      key={`${row.key}:weight:${row.weightGrams ?? ''}`}
                      value={row.weightGrams}
                      label={`${row.name}${row.label ? ` ${row.label}` : ''} weight in grams`}
                      integer
                      optional
                      onInvalid={() => toast.push({ status: 'warning', title: 'Invalid weight', description: 'Enter a non-negative whole number of grams.' })}
                      onSave={(value) => saveField(row, 'weightGrams', value)}
                    />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--card-border-color)' }}>
                    <EditableNumber
                      key={`${row.key}:stock:${row.stock}`}
                      value={row.stock}
                      label={`${row.name}${row.label ? ` ${row.label}` : ''} stock`}
                      integer
                      onInvalid={() => toast.push({ status: 'warning', title: 'Invalid stock', description: 'Enter a non-negative whole number.' })}
                      onSave={(value) => saveField(row, 'stock', value)}
                    />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--card-border-color)' }}>
                    <Badge tone={statusTone}>{status}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Text muted size={1}>{rows.length} {rows.length === 1 ? 'row' : 'rows'} · stock, price, weight, and SKU save when you leave a field or press Enter.</Text>
    </Stack>
  );
}
