'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Guarantees every page navigation opens at the top (or at the #hash target).
 * Next.js only scrolls when the new segment is out of view, which misfires with
 * the sticky navbar — e.g. Footer → Terms & Conditions kept the old position.
 */
export function ScrollReset() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const hash = window.location.hash.slice(1);
    if (hash) {
      // Sections can mount a frame later (lazy home sections), so retry briefly.
      let tries = 0;
      const seek = () => {
        const el = document.getElementById(decodeURIComponent(hash));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else if (tries++ < 20) window.setTimeout(seek, 50);
      };
      seek();
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
