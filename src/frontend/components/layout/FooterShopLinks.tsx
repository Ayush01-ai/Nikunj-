'use client';

import Link from 'next/link';
import { useSiteSettings } from '@/frontend/providers/Providers';

export function FooterShopLinks() {
  const { menu } = useSiteSettings();
  if (menu.length === 0) return null;

  return (
    <div>
      <h2 className="font-cinzel text-sm tracking-wide text-gold-light mb-5 font-semibold">
        Shop by Category
      </h2>
      <ul className="space-y-3 text-xs">
        {menu.map((cat) => (
          <li key={cat._id}>
            <Link prefetch={false} href={`/collections/${cat.slug}`} className="text-xs text-white/70 hover:text-gold-light transition-colors">
              {cat.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
