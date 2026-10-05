'use client';

import Link from 'next/link';
import { useSiteSettings } from '@/frontend/providers/Providers';

export function FooterShopLinks() {
  const { menu } = useSiteSettings();
  if (menu.length === 0) return null;

  return (
    <div>
      <h3 className="font-cinzel text-xs tracking-[0.2em] uppercase text-gold-light mb-5 font-semibold">
        Shop by Category
      </h3>
      <ul className="space-y-3 text-xs">
        {menu.map((cat) => (
          <li key={cat._id}>
            <Link href={`/collections/${cat.slug}`} className="text-xs text-white/70 hover:text-gold-light transition-colors">
              {cat.name}
            </Link>
            {cat.types.length > 0 && (
              <ul className="mt-2 ml-3 space-y-2">
                {cat.types.map((type) => (
                  <li key={type._id}>
                    <Link
                      href={`/collections/${cat.slug}/${type.slug}`}
                      className="text-xs text-white/50 hover:text-gold-light transition-colors"
                    >
                      {type.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
