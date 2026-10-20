'use client';

import Link from 'next/link';
import { useEffect } from 'react';

// Replaces the root layout when it fails, so it must render its own <html> and <body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global-error]', error.digest ?? '', error.message);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Georgia, serif', background: '#FFF8EE', color: '#1A0A00' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ color: '#5C3D11', marginBottom: 24 }}>
              Please try again in a moment.
              {error.digest && <span style={{ display: 'block', fontSize: 12, marginTop: 8 }}>Reference: {error.digest}</span>}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{ background: '#8B6010', color: '#fff', border: 0, padding: '12px 24px', cursor: 'pointer', marginRight: 8 }}
            >
              Try Again
            </button>
            <Link href="/" style={{ color: '#8B6010' }}>Return Home</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
