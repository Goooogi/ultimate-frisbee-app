'use client';

// UsauFilterButton — collapses a set of USAU filter dropdowns behind one
// "Filters" trigger, mirroring the marketplace's filter panel.
//
// Why: the events/tournaments view showed Level + Flight as an always-visible
// control row that wrapped on mobile and pushed the tournament grid down. The
// set is also expected to grow, and a growing row of inline dropdowns degrades
// fast — a panel scales without touching the page layout.
//
// The trigger badges how many filters are away from their default, so the
// collapsed state still tells you whether anything is applied. Children are
// laid out as labelled rows; pass whatever controls the page needs.

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface UsauFilterButtonProps {
  /** Count of non-default filters — drives the badge. 0 hides it. */
  activeCount: number;
  /** Clears every filter this panel owns. Omit to hide the Clear action. */
  onClear?: () => void;
  /** Labelled rows — use <UsauFilterRow>. */
  children: ReactNode;
}

export function UsauFilterButton({ activeCount, onClear, children }: UsauFilterButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on Escape and on outside click — the panel floats over the grid, so
  // leaving it open while the user moves on would obscure content.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={[
          'inline-flex items-center gap-2 px-3.5 min-h-[36px] rounded-full',
          'text-[11px] font-bold tracking-[0.06em] uppercase font-tight',
          'motion-safe:transition-colors motion-safe:duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          activeCount > 0 || open
            ? 'bg-ink text-bg'
            : 'bg-ink/5 text-muted hover:bg-ink/10 hover:text-ink',
        ].join(' ')}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M1.5 3h11M3.5 7h7M5.5 11h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-accent-ink text-[9px] font-extrabold tabular">
            {activeCount}
          </span>
        )}
      </button>

      {activeCount > 0 && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] font-semibold text-faint hover:text-ink font-tight cursor-pointer motion-safe:transition-colors rounded-full px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Clear
        </button>
      )}

      {open && (
        <div
          className={[
            'absolute top-full left-0 mt-2 z-30 min-w-[260px]',
            'flex flex-col gap-3 p-3.5 rounded-card bg-surface shadow-hero',
            'motion-safe:animate-fade-in',
          ].join(' ')}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** One labelled row inside the panel: caption left, control right. */
export function UsauFilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-muted font-tight flex-shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}
