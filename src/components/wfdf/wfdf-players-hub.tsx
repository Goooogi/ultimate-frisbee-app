'use client';

// WFDF Players hub — search-first index of every named roster player. The corpus
// is large (~21k appearances), so we DON'T ship it to the client: the page hands
// us cheap per-event totals for the browse state, and search runs server-side
// via the searchWfdfPlayers action (indexed ilike). Name links resolve to a
// unified profile via /wfdf/players/by-name/[name].

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { WfdfPlayerHubRow } from '@/lib/wfdf/data';
import { searchWfdfPlayers } from '@/app/wfdf/players/actions';
import { WfdfFlag } from './wfdf-flag';
import { SearchBox, EmptyState } from './wfdf-teams-hub';

interface Props {
  eventTotals: { slug: string; name: string; year: number; playerCount: number }[];
  totalPlayers: number;
}

// Server search caps at 500; show all it returns (it's already bounded).
export function WfdfPlayersHub({ eventTotals, totalPlayers }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WfdfPlayerHubRow[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const q = query.trim();
  const searching = q.length >= 2;

  // Debounced server search. Each keystroke bumps reqId so a slow earlier
  // response can't overwrite a newer one (last-write-wins by request id).
  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchWfdfPlayers(q);
        if (reqId.current === id) setResults(rows);
      } catch {
        if (reqId.current === id) setResults([]);
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col gap-6">
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Search players by name…"
        count={searching ? results.length : totalPlayers}
        countLabel={searching ? 'matches' : 'appearances'}
      />

      {!searching ? (
        <div>
          <p className="text-[11px] text-muted font-tight mb-3">
            {q.length === 1
              ? 'Keep typing…'
              : 'Search for a player by name, or open an event to browse its rosters.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {eventTotals.map((e) => (
              <Link
                key={e.slug}
                href={`/wfdf/events/${e.slug}`}
                className={[
                  'flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3',
                  'no-underline hover:border-ink transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                ].join(' ')}
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink font-tight truncate">
                    {e.name}
                  </span>
                  <span className="block text-[10px] text-faint font-tight uppercase tracking-[0.14em]">
                    Rosters
                  </span>
                </span>
                <span className="text-[13px] font-bold tabular text-muted flex-shrink-0">
                  {e.playerCount}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : loading ? (
        <div className="flex flex-col divide-y divide-hairline rounded-lg border border-border bg-surface overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[52px] px-4 flex items-center">
              <div className="h-4 w-40 rounded bg-[rgb(var(--ink)/0.06)] animate-pulse" />
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border bg-surface overflow-hidden">
          {results.map((p, i) => (
            <li key={`${p.teamId}-${p.fullName}-${i}`}>
              <Link
                href={`/wfdf/players/by-name/${encodeURIComponent(p.fullName)}`}
                className={[
                  'flex items-center gap-3 px-4 py-2.5 no-underline',
                  'hover:bg-[rgb(var(--surface-hi))] transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                ].join(' ')}
              >
                <WfdfFlag flagFile={null} countryCode={p.countryCode} size={16} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-ink font-tight truncate">
                    {p.fullName}
                  </span>
                  <span className="block text-[11px] text-muted font-tight truncate">
                    {p.teamName} · {p.eventName}
                  </span>
                </span>
                {(p.goals != null || p.assists != null) && (
                  <span className="text-[11px] text-faint font-tight tabular flex-shrink-0">
                    {p.goals ?? 0}G · {p.assists ?? 0}A
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
