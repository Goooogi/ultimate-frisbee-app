'use client';

// Players-page client list: big search bar at the top, results filter
// live underneath. Renders either the UFA stats table or the USAU stint
// list, depending on which dataset the server passed in.

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamLogo } from '@/components/team-logo';
import { teamMetaByAbbr } from '@/lib/ufa/teams';
import { SearchGlyph } from '@/components/search-modal';
import type { UfaPlayerStat } from '@/lib/ufa/types';
import { searchUfaPlayers } from '@/lib/ufa/search-actions';
import { listUsauPlayers, type UsauPlayerListRow } from '@/lib/usau/data';
import type { UsauDivision } from '@/lib/league';

type Mode =
  | {
      kind: 'ufa';
      stats: UfaPlayerStat[];
      /** Set of teamIDs that won the championship the year these stats
       *  cover. Used to mark champion rows with a trophy chip. */
      championTeamIds: string[];
      /** The year the prefetched stats cover. Used by the on-demand
       *  search server action so it queries the same season. */
      year: number;
    }
  | { kind: 'usau'; players: UsauPlayerListRow[]; division: UsauDivision };

interface Props {
  mode: Mode;
  /** Label shown next to the result count (e.g. "2026 UFA leaders"). */
  scopeLabel: string;
}

export function PlayersSearchList({ mode, scopeLabel }: Props) {
  const [raw, setRaw] = useState('');
  const query = useDeferredValue(raw);
  const needle = query.trim().toLowerCase();

  // When the user types ≥ 2 chars, re-query the full dataset on the
  // server so matches outside the prefetched top-200 still show up.
  // Both leagues share the same shape: a debounced effect that flips a
  // single results buffer typed to whichever league is active.
  const [usauSearchResults, setUsauSearchResults] = useState<UsauPlayerListRow[] | null>(null);
  const [ufaSearchResults, setUfaSearchResults] = useState<UfaPlayerStat[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = needle;
    if (q.length < 2) {
      setUsauSearchResults(null);
      setUfaSearchResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    // 200ms debounce — matches the global search modal's cadence.
    const t = setTimeout(async () => {
      try {
        if (mode.kind === 'usau') {
          const rows = await listUsauPlayers({
            limit: 200,
            search: q,
            genderDivision: mode.division,
          });
          if (!cancelled) {
            setUsauSearchResults(rows);
            setUfaSearchResults(null);
          }
        } else {
          const rows = await searchUfaPlayers(q, mode.year);
          if (!cancelled) {
            setUfaSearchResults(rows);
            setUsauSearchResults(null);
          }
        }
      } catch {
        if (!cancelled) {
          if (mode.kind === 'usau') setUsauSearchResults([]);
          else setUfaSearchResults([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, needle]);

  const filtered = useMemo(() => {
    if (!needle) return mode;
    if (mode.kind === 'ufa') {
      // Prefer server-side full-leaderboard search when present (catches
      // role players outside the prefetched top 200, e.g. Carter
      // Hawkins). Otherwise fall back to a client filter over the
      // prefetched set — covers the still-loading and < 2 char cases.
      if (ufaSearchResults != null) {
        return {
          kind: 'ufa' as const,
          stats: ufaSearchResults,
          championTeamIds: mode.championTeamIds,
          year: mode.year,
        };
      }
      return {
        kind: 'ufa' as const,
        stats: mode.stats.filter((p) => p.name.toLowerCase().includes(needle)),
        championTeamIds: mode.championTeamIds,
        year: mode.year,
      };
    }
    if (usauSearchResults != null) {
      return { kind: 'usau' as const, players: usauSearchResults, division: mode.division };
    }
    return {
      kind: 'usau' as const,
      players: mode.players.filter((p) => {
        if (p.displayName.toLowerCase().includes(needle)) return true;
        return p.latestTeam?.toLowerCase().includes(needle) ?? false;
      }),
      division: mode.division,
    };
  }, [mode, needle, ufaSearchResults, usauSearchResults]);

  const count =
    filtered.kind === 'ufa' ? filtered.stats.length : filtered.players.length;
  const totalCount =
    mode.kind === 'ufa' ? mode.stats.length : mode.players.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero search */}
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        >
          <SearchGlyph size={18} />
        </span>
        <input
          type="search"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={
            mode.kind === 'ufa'
              ? 'Search UFA players by name…'
              : 'Search USAU players by name or team…'
          }
          aria-label="Search players"
          className={[
            'w-full bg-surface border border-border rounded-md',
            'pl-12 pr-4 py-3.5 text-[15px] text-ink font-tight placeholder:text-faint',
            'focus-visible:outline-none focus-visible:border-accent transition-colors',
          ].join(' ')}
        />
      </div>

      {/* Count line */}
      <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-hairline">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          {scopeLabel}
        </span>
        <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
          {searching
            ? 'Searching…'
            : needle
              ? (mode.kind === 'usau' && usauSearchResults != null) ||
                (mode.kind === 'ufa' && ufaSearchResults != null)
                ? `${count} ${count === 1 ? 'match' : 'matches'}`
                : `${count} of ${totalCount}`
              : `${totalCount} ${totalCount === 1 ? 'player' : 'players'}`}
        </span>
      </div>

      {/* List */}
      {searching && count === 0 ? null : count === 0 ? (
        <EmptyState query={needle} />
      ) : filtered.kind === 'ufa' ? (
        <UfaList stats={filtered.stats} championTeamIds={filtered.championTeamIds} />
      ) : (
        <UsauList players={filtered.players} />
      )}
    </div>
  );
}

function UfaList({
  stats,
  championTeamIds,
}: {
  stats: UfaPlayerStat[];
  championTeamIds: string[];
}) {
  const champSet = new Set(championTeamIds.map((id) => id.toLowerCase()));
  const thBase =
    'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted border-b border-border whitespace-nowrap text-right';
  return (
    <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className={`${thBase} text-left`} scope="col">Player</th>
            <th className={thBase} scope="col">GP</th>
            <th className={thBase} scope="col">G</th>
            <th className={thBase} scope="col">A</th>
            <th className={thBase} scope="col">Scr</th>
            <th className={thBase} scope="col">+/−</th>
            <th className={thBase} scope="col">Blk</th>
            <th className={thBase} scope="col">Cmp%</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((p, i) => {
            const teamAbbr =
              typeof p.teamID === 'string'
                ? p.teamID
                : typeof p.teamAbbrev === 'string'
                  ? (p.teamAbbrev as string)
                  : null;
            const team = teamAbbr ? teamMetaByAbbr(teamAbbr) : null;
            const isChamp = teamAbbr ? champSet.has(teamAbbr.toLowerCase()) : false;
            return (
              <tr key={p.playerID} className="hover:bg-surface-hi transition-colors duration-100">
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left">
                  <Link
                    href={`/players/${p.playerID}`}
                    className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity no-underline"
                  >
                    <span className="tabular text-[10px] font-bold text-faint font-tight w-5 text-right">
                      {i + 1}
                    </span>
                    {team && <TeamLogo team={team} size={22} />}
                    <span className="font-medium font-tight text-ink">{p.name}</span>
                    {isChamp && <TrophyChip title="Reigning UFA Champion" />}
                  </Link>
                </td>
                <Cell value={p.gamesPlayed} />
                <Cell value={p.goals} />
                <Cell value={p.assists} />
                <Cell value={p.scores} bold />
                <Cell value={signed(p.plusMinus)} />
                <Cell value={p.blocks} />
                <Cell value={p.completionPercentage ? `${p.completionPercentage}%` : '—'} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ value, bold }: { value: string | number | undefined; bold?: boolean }) {
  return (
    <td
      className={[
        'px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular font-tight',
        bold ? 'text-ink font-semibold' : 'text-muted',
      ].join(' ')}
    >
      {value ?? '—'}
    </td>
  );
}

function signed(n: number | undefined | null): string {
  if (n == null) return '0';
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

function UsauList({ players }: { players: UsauPlayerListRow[] }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
      {players.map((p, i) => (
        <li key={p.id} className="bg-surface">
          <Link
            href={`/players/${p.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hi transition-colors no-underline"
          >
            <span className="tabular text-[11px] font-bold text-faint font-tight w-6 text-right">
              {i + 1}
            </span>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-[14px] font-semibold text-ink font-tight truncate">
                  {p.displayName}
                </span>
                {p.championYears.length > 0 && (
                  <TrophyChip
                    title={
                      p.championYears.length === 1
                        ? `USAU National Champion · ${p.championYears[0]}`
                        : `${p.championYears.length}× USAU National Champion`
                    }
                  />
                )}
              </span>
              {p.latestTeam && (
                <span className="text-[11px] text-muted font-tight truncate">
                  {p.latestTeam}
                  {p.latestSeason && ` · ${p.latestSeason}`}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight whitespace-nowrap">
              {p.appearances} {p.appearances === 1 ? 'stint' : 'stints'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TrophyChip({ title }: { title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-accent text-accent-ink flex-shrink-0"
    >
      <svg width="10" height="10" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M6 3h10v5a5 5 0 0 1-10 0V3Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6 5H3v2a2 2 0 0 0 2 2M16 5h3v2a2 2 0 0 1-2 2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M11 13v3M8 19h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center bg-surface border border-border rounded-md">
      <div className="text-[13px] font-semibold uppercase tracking-[0.18em] text-muted mb-1 font-tight">
        No matches
      </div>
      <div className="text-[12px] text-faint font-tight">
        {query ? `Nothing for "${query}".` : 'Try a different search.'}
      </div>
    </div>
  );
}
