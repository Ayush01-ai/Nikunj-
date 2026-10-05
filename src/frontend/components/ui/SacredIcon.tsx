import React from 'react';

interface SacredIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
  name?: 'hamsa' | 'trishul' | 'lotus' | 'sparkle' | 'diya' | 'om';
}

export function SacredIcon({
  size = 24,
  className = '',
  name = 'lotus',
  ...props
}: SacredIconProps) {
  if (name === 'lotus') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...props}
      >
        <path d="M12 3c-1.5 3-3 6.5-3 10.5 0 3 1.5 5.5 3 6.5 1.5-1 3-3.5 3-6.5 0-4-1.5-7.5-3-10.5z" />
        <path d="M12 13.5c-3.5-1-6.5 1-7.5 4.5 2 1.5 4.5 1.5 7.5.5" />
        <path d="M12 13.5c3.5-1 6.5 1 7.5 4.5-2 1.5-4.5 1.5-7.5.5" />
        <path d="M9 18.5c-3-1-5 .5-6 3 2.5 1 5 .5 7-1" />
        <path d="M15 18.5c3-1 5 .5 6 3-2.5 1-5 .5-7-1" />
      </svg>
    );
  }

  if (name === 'trishul') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...props}
      >
        <path d="M12 2v20" />
        <path d="M6 4c0 4 2 8 6 9 4-1 6-5 6-9" />
        <path d="M6 4l-1 2" />
        <path d="M18 4l1 2" />
        <path d="M10 21h4" />
      </svg>
    );
  }

  if (name === 'diya') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...props}
      >
        <path d="M12 3c-1 2-2 3.5-2 5 0 1.5.9 2.5 2 2.5s2-1 2-2.5c0-1.5-1-3-2-5z" fill="currentColor" fillOpacity="0.2" />
        <path d="M4 14c0 3.5 3.5 6 8 6s8-2.5 8-6H4z" />
        <path d="M8 20h8" />
      </svg>
    );
  }

  // Default Sacred Emblem / Hamsa motif in elegant vector lines
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2l2.4 5.2 5.6.8-4 4 1 5.6-5-2.6-5 2.6 1-5.6-4-4 5.6-.8z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}

/**
 * Ornate luxury gold badge used for product placeholder images and empty states
 */
export function SacredPlaceholder({
  size = 48,
  className = '',
  label = 'Nikunj Sakhi',
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-4 select-none ${className}`}
      aria-label={label}
    >
      <div className="relative flex items-center justify-center mb-2">
        <div className="absolute inset-0 rounded-full bg-gold/10 blur-md" />
        <div className="relative w-14 h-14 rounded-full border border-gold/30 bg-cream-50 flex items-center justify-center text-gold shadow-gold-sm">
          <SacredIcon name="lotus" size={size} className="text-gold" />
        </div>
      </div>
      <span className="font-cinzel text-[10px] tracking-[0.25em] uppercase text-gold font-semibold">
        {label}
      </span>
      <span className="font-crimson italic text-[11px] text-[var(--text-mid)]">
        Divine Ornaments
      </span>
    </div>
  );
}
