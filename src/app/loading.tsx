import { SacredIcon } from '@/frontend/components/ui/SacredIcon';

// Instant feedback while the next route streams in.
export default function Loading() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 bg-cream" role="status" aria-live="polite">
      <span className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-gold/20 border-t-gold animate-spin" />
        <SacredIcon name="lotus" size={28} className="text-gold-dark" />
      </span>
      <p className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-[var(--text-mid)]">Loading…</p>
    </div>
  );
}
