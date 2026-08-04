'use client';

// EUF event detail — one EUCS tournament, structured to match the USAU event
// page (src/components/usau/usau-event-detail.tsx):
//
//   Champion banner  →  division tabs  →  view tabs (Standings / Pools /
//   Crossovers / Bracket)
//
// It used to render every section stacked on one endless scroll — standings,
// then the bracket tree, then a flat list per round — which put a 40-game pool
// dump between the reader and the bracket. Tabs mean one subject at a time, the
// same way the USAU page reads.
//
// EUCS has a fixed 3-division vocabulary (Open / Women's / Mixed), so pill tabs
// are right here rather than a dropdown (the 5+ rule doesn't apply).
//
// Standings are DERIVED from games (get_euf_standings): Ultiorganizer publishes
// no team records or final placements, so ranking is final_placement → win% →
// point diff.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { EufDivision, EufGameCard, EufStandingRow } from '@/lib/euf/data';
import { eufGameDate, eufGameTime, eufDayKey } from '@/lib/euf/format-date';
import { EufFlag } from './euf-flag';
import { EufBracketTree, hasEufBracket } from './euf-bracket-tree';

interface Props {
  divisions: EufDivision[];
  standings: EufStandingRow[];
  games: EufGameCard[];
  /** Outbound link back to the Ultiorganizer schedule site, mirroring USAU's
   *  "View on USAU". Null when the event's source_origin/season_id aren't set. */
  sourceUrl: string | null;
}

type ViewTab = 'standings' | 'pools' | 'crossovers' | 'bracket';

// Bracket rounds read best latest-first (final at the top); pools read as-is.
const STAGE_ORDER: Record<string, number> = {
  final: 0,
  semifinal: 1,
  quarterfinal: 2,
  bracket: 3,
  crossover: 4,
  placement: 5,
  pool: 6,
  other: 7,
};

/** Rounds the bracket TREE already draws — excluded from the flat lists so a
 *  game is never shown twice. Mirrors bracketOf() in euf-bracket-tree.tsx,
 *  which accepts the range on either side of the word ("Bracket 1-8 Finals"
 *  and EUCF 2023's "1-16 Bracket Finals"). */
const TREE_ROUND_RE = /^(?:Bracket \d+-\d+|\d+-\d+ Bracket)(?:\s+(?:Quarterfinals|Semifinals|Finals))?$/;

export function EufEventDetail({ divisions, standings, games, sourceUrl }: Props) {
  const [activeDiv, setActiveDiv] = useState<EufDivision>(divisions[0] ?? 'Open');

  const divStandings = useMemo(
    () => standings.filter((s) => s.division === activeDiv),
    [standings, activeDiv],
  );

  const divGames = useMemo(() => games.filter((g) => g.division === activeDiv), [games, activeDiv]);
  const showTree = useMemo(() => hasEufBracket(divGames), [divGames]);

  // Placement labels on the bracket cards come from the STORED final_placement
  // (see euf-bracket-tree.tsx) — the standings rows already carry it.
  const placements = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of divStandings) if (s.finalPlacement != null) m.set(s.teamId, s.finalPlacement);
    return m;
  }, [divStandings]);

  // The champion is the team that finished 1st — read off the STORED placement,
  // never re-derived here (same drift rule as the bracket labels). Pool-only
  // events have no placements, so they fall back to the standings leader.
  const champion = useMemo(() => {
    const first = divStandings.find((s) => s.finalPlacement === 1);
    if (first) return { row: first, derived: false };
    if (divStandings.length > 0 && divStandings.every((s) => s.finalPlacement == null)) {
      const top = divStandings[0];
      // Only claim a leader when they're clear of the field on record.
      if (top && top.games > 0 && (divStandings[1] == null || top.wins > divStandings[1].wins)) {
        return { row: top, derived: true };
      }
    }
    return null;
  }, [divStandings]);

  // ── Split games into the tab buckets ──────────────────────────────────────
  const poolRounds = useMemo(() => groupRounds(divGames.filter((g) => g.stage === 'pool')), [divGames]);
  const crossoverGames = useMemo(
    () => divGames.filter((g) => g.stage === 'crossover'),
    [divGames],
  );
  // Everything bracket-ish that the tree does NOT draw: placement games, and
  // the odd one-off round ("1st Place", "Pre-Quarter").
  const otherBracketRounds = useMemo(
    () =>
      groupRounds(
        divGames.filter(
          (g) =>
            g.stage !== 'pool' &&
            g.stage !== 'crossover' &&
            !(showTree && TREE_ROUND_RE.test(g.roundName ?? '')),
        ),
      ),
    [divGames, showTree],
  );

  const hasBracket = showTree || otherBracketRounds.length > 0;
  const TABS: Array<{ key: ViewTab; label: string; show: boolean }> = [
    { key: 'standings',  label: 'Standings',  show: divStandings.length > 0 },
    { key: 'pools',      label: 'Pools',      show: poolRounds.length > 0 },
    { key: 'crossovers', label: 'Crossovers', show: crossoverGames.length > 0 },
    { key: 'bracket',    label: 'Bracket',    show: hasBracket },
  ];
  const visibleTabs = TABS.filter((t) => t.show);
  // Bias to Bracket — the headline of a finished tournament — then standings.
  const defaultTab: ViewTab = hasBracket
    ? 'bracket'
    : (visibleTabs[0]?.key ?? 'standings');

  const [tab, setTab] = useState<ViewTab>(defaultTab);
  // Switching division can change which tabs exist; keep the active one valid.
  const active = visibleTabs.some((t) => t.key === tab) ? tab : defaultTab;

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1 — "View on EUCS" link (left) + division tabs (right), one
          compact header row on mobile — mirrors the USAU event page's
          link + Level/Division row. */}
      {(sourceUrl || divisions.length > 1) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {sourceUrl ? <EufExternalLink url={sourceUrl} /> : <span />}
          {divisions.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {divisions.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setActiveDiv(d)}
                  aria-pressed={d === activeDiv}
                  className={[
                    'px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.06em] uppercase font-tight',
                    'transition-colors cursor-pointer border',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    d === activeDiv
                      ? 'bg-ink text-surface border-ink'
                      : 'bg-transparent text-muted border-hairline hover:text-ink',
                  ].join(' ')}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Champion — leads the page so the headline result is the first thing
          seen, even though the bracket tree scrolls horizontally on mobile. */}
      {champion && <ChampionBanner row={champion.row} derived={champion.derived} />}

      {/* View tabs — edge-bleed horizontal scroll on mobile so nothing clips
          (same treatment as the USAU event page). */}
      {visibleTabs.length > 1 && (
        <div
          role="tablist"
          aria-label="Tournament views"
          className="-mx-5 px-5 md:mx-0 md:px-0 flex gap-2 overflow-x-auto scrollbar-none"
        >
          {visibleTabs.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                className={[
                  'shrink-0 inline-flex items-center justify-center px-4 min-h-[40px] rounded-full',
                  'text-[11px] font-bold tracking-[0.14em] uppercase font-tight cursor-pointer',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  on ? 'bg-ink text-bg' : 'bg-ink/5 text-muted hover:text-ink',
                ].join(' ')}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Standings ─────────────────────────────────────────────────────── */}
      {active === 'standings' && (
        <section aria-label="Standings">
          {divStandings.length === 0 ? (
            <p className="text-muted font-tight text-[13px] py-4">No standings available.</p>
          ) : (
            <div className="overflow-x-auto">
              {/* No min-width: W/L/Diff are narrow enough to fit a 390px phone
                  without horizontal scroll, which is where most of this is read. */}
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
                    <th className="text-right py-2 pr-2 font-bold w-8">#</th>
                    <th className="text-left py-2 pr-2 font-bold">Team</th>
                    <th className="text-right py-2 px-2 font-bold">W</th>
                    <th className="text-right py-2 px-2 font-bold">L</th>
                    <th className="text-right py-2 pl-2 font-bold">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {divStandings.map((s) => (
                    <tr key={s.teamId} className="border-t border-hairline">
                      <td className="text-right py-2 pr-2 text-[12px] font-tight tabular-nums text-muted">
                        {s.finalPlacement ?? ''}
                      </td>
                      <td className="py-2 pr-2">
                        <Link
                          href={`/euf/teams/${s.teamId}`}
                          className="inline-flex items-center gap-2 no-underline hover:underline text-ink font-tight text-[13px]"
                        >
                          <EufFlag countryName={s.countryName} size={14} />
                          <span className="truncate">{s.teamName}</span>
                        </Link>
                      </td>
                      <td className="text-right py-2 px-2 font-tight text-[13px] text-ink tabular-nums">
                        {s.wins}
                      </td>
                      <td className="text-right py-2 px-2 font-tight text-[13px] text-muted tabular-nums">
                        {s.losses}
                      </td>
                      <td className="text-right py-2 pl-2 font-tight text-[13px] text-muted tabular-nums">
                        {s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Pools ─────────────────────────────────────────────────────────── */}
      {active === 'pools' && <RoundSections rounds={poolRounds} />}

      {/* ── Crossovers ────────────────────────────────────────────────────── */}
      {active === 'crossovers' && (
        <RoundSections rounds={[['Crossovers', crossoverGames]]} hideHeading />
      )}

      {/* ── Bracket — tree + any placement rounds it doesn't draw ─────────── */}
      {active === 'bracket' && (
        <div className="flex flex-col gap-6">
          {/* EUCS "Finals" is 4 simultaneous placement games, so the tree labels
              which places each one decides. */}
          {showTree && <EufBracketTree games={divGames} placements={placements} />}
          <RoundSections rounds={otherBracketRounds} />
        </div>
      )}

      {visibleTabs.length === 0 && (
        <p className="text-[12px] text-faint font-tight">
          No games or standings loaded for this division yet.
        </p>
      )}
    </div>
  );
}

/** Group games by round label, ordered by stage then label. */
function groupRounds(games: EufGameCard[]): Array<[string, EufGameCard[]]> {
  const byRound = new Map<string, EufGameCard[]>();
  for (const g of games) {
    const k = g.roundName ?? 'Games';
    if (!byRound.has(k)) byRound.set(k, []);
    byRound.get(k)!.push(g);
  }
  return [...byRound.entries()].sort((a, b) => {
    const sa = STAGE_ORDER[a[1][0]?.stage ?? 'other'] ?? 9;
    const sb = STAGE_ORDER[b[1][0]?.stage ?? 'other'] ?? 9;
    return sa !== sb ? sa - sb : a[0].localeCompare(b[0]);
  });
}

/** A round heading + its games, each round split into day groups so a two-day
 *  pool reads as Saturday's slate then Sunday's rather than one flat run. The
 *  day sub-heading is skipped when the round happened on a single day (which is
 *  most of them) — it would just repeat the event header. */
function RoundSections({
  rounds,
  hideHeading = false,
}: {
  rounds: Array<[string, EufGameCard[]]>;
  hideHeading?: boolean;
}) {
  if (rounds.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      {rounds.map(([round, list]) => {
        const days = groupDays(list);
        const multiDay = days.length > 1;
        return (
          <section key={round}>
            {!hideHeading && (
              <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-2 border-b border-hairline">
                {round}
              </h2>
            )}
            {days.map(([day, dayGames]) => (
              <div key={day}>
                {multiDay && (
                  <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight mt-3 mb-1">
                    {day === 'undated' ? 'Date TBD' : eufGameDate(dayGames[0].scheduledAt)}
                  </p>
                )}
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 list-none p-0 m-0 mt-2">
                  {dayGames.map((g) => (
                    <GameRow key={g.id} game={g} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function groupDays(games: EufGameCard[]): Array<[string, EufGameCard[]]> {
  const byDay = new Map<string, EufGameCard[]>();
  for (const g of games) {
    const k = eufDayKey(g.scheduledAt) ?? 'undated';
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(g);
  }
  return [...byDay.entries()].sort((a, b) =>
    a[0] === 'undated' ? 1 : b[0] === 'undated' ? -1 : a[0].localeCompare(b[0]),
  );
}

/** One game as a card — date/time + field meta, both teams, box-score link.
 *  Card-per-game in a 2-up grid rather than the old flat rows: it matches the
 *  USAU GameRow and gives the time somewhere to live. */
function GameRow({ game: g }: { game: EufGameCard }) {
  const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
  const awayWon = (g.awayScore ?? 0) > (g.homeScore ?? 0);

  const time = eufGameTime(g.scheduledAt);
  const date = eufGameDate(g.scheduledAt);
  // `field` is usually a bare number; only prefix "Field" for that form so we
  // don't render "Field Pitch 3 (Main)".
  const fieldLabel = g.field
    ? /^\d+[A-Za-z]?$/.test(g.field.trim())
      ? `Field ${g.field.trim()}`
      : g.field.trim()
    : null;
  const meta = [date || null, time || null, fieldLabel].filter(Boolean).join(' · ');

  return (
    <li className="bg-surface rounded-card-sm shadow-soft p-3">
      <div className="flex items-center justify-between gap-2 mb-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight">
        {meta ? (
          <span className="text-muted truncate">{meta}</span>
        ) : (
          <span className="text-faint">—</span>
        )}
        <span className="flex items-center gap-2 flex-shrink-0">
          {g.status === 'forfeit' && <span className="text-muted">FF</span>}
          {/* Box score lives on the game page. The team names below are their
              own links, so this is a separate affordance rather than wrapping
              the whole row. */}
          <Link
            href={`/euf/g/${g.id}`}
            aria-label={`Box score: ${g.homeName} vs ${g.awayName}`}
            className="text-muted no-underline hover:text-accent transition-colors"
          >
            Box
          </Link>
        </span>
      </div>
      <TeamLine
        id={g.homeTeamId}
        name={g.homeName}
        country={g.homeCountry}
        score={g.homeScore}
        won={homeWon}
      />
      <TeamLine
        id={g.awayTeamId}
        name={g.awayName}
        country={g.awayCountry}
        score={g.awayScore}
        won={awayWon}
      />
    </li>
  );
}

/** External link back to the Ultiorganizer schedule site — mirrors USAU's
 *  UsauExternalLink (same markup/placement, "View on EUCS" instead). Exported
 *  so the game page (/euf/g/[id]) can reuse the identical affordance. */
export function EufExternalLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View on EUCS"
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold tracking-[0.14em] uppercase font-tight bg-ink/5 text-ink hover:bg-ink/10 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent no-underline"
    >
      View on EUCS
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 1.5h5.5V7" />
        <path d="M8.5 1.5L3.5 6.5" />
        <path d="M7 8.5H1.5V3" />
      </svg>
    </a>
  );
}

function ChampionBanner({ row, derived }: { row: EufStandingRow; derived: boolean }) {
  const Inner = (
    <span className="flex items-center gap-3 min-w-0">
      <EufFlag countryName={row.countryName} size={26} />
      <span className="flex flex-col min-w-0">
        <span className="font-display italic font-bold text-[20px] lg:text-[24px] leading-none tracking-[-0.02em] text-ink truncate pr-[0.1em] pb-[0.12em] -mb-[0.12em]">
          {row.teamName}
        </span>
        <span className="text-[11px] text-muted font-tight truncate mt-1">
          {derived ? 'Best record' : 'Champion'} ·{' '}
          <span className="tabular-nums">
            {row.wins}–{row.losses}
          </span>
          {row.countryName ? ` · ${row.countryName}` : ''}
        </span>
      </span>
    </span>
  );

  return (
    <section
      aria-label={derived ? 'Pool leader' : 'Champion'}
      className="rounded-card-lg shadow-card bg-surface overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline bg-accent/[0.06]">
        <TrophyIcon />
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
          {derived ? 'Pool leader' : 'Champion'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <Link
          href={`/euf/teams/${row.teamId}`}
          className="min-w-0 flex-1 hover:opacity-80 transition-opacity no-underline"
        >
          {Inner}
        </Link>
      </div>
    </section>
  );
}

function TrophyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path
        d="M4 2h8v3a4 4 0 01-8 0V2zM4 3H2v1a2 2 0 002 2M12 3h2v1a2 2 0 01-2 2M6 9.5V11m4-1.5V11M5 14h6M6.5 11h3l.5 3h-4l.5-3z"
        stroke="rgb(var(--accent))"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TeamLine({
  id,
  name,
  country,
  score,
  won,
}: {
  id: string | null;
  name: string;
  country: string | null;
  score: number | null;
  won: boolean;
}) {
  const inner = (
    <>
      <EufFlag countryName={country} size={13} />
      <span className={['truncate', won ? 'text-ink font-semibold' : 'text-muted'].join(' ')}>
        {name}
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-2 text-[13px] font-tight">
      {id ? (
        <Link
          href={`/euf/teams/${id}`}
          className="flex items-center gap-2 min-w-0 flex-1 no-underline hover:underline"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex items-center gap-2 min-w-0 flex-1">{inner}</span>
      )}
      <span
        className={['tabular-nums flex-shrink-0', won ? 'text-ink font-bold' : 'text-muted'].join(
          ' ',
        )}
      >
        {score ?? '–'}
      </span>
    </div>
  );
}
