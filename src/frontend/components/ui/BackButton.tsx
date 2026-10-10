'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  /** Where to go when there is no in-site history (e.g. page opened from a shared link). */
  fallbackHref?: string;
  /** Overrides history navigation, e.g. to step back within a multi-step flow. */
  onBack?: () => void;
  label?: string;
  className?: string;
}

export function BackButton({ fallbackHref = '/collections', onBack, label = 'Back', className = '' }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onBack) {
      onBack();
      return;
    }
    const cameFromSite =
      window.history.length > 1 &&
      (!document.referrer || new URL(document.referrer).origin === window.location.origin);
    if (cameFromSite) router.back();
    else router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label === 'Back' ? 'Go back to previous page' : label}
      className={`group inline-flex items-center gap-1.5 border border-gold/40 bg-cream px-3 py-1.5 font-cinzel text-[10px] font-semibold uppercase tracking-widest text-gold-dark transition-colors hover:border-gold hover:bg-gold-dark hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 cursor-pointer rounded-xs ${className}`}
    >
      <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
      {label}
    </button>
  );
}
