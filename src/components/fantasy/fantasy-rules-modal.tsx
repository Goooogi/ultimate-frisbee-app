'use client';

// "How it works" rules button + modal for Fantasy.
//
// Renders a compact trigger button; clicking it opens a dismissible modal that
// hosts the shared FantasyRulesContent (rules + scoring table). Used on the
// leaderboard and My Team so the rules are one tap away without occupying the
// page. Visual language matches AuthModal: portal to <body>, dark scrim,
// bg-bg card, Esc / backdrop / close-button to dismiss.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FantasyRulesContent } from './fantasy-rules';

interface FantasyRulesModalProps {
  /** Button label. Defaults to "Rules". */
  label?: string;
  /** Visual weight of the trigger. `ghost` = bordered subtle; `link` = text. */
  variant?: 'ghost' | 'link';
  /** When set, auto-opens the modal ONCE per browser (first visit to Fantasy),
   *  keyed by this localStorage flag. Subsequent visits don't auto-open — the
   *  button still works. */
  autoOpenOnceKey?: string;
}

export function FantasyRulesModal({
  label = 'Rules',
  variant = 'ghost',
  autoOpenOnceKey,
}: FantasyRulesModalProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // First-visit auto-open: if the flag hasn't been set, open the modal and set
  // it so it only ever happens once. Wrapped in try/catch — private-mode / SSR
  // safe (localStorage can throw or be absent).
  useEffect(() => {
    if (!autoOpenOnceKey) return;
    try {
      if (localStorage.getItem(autoOpenOnceKey)) return;
      localStorage.setItem(autoOpenOnceKey, '1');
      setOpen(true);
    } catch {
      /* localStorage unavailable — skip the auto-open, button still works */
    }
  }, [autoOpenOnceKey]);

  const close = useCallback(() => setOpen(false), []);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  const triggerClass =
    variant === 'link'
      ? [
          'inline-flex items-center gap-1.5 text-accent font-tight text-[13px] font-bold tracking-[0.04em]',
          'hover:opacity-80 transition-opacity duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
        ].join(' ')
      : [
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface',
          'text-ink font-tight text-[12px] font-bold tracking-[0.04em]',
          'hover:bg-[rgb(var(--surface-hi))] transition-colors duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ');

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClass} aria-haspopup="dialog">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7.25v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5.1" r="0.85" fill="currentColor" />
        </svg>
        {label}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fantasy-rules-modal-title"
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 bg-ink/40 backdrop-blur-sm"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="w-full max-w-[520px] max-h-full overflow-y-auto bg-bg border border-border rounded-md shadow-xl">
              {/* Header with close button */}
              <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1">
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight pt-1">
                  How it works
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close rules"
                  className={[
                    'flex-shrink-0 -mr-1.5 w-8 h-8 rounded flex items-center justify-center',
                    'text-faint hover:text-ink hover:bg-[rgb(var(--ink)/0.06)]',
                    'transition-colors duration-150 cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  ].join(' ')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="px-6 pb-6">
                <FantasyRulesContent headingId="fantasy-rules-modal-title" />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
