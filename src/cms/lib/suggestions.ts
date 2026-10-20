// Product suggestion helpers shared by the product page and the Shop menu (no server-only imports).

interface Suggestable {
  _id: string;
  category?: { _id?: string; name?: string } | string | null;
  productType?: { _id?: string } | string | null;
}

const groupOf = (p: Suggestable) =>
  (typeof p.category === 'string' ? p.category : p.category?._id ?? p.category?.name) ||
  (typeof p.productType === 'string' ? p.productType : p.productType?._id) ||
  'other';

/** Small stable hash so each product page shows its own (but consistent) mix. */
export function seedFrom(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Picks `count` products spread across as many categories as possible (round-robin),
 * starting from a seed-dependent category and offset so suggestions vary between pages.
 */
export function pickDiverse<T extends Suggestable>(candidates: T[], count: number, seed = 0, exclude: Iterable<string> = []): T[] {
  const skip = new Set(exclude);
  const groups = new Map<string, T[]>();
  for (const p of candidates) {
    if (skip.has(p._id)) continue;
    skip.add(p._id);
    const key = groupOf(p);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const buckets = [...groups.values()];
  if (!buckets.length) return [];
  const start = seed % buckets.length;
  const ordered = [...buckets.slice(start), ...buckets.slice(0, start)].map((b) => {
    const offset = b.length > 1 ? seed % b.length : 0;
    return [...b.slice(offset), ...b.slice(0, offset)];
  });
  const out: T[] = [];
  for (let round = 0; out.length < count; round++) {
    let added = false;
    for (const b of ordered) {
      if (round < b.length && out.length < count) {
        out.push(b[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}
