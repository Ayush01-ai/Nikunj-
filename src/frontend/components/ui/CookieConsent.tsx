'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';

const STORAGE_KEY = 'ns-cookie-consent';
type Consent = 'granted' | 'denied';

interface CookieConsentProps {
  gaId?: string;
}

export function CookieConsent({ gaId }: CookieConsentProps) {
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);

  // localStorage is unavailable during SSR, so read it after mount.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setConsent(stored === 'granted' || stored === 'denied' ? stored : null);
  }, []);

  const choose = (value: Consent) => {
    window.localStorage.setItem(STORAGE_KEY, value);
    setConsent(value);
  };

  // Only accept well-formed GA4 IDs so the inline script can't be injected into.
  const validGaId = gaId && /^G-[A-Z0-9]{4,20}$/.test(gaId) ? gaId : null;

  return (
    <>
      {validGaId && consent === 'granted' && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${validGaId}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${validGaId}',{anonymize_ip:true});`}
          </Script>
        </>
      )}

      {consent === null && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Cookie consent"
          className="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:left-4 sm:max-w-md z-[700] bg-white border border-gold/40 shadow-gold-sm p-5"
        >
          <p className="font-crimson text-[15px] text-deep leading-relaxed">
            We use essential cookies to keep you signed in and your cart working. With your permission we also use
            analytics cookies to understand how the site is used.{' '}
            <Link href="/policies/privacy" className="underline text-gold-dark hover:text-deep">
              Privacy Policy
            </Link>
          </p>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => choose('granted')} className="btn-gold text-[10px] px-5 py-2.5">
              Accept
            </button>
            <button
              type="button"
              onClick={() => choose('denied')}
              className="border border-[var(--border)] px-5 py-2.5 font-cinzel text-[10px] tracking-widest uppercase text-deep hover:border-gold-dark"
            >
              Essential only
            </button>
          </div>
        </div>
      )}
    </>
  );
}
