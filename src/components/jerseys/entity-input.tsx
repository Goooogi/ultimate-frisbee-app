'use client';

// EntityInput — a free-text field that ALSO suggests matches from our data.
//
// The critical property: whatever you type is always valid. Suggestions are a
// convenience, never a gate. Ultimate is international and we only hold data
// for 5 leagues — a Clapham or Ragnarok jersey has to be postable, so this is
// a text input with autocomplete, NOT a select.
//
// Picking a suggestion additionally captures the structured ref (league +
// teamId + logo) so the listing can render a real crest and link. Typing
// something we don't know just stores the string.

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchAll } from '@/lib/ufa/search-actions';
import type { SearchResult } from '@/lib/usau/search-nav';

export interface EntityValue {
  name: string;
  league: string | null;
  entityId: string | null;
  logoUrl: string | null;
}

export function EntityInput({
  kind,
  value,
  onChange,
  label,
  placeholder,
  id,
}: {
  kind: 'team' | 'player';
  value: EntityValue;
  onChange: (v: EntityValue) => void;
  label: string;
  placeholder: string;
  id: string;
}) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const seq = useRef(0);

  // Debounced lookup. Structured data is a bonus, so a failed search silently
  // leaves the user with plain text rather than blocking them.
  useEffect(() => {
    const q = value.name.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const all = await searchAll(q, 12);
        if (mine !== seq.current) return;
        setResults(all.filter((r) => r.kind === kind).slice(0, 6));
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [value.name, kind]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = useCallback(
    (r: SearchResult) => {
      onChange({
        name: r.name,
        league: r.league ?? null,
        entityId: r.id,
        logoUrl: r.logoUrl ?? null,
      });
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-1.5" ref={boxRef}>
      <label htmlFor={id} className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
        {label}
      </label>
      <div className="relative">
        <div className="flex items-center gap-2 px-3 min-h-[44px] rounded-card bg-surface shadow-card focus-within:ring-2 focus-within:ring-accent">
          {value.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.logoUrl} alt="" className="w-6 h-6 rounded-full object-contain bg-white flex-shrink-0" />
          )}
          <input
            id={id}
            type="text"
            value={value.name}
            placeholder={placeholder}
            onChange={(e) => {
              // Typing invalidates any previously picked structured ref — the
              // name no longer necessarily refers to that entity.
              onChange({ name: e.target.value, league: null, entityId: null, logoUrl: null });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            maxLength={120}
            autoComplete="off"
            className="flex-1 bg-transparent text-[13.5px] text-ink font-tight placeholder:text-faint focus:outline-none py-2.5"
          />
          {value.name && (
            <button
              type="button"
              onClick={() => onChange({ name: '', league: null, entityId: null, logoUrl: null })}
              aria-label={`Clear ${label}`}
              className="w-6 h-6 grid place-items-center rounded-full text-faint hover:text-ink cursor-pointer flex-shrink-0"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {open && (results.length > 0 || loading) && (
          <div className="absolute z-30 left-0 right-0 top-[calc(100%+4px)] rounded-card bg-bg shadow-hero overflow-hidden max-h-[260px] overflow-y-auto">
            {loading && results.length === 0 && (
              <p className="px-3 py-2.5 text-[12px] text-faint font-tight">Searching…</p>
            )}
            {results.map((r) => (
              <button
                key={`${r.league}-${r.id}`}
                type="button"
                onClick={() => pick(r)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-ink/5 cursor-pointer motion-safe:transition-colors"
              >
                {r.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logoUrl} alt="" className="w-6 h-6 rounded-full object-contain bg-white flex-shrink-0" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-ink/8 flex-shrink-0" aria-hidden="true" />
                )}
                <span className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold text-ink font-tight truncate">{r.name}</span>
                  {r.hint && <span className="text-[10.5px] text-faint font-tight truncate">{r.hint}</span>}
                </span>
              </button>
            ))}
            <p className="px-3 py-2 text-[10.5px] text-faint font-tight border-t border-hairline/60">
              Not listed? Just type it — any team or player works.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
