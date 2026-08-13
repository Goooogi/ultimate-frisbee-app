'use client';

// Event-scoped WFDF players view — who played at this event, grouped by team.
// Reached from the Players hub's event cards. Filters client-side over the
// already-fetched roster (bounded per-event, unlike the hub's global search).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { WfdfEventPlayersDetail, WfdfEventTeamPlayers } from '@/lib/wfdf/data';
import { WfdfFlag } from './wfdf-flag';
import { SearchBox, EmptyState } from './wfdf-teams-hub';

interface Props {
  event: WfdfEventPlayersDetail;
}

export function WfdfEventPlayers({ event }: Props) {
  const [query, setQuery] = useState('');

  // Teams arrive pre-grouped and pre-sorted from the data layer (finish order,
  // then jersey order within a team) — filtering here only narrows that order,
  // it never re-derives it.
  const groups = useMemo<WfdfEventTeamPlayers[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return event.teams;
    return event.teams
      .map((g) => {
        // A team-name hit keeps the whole roster; otherwise filter by player.
        if (g.teamName.toLowerCase().includes(q)) return g;
        const players = g.players.filter((p) => p.fullName.toLowerCase().includes(q));
        return players.length > 0 ? { ...g, players } : null;
      })
      .filter((g): g is WfdfEventTeamPlayers => g !== null);
  }, [event.teams, query]);

  const totalShown = groups.reduce((s, g) => s + g.players.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Filter players or teams…"
        count={query ? totalShown : event.totalPlayers}
        countLabel="players"
      />

      {groups.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        groups.map((g) => (
          <section key={g.teamId} aria-labelledby={`wfdf-event-players-${g.teamId}`}>
            <h2
              id={`wfdf-event-players-${g.teamId}`}
              className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3 pb-2 border-b border-hairline"
            >
              <Link href={`/wfdf/teams/${g.teamId}`} className="hover:text-ink transition-colors">
                <span className="inline-flex items-center gap-1.5">
                  <WfdfFlag flagFile={null} countryCode={g.countryCode} size={14} />
                  {g.teamName}
                </span>
              </Link>
              <span className="text-faint tabular">{g.players.length}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {g.players.map((p, i) => (
                <Link
                  key={`${p.teamId}-${p.fullName}-${i}`}
                  href={`/wfdf/players/by-name/${encodeURIComponent(p.fullName)}`}
                  className={[
                    'flex items-center gap-3 bg-surface rounded-card px-3 py-2.5',
                    'shadow-card no-underline transition-shadow hover:shadow-lift cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  ].join(' ')}
                >
                  {p.jerseyNumber && (
                    <span className="text-[12px] font-bold tabular w-5 text-right flex-shrink-0 text-faint">
                      {p.jerseyNumber}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink font-tight truncate">
                      {p.fullName}
                    </span>
                    {g.divisionName && (
                      <span className="block text-[10px] text-faint font-tight truncate">
                        {g.divisionName}
                      </span>
                    )}
                  </span>
                  {(p.goals != null || p.assists != null) && (
                    <span className="text-[11px] text-muted font-tight tabular flex-shrink-0">
                      {p.goals ?? 0}G · {p.assists ?? 0}A
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
