'use client';

// WFDF Teams hub — every WFDF team across all events, grouped by event with a
// live search box. WFDF has no single league feed, so "Teams" means the union
// of all event rosters; grouping by event keeps it legible.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { WfdfTeamHubRow } from '@/lib/wfdf/data';
import { WfdfFlag } from './wfdf-flag';

interface Props {
  teams: WfdfTeamHubRow[];
}

interface EventGroup {
  slug: string;
  name: string;
  year: number;
  teams: WfdfTeamHubRow[];
}

export function WfdfTeamsHub({ teams }: Props) {
  const [query, setQuery] = useState('');

  const groups = useMemo<EventGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? teams.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.countryCode ?? '').toLowerCase().includes(q) ||
            t.eventName.toLowerCase().includes(q),
        )
      : teams;

    const byEvent = new Map<string, EventGroup>();
    for (const t of filtered) {
      let g = byEvent.get(t.eventSlug);
      if (!g) {
        g = { slug: t.eventSlug, name: t.eventName, year: t.eventYear, teams: [] };
        byEvent.set(t.eventSlug, g);
      }
      g.teams.push(t);
    }
    const out = [...byEvent.values()];
    // Newest event first; teams within an event by finish then name.
    out.sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
    for (const g of out) {
      g.teams.sort(
        (a, b) => (a.finalStanding ?? 999) - (b.finalStanding ?? 999) || a.name.localeCompare(b.name),
      );
    }
    return out;
  }, [teams, query]);

  const totalShown = groups.reduce((s, g) => s + g.teams.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Search teams, countries, events…"
        count={query ? totalShown : teams.length}
        countLabel="teams"
      />

      {groups.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        groups.map((g) => (
          <section key={g.slug} aria-labelledby={`wfdf-teams-${g.slug}`}>
            <h2
              id={`wfdf-teams-${g.slug}`}
              className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3 pb-2 border-b border-hairline"
            >
              <Link href={`/wfdf/events/${g.slug}`} className="hover:text-ink transition-colors">
                {g.name}
              </Link>
              <span className="text-faint tabular">{g.teams.length}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {g.teams.map((t) => (
                <Link
                  key={t.id}
                  href={`/wfdf/teams/${t.id}`}
                  className={[
                    'flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5',
                    'no-underline hover:border-ink transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  ].join(' ')}
                >
                  {t.finalStanding != null && (
                    <span
                      className={[
                        'text-[12px] font-bold tabular w-5 text-right flex-shrink-0',
                        t.finalStanding <= 3 ? 'text-accent' : 'text-faint',
                      ].join(' ')}
                    >
                      {t.finalStanding}
                    </span>
                  )}
                  <WfdfFlag flagFile={t.flagFile} countryCode={t.countryCode} size={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink font-tight truncate">
                      {t.name}
                    </span>
                    {t.divisionName && (
                      <span className="block text-[10px] text-faint font-tight truncate">
                        {t.divisionName}
                      </span>
                    )}
                  </span>
                  {(t.wins != null || t.losses != null) && (
                    <span className="text-[11px] text-muted font-tight tabular flex-shrink-0">
                      {t.wins ?? 0}–{t.losses ?? 0}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

// ─── Shared hub bits (also used by the players hub) ──────────────────────────

export function SearchBox({
  value,
  onChange,
  placeholder,
  count,
  countLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  count: number;
  countLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={[
            'w-full h-11 pl-9 pr-3 rounded-lg border border-border bg-surface',
            'text-[14px] font-tight text-ink placeholder:text-faint',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
          ].join(' ')}
        />
      </div>
      <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-faint font-tight tabular flex-shrink-0">
        {count} {countLabel}
      </span>
    </div>
  );
}

export function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-10 text-center">
      <p className="text-muted font-tight text-[14px]">
        {query ? `No matches for “${query}”.` : 'Nothing here yet.'}
      </p>
    </div>
  );
}
