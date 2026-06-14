'use client';

// Inline pill search bar for the desktop nav rail.
// Replaces the SearchTrigger icon-button: shows a rounded input in place,
// searches as you type (≥2 chars, 200ms debounce), and anchors a results
// dropdown directly below the input.
//
// Uses searchAll() (UFA + USAU) — a server action — so UFA-only players are
// findable. SearchResult shape + SearchGlyph come from the USAU/modal modules.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { type SearchResult } from '@/lib/usau/data';
import { searchAll } from '@/lib/ufa/search-actions';
import { SearchGlyph } from '@/components/search-modal';

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced search — identical logic to SearchModal (200ms, abort stale).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchAll(q, 8);
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

  // Close on click outside the wrapper.
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, handleClickOutside]);

  function navigate(r: SearchResult) {
    if (r.kind === 'team') router.push(`/usau/teams/${r.id}`);
    else if (r.kind === 'tournament') router.push(`/usau/events/${r.id}`);
    else router.push(`/players/${r.id}`);
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[highlight];
      if (target) navigate(target);
    }
  }

  function clearQuery() {
    setQuery('');
    setOpen(false);
    setResults([]);
    inputRef.current?.focus();
  }

  // Show dropdown when query ≥2 chars (loading OR results OR empty state).
  const showDropdown = open && query.trim().length >= 2;

  const teamResults = results.filter((r) => r.kind === 'team');
  const playerResults = results.filter((r) => r.kind === 'player');
  const tournamentResults = results.filter((r) => r.kind === 'tournament');

  return (
    <div ref={wrapperRef} className="relative">
      {/* Pill input wrapper */}
      <div
        className={[
          'flex items-center gap-2 h-[30px] px-3',
          'rounded-full bg-surface border',
          'transition-colors duration-150',
          'focus-within:ring-2 focus-within:ring-accent focus-within:border-accent',
          showDropdown ? 'border-accent' : 'border-border',
          // Fixed width: snug enough at 1024px, generous at xl.
          'w-[200px] xl:w-[240px]',
        ].join(' ')}
      >
        {/* Magnifier icon */}
        <span aria-hidden="true" className="text-muted flex-shrink-0">
          <SearchGlyph size={13} />
        </span>

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search players, teams, and tournaments"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="search-bar-listbox"
          aria-activedescendant={
            showDropdown && results.length > 0
              ? `search-bar-option-${highlight}`
              : undefined
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          placeholder="Search players, teams, tournaments…"
          autoComplete="off"
          spellCheck={false}
          className={[
            'flex-1 min-w-0 bg-transparent',
            'text-[12px] font-tight text-ink placeholder:text-faint',
            'focus-visible:outline-none',
          ].join(' ')}
        />

        {/* Clear button — only when there's text */}
        {query.length > 0 && (
          <button
            type="button"
            onClick={clearQuery}
            aria-label="Clear search"
            className={[
              'flex-shrink-0 inline-flex items-center justify-center',
              'w-4 h-4 rounded-full text-faint hover:text-ink hover:bg-surface-hi',
              'transition-colors duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
            ].join(' ')}
          >
            <ClearGlyph />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div
          id="search-bar-listbox"
          role="listbox"
          aria-label="Search results"
          className={[
            'absolute left-0 top-full mt-2 z-[70]',
            'w-full min-w-[320px]',
            'bg-bg border border-border rounded-md shadow-lg overflow-hidden',
          ].join(' ')}
        >
          {loading && results.length === 0 ? (
            <div className="px-4 py-4 text-[12px] text-faint font-tight">
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-4 text-[12px] text-faint font-tight">
              No matches for &ldquo;{query.trim()}&rdquo;
            </div>
          ) : (
            <>
              {teamResults.length > 0 && (
                <ResultGroup label="Teams">
                  {teamResults.map((r) => {
                    const i = results.indexOf(r);
                    return (
                      <ResultRow
                        key={r.id}
                        id={`search-bar-option-${i}`}
                        result={r}
                        active={i === highlight}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => navigate(r)}
                      />
                    );
                  })}
                </ResultGroup>
              )}
              {playerResults.length > 0 && (
                <ResultGroup label="Players">
                  {playerResults.map((r) => {
                    const i = results.indexOf(r);
                    return (
                      <ResultRow
                        key={r.id}
                        id={`search-bar-option-${i}`}
                        result={r}
                        active={i === highlight}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => navigate(r)}
                      />
                    );
                  })}
                </ResultGroup>
              )}
              {tournamentResults.length > 0 && (
                <ResultGroup label="Tournaments">
                  {tournamentResults.map((r) => {
                    const i = results.indexOf(r);
                    return (
                      <ResultRow
                        key={r.id}
                        id={`search-bar-option-${i}`}
                        result={r}
                        active={i === highlight}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => navigate(r)}
                      />
                    );
                  })}
                </ResultGroup>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-1.5 text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function ResultRow({
  id,
  result,
  active,
  onMouseEnter,
  onClick,
}: {
  id: string;
  result: SearchResult;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={[
        'flex items-center gap-3 px-4 py-2.5 w-full text-left',
        'transition-colors duration-100 cursor-pointer',
        'focus-visible:outline-none',
        active ? 'bg-surface' : 'hover:bg-surface',
      ].join(' ')}
    >
      {/* Mark: colored badge per kind */}
      <span
        aria-hidden="true"
        className={[
          'inline-flex items-center justify-center w-7 h-7 rounded-md',
          'text-[9px] font-bold tracking-[0.04em] flex-shrink-0',
          result.kind === 'team'
            ? 'bg-ink text-bg'
            : result.kind === 'tournament'
              ? 'bg-surface border border-border text-muted'
              : 'bg-accent text-accent-ink',
        ].join(' ')}
      >
        {result.kind === 'team'
          ? 'TM'
          : result.kind === 'tournament'
            ? <CalendarGlyph />
            : result.name.slice(0, 2).toUpperCase()}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-ink font-tight leading-tight truncate">
          {result.name}
        </span>
        {result.hint && (
          <span className="block text-[11px] text-faint font-tight truncate mt-0.5">
            {result.hint}
          </span>
        )}
      </span>
    </button>
  );
}

function ClearGlyph() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path
        d="M1 1L7 7M7 1L1 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
      <path d="M1.5 5.5h11M4.5 1.5v2M9.5 1.5v2" />
    </svg>
  );
}
