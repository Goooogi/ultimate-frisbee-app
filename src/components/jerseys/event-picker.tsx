'use client';

// EventPicker — "which events will you be at?" Multi-select chips.
//
// Same principle as EntityInput: free text always works. We suggest upcoming
// USAU events because that's the data we hold, but Windmill, WUCC, a local hat
// tournament, or "Boston area, most weekends" all need to be taggable. Picking
// a suggested event stores its id so the chip links to the event page; typing
// stores the plain string.

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface EventDraft {
  usauEventId: string | null;
  name: string;
  startsOn: string | null;
}

interface EventSuggestion {
  id: string;
  name: string;
  startDate: string | null;
}

export function EventPicker({
  value,
  onChange,
}: {
  value: EventDraft[];
  onChange: (v: EventDraft[]) => void;
}) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setSuggestions([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any;
      // Upcoming events only — you can't plan a meetup at a tournament that
      // already happened. Deliberately NOT listNextUpcomingEvents(), which is
      // narrowed to flagship events and would hide most local tournaments.
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await db
        .from('usau_events')
        .select('id, name, start_date')
        .gte('end_date', today)
        .ilike('name', `%${needle}%`)
        .order('start_date', { ascending: true })
        .limit(6);
      if (mine !== seq.current) return;
      setSuggestions(
        ((data ?? []) as { id: string; name: string; start_date: string | null }[]).map((e) => ({
          id: String(e.id),
          name: String(e.name),
          startDate: e.start_date ?? null,
        })),
      );
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function add(tag: EventDraft) {
    if (!tag.name.trim()) return;
    const dupe = value.some(
      (v) =>
        (tag.usauEventId && v.usauEventId === tag.usauEventId) ||
        v.name.toLowerCase() === tag.name.trim().toLowerCase(),
    );
    if (!dupe) onChange([...value, { ...tag, name: tag.name.trim() }]);
    setQ('');
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1.5" ref={boxRef}>
      <label htmlFor="jersey-events" className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
        Events you&rsquo;ll be at
      </label>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((e, i) => (
            <span
              key={`${e.usauEventId ?? e.name}-${i}`}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-ink/5 text-[11.5px] font-semibold text-ink font-tight"
            >
              {e.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`Remove ${e.name}`}
                className="w-4 h-4 grid place-items-center rounded-full text-faint hover:text-ink cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          id="jersey-events"
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add({ usauEventId: null, name: q, startsOn: null });
            }
          }}
          placeholder="Windmill, Nationals, a local hat tournament…"
          maxLength={160}
          autoComplete="off"
          className="w-full px-3 min-h-[44px] rounded-card bg-surface shadow-card text-[13.5px] text-ink font-tight placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        {open && q.trim().length >= 2 && (
          <div className="absolute z-30 left-0 right-0 top-[calc(100%+4px)] rounded-card bg-bg shadow-hero overflow-hidden max-h-[240px] overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => add({ usauEventId: s.id, name: s.name, startsOn: s.startDate })}
                className="w-full flex flex-col items-start px-3 py-2.5 text-left hover:bg-ink/5 cursor-pointer motion-safe:transition-colors"
              >
                <span className="text-[13px] font-semibold text-ink font-tight">{s.name}</span>
                {s.startDate && (
                  <span className="text-[10.5px] text-faint font-tight">{formatDate(s.startDate)}</span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => add({ usauEventId: null, name: q, startsOn: null })}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-ink/5 cursor-pointer border-t border-hairline/60"
            >
              <span className="text-[12.5px] text-muted font-tight">
                Add <span className="font-bold text-ink">&ldquo;{q.trim()}&rdquo;</span>
              </span>
            </button>
          </div>
        )}
      </div>
      <p className="text-[10.5px] text-faint font-tight">
        Any event works — press Enter to add one we don&rsquo;t list.
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
