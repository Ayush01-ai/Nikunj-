'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatINR, getVariantPricing, variantStock } from '@/cms/lib/pricing';
import type { Product, ProductColor } from '@/types';

type Size = 'sm' | 'md';

/* ─── Variant (size / volume) selector ──────────────────────────────────── */

export function VariantSelector({
  product,
  value,
  onChange,
  size = 'md',
}: {
  product: Product;
  value: string;
  onChange: (label: string) => void;
  size?: Size;
}) {
  if (!product.sizes?.length) return null;
  return (
    <fieldset className="mb-5">
      <legend className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-2">
        Select Option: <span className="text-gold-dark">{value}</span>
      </legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {product.sizes.map((s) => {
          const pricing = getVariantPricing(product, s.label);
          const soldOut = variantStock(product, s) <= 0;
          const active = value === s.label;
          return (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={soldOut}
              onClick={() => onChange(s.label)}
              className={`flex flex-col items-center border transition-all ${
                size === 'sm' ? 'px-3 py-1.5 min-w-[64px]' : 'px-4 py-2 min-w-[84px]'
              } ${
                active
                  ? 'bg-gold border-gold text-white shadow-gold-sm'
                  : 'bg-white border-[var(--border)] text-deep hover:border-gold'
              } ${soldOut ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className={`font-cinzel tracking-wider uppercase ${size === 'sm' ? 'text-[10px]' : 'text-[11px]'} ${soldOut ? 'line-through' : ''}`}>
                {s.label}
              </span>
              <span className={`font-lato font-semibold ${size === 'sm' ? 'text-[10px]' : 'text-xs'} ${active ? 'text-white' : 'text-gold-dark'}`}>
                {soldOut ? 'Sold out' : formatINR(pricing.price)}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ─── Colour selector ───────────────────────────────────────────────────── */

const NAMED_COLOURS: Record<string, string> = {
  red: '#c62828', maroon: '#7b1f1f', pink: '#ec7aa8', rani: '#d81b60', orange: '#ef7d1a', saffron: '#f4a020',
  kesariya: '#f4a020', yellow: '#f5c518', peela: '#f5c518', gold: '#c9922a', golden: '#c9922a', silver: '#b8bcc2',
  green: '#2e7d32', hara: '#2e7d32', teal: '#0f5f5f', blue: '#1e5bb8', neela: '#1e5bb8', navy: '#1b2a4a',
  sky: '#7cc4f0', purple: '#7b3fa0', jamuni: '#6a1b9a', violet: '#7f56d9', white: '#ffffff', safed: '#ffffff',
  cream: '#f6efe1', ivory: '#fffff0', black: '#1a1a1a', kala: '#1a1a1a', brown: '#7a4a24', grey: '#9e9e9e',
  gray: '#9e9e9e', peach: '#ffb48a', magenta: '#c2185b', copper: '#b87333', multi: '', multicolour: '', multicolor: '',
};

const RAINBOW = 'conic-gradient(#c62828, #ef7d1a, #f5c518, #2e7d32, #1e5bb8, #7b3fa0, #c62828)';

/** Turns a hex or a label like "Red, Green" / "white and black" into a CSS background. */
export function swatchBackground(color: ProductColor): string | undefined {
  if (color.hex && /^#?[0-9a-f]{3,8}$/i.test(color.hex.trim())) {
    return color.hex.startsWith('#') ? color.hex : `#${color.hex}`;
  }
  const parts = color.label
    .toLowerCase()
    .split(/,|\/|&|\+|\band\b|\s-\s/)
    .map((p) => p.trim().replace(/[^a-z]/g, ''))
    .filter(Boolean);
  if (parts.some((p) => p.startsWith('multi'))) return RAINBOW;
  const hexes = parts.map((p) => NAMED_COLOURS[p]).filter((h): h is string => Boolean(h));
  if (hexes.length === 0 || hexes.length !== parts.length) return undefined;
  if (hexes.length === 1) return hexes[0];
  const step = 100 / hexes.length;
  return `linear-gradient(135deg, ${hexes.map((h, i) => `${h} ${i * step}%, ${h} ${(i + 1) * step}%`).join(', ')})`;
}

export function ColorSelector({
  colors,
  value,
  onChange,
  size = 'md',
}: {
  colors?: ProductColor[];
  value: string;
  onChange: (label: string) => void;
  size?: Size;
}) {
  if (!colors?.length) return null;
  const dim = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
  return (
    <fieldset className="mb-5">
      <legend className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-2">
        Colour: <span className="text-gold-dark">{value}</span>
      </legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {colors.map((c) => {
          const bg = swatchBackground(c);
          const active = value === c.label;
          return bg ? (
            <button
              key={c.label}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={c.label}
              title={c.label}
              onClick={() => onChange(c.label)}
              className={`${dim} rounded-full border-2 transition-all cursor-pointer ${
                active ? 'border-gold scale-110 ring-2 ring-gold/30' : 'border-gray-200 hover:border-gold/60'
              }`}
              style={{ background: bg }}
            />
          ) : (
            <button
              key={c.label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(c.label)}
              className={`px-3 py-1.5 border font-cinzel text-[10px] tracking-wider uppercase transition-all cursor-pointer ${
                active ? 'bg-gold border-gold text-white' : 'bg-white border-[var(--border)] text-[var(--text-mid)] hover:border-gold'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ─── Quantity stepper ──────────────────────────────────────────────────── */

export function QuantitySelector({
  value,
  max,
  onChange,
  size = 'md',
  label = 'Quantity',
}: {
  value: number;
  max: number;
  onChange: (qty: number) => void;
  size?: Size;
  label?: string | null;
}) {
  const limit = Math.max(1, max);
  const h = size === 'sm' ? 'h-9' : 'h-10';
  const btn = `${size === 'sm' ? 'w-9' : 'w-10'} ${h}`;
  const clamp = (q: number) => Math.max(1, Math.min(limit, Math.floor(q) || 1));
  const set = (q: number) => onChange(clamp(q));
  // Free-text draft so the field can be cleared while typing without snapping back to 1.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const btnClass = `${btn} shrink-0 appearance-none bg-transparent text-deep flex items-center justify-center hover:bg-gold hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-deep disabled:cursor-not-allowed cursor-pointer`;
  return (
    <div>
      {label && (
        <p className="font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)] mb-2">{label}</p>
      )}
      <div className="flex items-center gap-3">
        <div className={`flex items-stretch ${h} border border-[var(--border)] bg-white text-deep`}>
          <button
            type="button"
            onClick={() => { setDraft(null); set(value - 1); }}
            disabled={value <= 1}
            aria-label="Decrease quantity"
            className={btnClass}
          >
            <Minus size={14} strokeWidth={2} className="w-3.5 h-3.5 shrink-0 stroke-current" aria-hidden="true" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={shown}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
              setDraft(digits);
              if (digits) set(Number(digits));
            }}
            onBlur={() => setDraft(null)}
            aria-label="Quantity"
            data-testid="quantity-value"
            className="w-12 h-full shrink-0 m-0 p-0 text-center font-cinzel text-sm leading-none text-deep [-webkit-text-fill-color:currentColor] opacity-100 bg-transparent border-x border-[var(--border)] rounded-none appearance-none focus:outline-none"
          />
          <button
            type="button"
            onClick={() => { setDraft(null); set(value + 1); }}
            disabled={value >= limit}
            aria-label="Increase quantity"
            className={btnClass}
          >
            <Plus size={14} strokeWidth={2} className="w-3.5 h-3.5 shrink-0 stroke-current" aria-hidden="true" />
          </button>
        </div>
        {max > 0 && max <= 10 && (
          <span className="text-[11px] text-[var(--text-mid)]">Only {max} available</span>
        )}
      </div>
    </div>
  );
}

/* ─── Price block ───────────────────────────────────────────────────────── */

export function PriceBlock({
  price,
  mrp,
  discount,
  quantity = 1,
  size = 'md',
}: {
  price: number;
  mrp?: number;
  discount: number;
  quantity?: number;
  size?: Size;
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`font-cinzel font-bold text-gold-dark ${size === 'sm' ? 'text-2xl' : 'text-2xl sm:text-3xl'}`}>
          {formatINR(price)}
        </span>
        {mrp && discount > 0 && (
          <>
            <span className={`text-gray-400 line-through font-lato ${size === 'sm' ? 'text-base' : 'text-lg'}`}>{formatINR(mrp)}</span>
            <span className="bg-green-100 text-green-700 font-cinzel text-xs px-2 py-0.5">{discount}% OFF</span>
          </>
        )}
      </div>
      {quantity > 1 && (
        <p className="mt-1 text-xs text-[var(--text-mid)] font-lato" aria-live="polite">
          {quantity} × {formatINR(price)} ={' '}
          <span className="font-semibold text-deep">{formatINR(price * quantity)}</span>
          {mrp && discount > 0 && <span className="text-green-700"> · you save {formatINR((mrp - price) * quantity)}</span>}
        </p>
      )}
    </div>
  );
}
