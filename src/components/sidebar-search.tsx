'use client';

// Compact search-everything box for the desktop sidebar.
//
// Searches USAU teams + players in one call. Debounces user input (200ms),
// shows a dropdown panel with grouped results, and routes clicks to the
// team/player detail pages.
//
// UFA player/team search isn't wired here yet — the UFA data already has
// its own client (lib/ufa/client.ts) and we'd want to merge results in a
// follow-up. For now the placeholder hints at both.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type SearchResult, resultHref } from '@/lib/usau/data';
import { searchAll } from '@/lib/ufa/search-actions';

export function SidebarSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounced search — abort in-flight requests so we don't render stale data.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchAll(q, 6);
        if (!cancelled) {
          setResults(r);
          setHighlight(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function goTo(r: SearchResult) {
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(resultHref(r));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[highlight];
      if (target) goTo(target);
    }
  }

  const teamResults = results.filter((r) => r.kind === 'team');
  const playerResults = results.filter((r) => r.kind === 'player');
  const showPanel = open && (loading || results.length > 0 || query.trim().length >= 2);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
        >
          <SearchGlyph />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search teams, players"
          aria-label="Search teams and players"
          className={[
            'w-full bg-surface border border-border rounded-md',
            'pl-8 pr-2.5 py-2 text-[13px] text-ink font-tight placeholder:text-faint',
            'focus-visible:outline-none focus-visible:border-ink transition-colors',
          ].join(' ')}
        />
      </div>

      {showPanel && (
        <div
          role="listbox"
          className={[
            'absolute left-0 right-0 top-full mt-1 z-30',
            'border border-border bg-bg rounded-md shadow-lg',
            'max-h-[60vh] overflow-y-auto',
          ].join(' ')}
        >
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-faint font-tight">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-faint font-tight">No matches.</div>
          ) : (
            <>
              {teamResults.length > 0 && (
                <Group label="Teams">
                  {teamResults.map((r) => {
                    const i = results.indexOf(r);
                    return (
                      <ResultRow
                        key={r.id}
                        result={r}
                        active={i === highlight}
                        onClick={() => goTo(r)}
                      />
                    );
                  })}
                </Group>
              )}
              {playerResults.length > 0 && (
                <Group label="Players">
                  {playerResults.map((r) => {
                    const i = results.indexOf(r);
                    return (
                      <ResultRow
                        key={r.id}
                        result={r}
                        active={i === highlight}
                        onClick={() => goTo(r)}
                      />
                    );
                  })}
                </Group>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-2 pb-1 text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function ResultRow({
  result,
  active,
  onClick,
}: {
  result: SearchResult;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={[
        'flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer',
        'focus-visible:outline-none',
        active ? 'bg-surface' : 'hover:bg-surface',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'inline-flex items-center justify-center w-6 h-6 rounded-md text-[9px] font-bold tracking-[0.04em] flex-shrink-0',
          result.kind === 'team' ? 'bg-ink text-bg' : 'bg-accent text-accent-ink',
        ].join(' ')}
      >
        {result.kind === 'team' ? 'TM' : 'PL'}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-ink font-tight leading-tight truncate">
          {result.name}
        </span>
        {result.hint && (
          <span className="block text-[10px] font-medium text-faint font-tight truncate mt-0.5">
            {result.hint}
          </span>
        )}
      </span>
    </button>
  );
}

function SearchGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
