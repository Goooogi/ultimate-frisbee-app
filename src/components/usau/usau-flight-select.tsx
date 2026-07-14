'use client';

// USAU flight (Triple Crown Tour tier) MULTI-select filter, bound to ?flight=
// as a comma-separated list (e.g. ?flight=pro,elite). Persists in the URL, so
// it survives refresh, is shareable, and the server reads it directly (each
// combo memoizes independently in the cached reader).
//
// Standalone so it sits next to UsauLevelSelect on BOTH the Schedule tab and the
// Scores (recent results) tab. Flight is a Club-only concept, so callers gate
// rendering on level === 'CLUB'.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FLIGHTS, FLIGHT_LABELS, parseFlightsParam, type Flight } from '@/lib/usau/flights';

export function UsauFlightSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = parseFlightsParam(searchParams.get('flight'));
  const selectedSet = new Set(selected);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  // Write the next flight set to the URL (canonical order, comma-joined).
  const commit = useCallback(
    (next: Flight[]) => {
      const ordered = FLIGHTS.filter((f) => next.includes(f));
      const params = new URLSearchParams(searchParams.toString());
      if (ordered.length === 0) params.delete('flight');
      else params.set('flight', ordered.join(','));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const toggle = useCallback(
    (f: Flight) => {
      const next = selectedSet.has(f) ? selected.filter((x) => x !== f) : [...selected, f];
      commit(next);
    },
    [commit, selected, selectedSet],
  );

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label =
    selected.length === 0
      ? 'All flights'
      : selected.length === 1
        ? FLIGHT_LABELS[selected[0]]
        : `${selected.length} flights`;

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label="Select flights"
        onClick={() => setOpen((o) => !o)}
        className={[
          'inline-flex items-center gap-2 pl-3.5 pr-2.5 py-[7px] rounded-full min-h-[36px]',
          'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
          'bg-ink/5 text-ink cursor-pointer',
          'hover:bg-ink/10 transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'whitespace-nowrap',
        ].join(' ')}
      >
        <span>{label}</span>
        <svg
          className={['w-3 h-3 text-muted transition-transform duration-150', open ? 'rotate-180' : ''].join(' ')}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label="Select flights"
          className="absolute top-full mt-1.5 z-30 min-w-[180px] py-1.5 bg-surface rounded-card shadow-lift max-h-[60vh] overflow-y-auto"
        >
          {/* "All flights" — clears the selection. */}
          <li role="option" aria-selected={selected.length === 0}>
            <button
              type="button"
              onClick={() => commit([])}
              className={[
                'w-[calc(100%-12px)] text-left px-3.5 py-2 mx-1.5 rounded-full flex items-center gap-2.5',
                'text-[12px] font-bold tracking-[0.12em] uppercase font-tight transition-colors duration-100',
                selected.length === 0 ? 'bg-ink/[0.06] text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink',
              ].join(' ')}
            >
              <Check on={selected.length === 0} />
              All flights
            </button>
          </li>
          {FLIGHTS.map((f) => {
            const on = selectedSet.has(f);
            return (
              <li key={f} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => toggle(f)}
                  className={[
                    'w-[calc(100%-12px)] text-left px-3.5 py-2 mx-1.5 rounded-full flex items-center gap-2.5',
                    'text-[12px] font-bold tracking-[0.12em] uppercase font-tight transition-colors duration-100',
                    on ? 'text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink',
                  ].join(' ')}
                >
                  <Check on={on} />
                  {FLIGHT_LABELS[f]}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Small checkbox affordance — filled accent square with a tick when on.
function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-[4px] border transition-colors duration-100',
        on ? 'bg-accent border-accent text-accent-ink' : 'border-ink/25 text-transparent',
      ].join(' ')}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
