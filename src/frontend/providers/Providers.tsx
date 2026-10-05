'use client';

import React, { createContext, useContext } from 'react';
import { Toaster } from 'react-hot-toast';
import type { NavMenuCategory, SiteSettings } from '@/types';

// ─── Site Settings Context ────────────────────────────────────────────────
interface SiteSettingsContextValue {
  settings: SiteSettings | null;
  menu: NavMenuCategory[];
}

const SiteSettingsContext = createContext<SiteSettingsContextValue>({ settings: null, menu: [] });

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}

// ─── Providers ────────────────────────────────────────────────────────────
export function Providers({
  children,
  siteSettings,
  menu = [],
}: {
  children: React.ReactNode;
  siteSettings: SiteSettings | null;
  menu?: NavMenuCategory[];
}) {
  return (
    <SiteSettingsContext.Provider value={{ settings: siteSettings, menu }}>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'Cinzel, serif',
            fontSize: '12px',
            letterSpacing: '0.05em',
            borderRadius: '0',
            border: '1px solid rgba(201,146,42,0.3)',
            background: '#FFF8EE',
            color: '#2C1A00',
          },
          success: {
            iconTheme: { primary: '#C9922A', secondary: '#FFF8EE' },
            duration: 3000,
          },
          error: {
            iconTheme: { primary: '#e74c3c', secondary: '#FFF8EE' },
          },
        }}
      />
    </SiteSettingsContext.Provider>
  );
}
