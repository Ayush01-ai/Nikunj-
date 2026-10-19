'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/frontend/lib/analytics';

/** Counts a page view on every client-side navigation (Studio pages are excluded). */
export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith('/studio')) return;
    track('page_view', { path: pathname });
  }, [pathname]);
  return null;
}
