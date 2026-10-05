'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[client-error]', error.digest ?? '', error.message);
  }, [error]);

  return (
    <main className="min-h-[70vh] bg-cream flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md">
        <p className="font-cinzel text-[10px] tracking-[0.4em] uppercase text-gold-dark mb-2">Something went wrong</p>
        <h1 className="font-cinzel text-2xl font-semibold text-deep mb-3">We couldn&apos;t load this page</h1>
        <p className="font-crimson italic text-[var(--text-mid)] mb-8">
          Please try again. If the problem continues, contact us on WhatsApp.
          {error.digest && <span className="block mt-2 not-italic text-xs">Reference: {error.digest}</span>}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn-gold">
            Try Again
          </button>
          <Link href="/" className="btn-outline-gold">
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}
