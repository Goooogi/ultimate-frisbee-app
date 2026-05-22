// /players/[id] — unified player profile.
//
// Branches on id shape:
//   - UUID → USAU player profile (data from usau_players + rosters + stats)
//   - anything else → existing UFA profile (the original behavior)
//
// End state: a single profile page that combines USAU + UFA careers under
// one identity. For now they're separate code paths because we don't yet
// have an identity-merge layer that links a USAU player UUID to a UFA
// player slug. We'll add that once we have a deduplication strategy.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getPlayerInfo,
  getPlayerSeasons,
  getPlayerGameLog,
} from '@/lib/ufa/client';
import type {
  UfaPlayerGameRow,
  UfaPlayerSeasonRow,
} from '@/lib/ufa/types';
import { teamMeta, teamMetaByAbbr } from '@/lib/ufa/teams';
import { PageShell } from '@/components/page-shell';
import { TeamLogo } from '@/components/team-logo';
import { findUsauPlayerByName, getPlayerProfile, looksLikeUsauUuid } from '@/lib/usau/data';
import { UsauPlayerProfile } from '@/components/usau/usau-player-profile';
import { PlayerLeagueTabs } from '@/components/player-league-tabs';

export const revalidate = 3600;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // USAU path — fetch from Supabase.
  if (looksLikeUsauUuid(params.id)) {
    const profile = await getPlayerProfile(params.id).catch(() => null);
    if (!profile) return { title: 'Player not found · The Layout' };
    return { title: `${profile.displayName} · The Layout` };
  }
  // UFA path — existing behavior.
  const info = await getPlayerInfo(params.id).catch(() => null);
  if (!info) return { title: 'Player not found · The Layout' };
  return { title: `${info.name} · The Layout` };
}

export default async function PlayerProfilePage({ params }: Props) {
  const playerID = params.id;

  // USAU branch: render the USAU profile component. We keep this as a
  // separate component so the existing UFA code below is untouched.
  if (looksLikeUsauUuid(playerID)) {
    const profile = await getPlayerProfile(playerID).catch(() => null);
    if (!profile) notFound();
    // No UFA name index on the server, so the UFA tab always points at
    // the league's home rather than a matching profile. Acceptable v1:
    // user can search by name from there.
    const leagueTabs = (
      <PlayerLeagueTabs
        active="usau"
        usauHref={`/players/${playerID}`}
        ufaHref="/scores"
      />
    );
    return <UsauPlayerProfile profile={profile} topNavSlot={leagueTabs} />;
  }

  // UFA branch (original code, unchanged below).
  const [info, seasons] = await Promise.all([
    getPlayerInfo(playerID).catch(() => null),
    getPlayerSeasons(playerID).catch(() => [] as UfaPlayerSeasonRow[]),
  ]);

  if (!info && seasons.length === 0) notFound();

  // Group season rows by year. A year may have a regSeason and a playoff entry,
  // and (rarely) entries for two different teams when a player is traded.
  const byYear = groupSeasonsByYear(seasons);
  const yearsDescending = Array.from(byYear.keys()).sort((a, b) => b - a);

  // Fetch per-game logs for every year in parallel — all cached for 1h.
  const gameLogs = await Promise.all(
    yearsDescending.map((y) => getPlayerGameLog(playerID, y).catch(() => [] as UfaPlayerGameRow[])),
  );
  const logsByYear = new Map<number, UfaPlayerGameRow[]>();
  yearsDescending.forEach((y, i) => logsByYear.set(y, gameLogs[i]));

  // Display name + current team
  const name = info?.name ?? `Player · ${playerID}`;
  const latest = byYear.get(yearsDescending[0])?.[0];
  const currentTeam = latest ? teamMetaByAbbr(latest.teamAbbrev) : null;

  const career = aggregateCareer(seasons);

  // Best-effort name match into our USAU dataset. When the user clicks
  // the USAU tab we jump straight to their USAU profile; otherwise we
  // fall back to /scores?league=usau.
  const usauMatch = info?.name ? await findUsauPlayerByName(info.name).catch(() => null) : null;
  const usauHref = usauMatch ? `/players/${usauMatch}` : '/scores?league=usau';
  const leagueTabs = (
    <PlayerLeagueTabs active="ufa" ufaHref={`/players/${playerID}`} usauHref={usauHref} />
  );

  return (
    <PageShell title={name} eyebrow="UFA · Career" topNavSlot={leagueTabs}>
      {/* Hero */}
      <div className="flex flex-wrap items-center gap-4 mb-8 pb-6 border-b border-hairline">
        {currentTeam && (
          <Link href={`/teams/${currentTeam.id}`} className="hover:opacity-80 transition-opacity duration-150">
            <TeamLogo team={currentTeam} size={56} />
          </Link>
        )}
        <div className="flex flex-col gap-0.5">
          {currentTeam && (
            <Link
              href={`/teams/${currentTeam.id}`}
              className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight hover:text-ink transition-colors duration-150"
            >
              {currentTeam.city} {currentTeam.name}
            </Link>
          )}
          {info?.currentTeam && !currentTeam && (
            <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight">
              {info.currentTeam}
            </span>
          )}
          {latest && (
            <div className="text-[13px] text-muted font-tight">
              {latest.year} · {latest.gamesPlayed} GP · {latest.goals}G · {latest.assists}A · {signed(plusMinus(latest))} +/−
            </div>
          )}
        </div>
      </div>

      {/* Career totals */}
      {career && (
        <section className="mb-10" aria-labelledby="career-heading">
          <h2
            id="career-heading"
            className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-4 font-tight"
          >
            Career Totals
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-px bg-border border border-border">
            <CareerStat label="Games"   value={career.gamesPlayed} />
            <CareerStat label="Goals"   value={career.goals} />
            <CareerStat label="Assists" value={career.assists} />
            <CareerStat label="Scores"  value={career.goals + career.assists} />
            <CareerStat label="+/−"     value={signed(career.plusMinus)} />
            <CareerStat label="Cmp%"    value={career.cmpPct ? `${career.cmpPct.toFixed(1)}%` : '—'} />
            <CareerStat label="Blocks"  value={career.blocks} />
          </div>
        </section>
      )}

      {/* Year-by-year, expandable */}
      {yearsDescending.length > 0 && (
        <section aria-labelledby="seasons-heading">
          <h2
            id="seasons-heading"
            className="flex items-baseline justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-3 font-tight"
          >
            <span>Season by Season</span>
            <span className="text-faint normal-case tracking-[0.1em] text-[10px] font-semibold">Tap a year to expand</span>
          </h2>
          <div className="flex flex-col gap-2">
            {yearsDescending.map((year) => (
              <YearAccordion
                key={year}
                year={year}
                seasonRows={byYear.get(year) ?? []}
                games={logsByYear.get(year) ?? []}
              />
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}

// ── Year accordion (native <details>; no client JS) ───────────────────────────

function YearAccordion({
  year,
  seasonRows,
  games,
}: {
  year: number;
  seasonRows: UfaPlayerSeasonRow[];
  games: UfaPlayerGameRow[];
}) {
  // Combine reg-season + playoff rows for the summary.
  const summary = sumRows(seasonRows);
  const teams = uniq(seasonRows.map((r) => r.teamAbbrev));
  const cmpPct = summary.throwsAttempted ? (summary.completions / summary.throwsAttempted) * 100 : 0;

  return (
    <details className="group bg-surface border border-border [&[open]]:border-ink transition-colors">
      <summary className="list-none cursor-pointer select-none px-4 py-3.5 flex items-center gap-3 hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
        <Caret />
        <span className="tabular text-[15px] font-bold font-tight text-ink w-[60px] flex-shrink-0">
          {year}
        </span>
        <span className="flex items-center gap-1.5 flex-1 min-w-0">
          {teams.map((abbr) => {
            const tm = teamMetaByAbbr(abbr);
            return tm ? (
              <TeamLogo key={abbr} team={tm} size={22} />
            ) : (
              <span
                key={abbr}
                className="inline-flex items-center justify-center w-[22px] h-[22px] text-[9px] font-bold text-faint border border-hairline"
              >
                {abbr}
              </span>
            );
          })}
        </span>
        <YearSummaryCells
          gp={summary.gamesPlayed}
          g={summary.goals}
          a={summary.assists}
          pm={summary.plusMinus}
          cmp={cmpPct}
        />
      </summary>

      {/* Per-game table */}
      <div className="px-4 pt-2 pb-4 border-t border-hairline overflow-x-auto">
        {games.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-faint font-tight">
            No game-level data available for {year}.
          </div>
        ) : (
          <GameLogTable games={games} />
        )}
      </div>
    </details>
  );
}

function YearSummaryCells({ gp, g, a, pm, cmp }: { gp: number; g: number; a: number; pm: number; cmp: number }) {
  const cells = [
    { label: 'GP', value: gp },
    { label: 'G',  value: g },
    { label: 'A',  value: a },
    { label: '+/−', value: signed(pm) },
    { label: 'CMP', value: cmp ? `${cmp.toFixed(0)}%` : '—' },
  ];
  return (
    <span className="hidden sm:flex items-center gap-4 flex-shrink-0">
      {cells.map((c) => (
        <span key={c.label} className="flex flex-col items-end gap-0.5">
          <span className="tabular text-[14px] font-bold font-tight text-ink leading-none">{c.value}</span>
          <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
            {c.label}
          </span>
        </span>
      ))}
    </span>
  );
}

function GameLogTable({ games }: { games: UfaPlayerGameRow[] }) {
  // Sort by date asc within the year (gameID prefix).
  const sorted = [...games].sort((a, b) => a.gameID.localeCompare(b.gameID));

  const thBase = 'px-2 py-2 text-[9px] font-bold tracking-[0.14em] uppercase font-tight text-muted whitespace-nowrap';
  const tdBase = 'px-2 py-2 text-[12px] border-b border-hairline whitespace-nowrap font-tight';

  return (
    <table className="w-full min-w-[640px] border-collapse">
      <thead>
        <tr>
          <th scope="col" className={`${thBase} text-left`}>Date</th>
          <th scope="col" className={`${thBase} text-left`}>Opponent</th>
          <th scope="col" className={`${thBase} text-left`}>Result</th>
          <th scope="col" className={`${thBase} text-right`}>G</th>
          <th scope="col" className={`${thBase} text-right`}>A</th>
          <th scope="col" className={`${thBase} text-right`}>+/−</th>
          <th scope="col" className={`${thBase} text-right`}>Blk</th>
          <th scope="col" className={`${thBase} text-right`}>Cmp</th>
          <th scope="col" className={`${thBase} text-right`}>Cmp%</th>
          <th scope="col" className={`${thBase} text-right`}>Yds</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((g) => {
          const date = parseGameDate(g.gameID);
          const opp = parseOpponent(g);
          const result = parseResult(g);
          const pm = plusMinus(g);
          const cmpPct = g.throwsAttempted ? (g.completions / g.throwsAttempted) * 100 : 0;
          const yds = (g.yardsReceived ?? 0) + (g.yardsThrown ?? 0);
          return (
            <tr key={g.gameID} className="hover:bg-surface-hi transition-colors duration-100">
              <td className={`${tdBase} text-left text-faint tabular`}>{date}</td>
              <td className={`${tdBase} text-left`}>
                {opp.team ? (
                  <Link href={`/teams/${opp.team.id}`} className="inline-flex items-center gap-1.5 text-ink hover:text-accent transition-colors">
                    <TeamLogo team={opp.team} size={18} />
                    <span className="font-semibold">{opp.label}</span>
                  </Link>
                ) : (
                  <span className="text-muted">{opp.label}</span>
                )}
              </td>
              <td className={`${tdBase} text-left`}>
                <Link href={`/g/${g.gameID}`} className="inline-flex items-center gap-1 text-ink hover:text-accent transition-colors">
                  <span className={`text-[10px] font-bold tracking-[0.1em] uppercase ${result.win ? 'text-accent' : result.loss ? 'text-faint' : 'text-muted'}`}>
                    {result.label}
                  </span>
                  <span className="tabular text-[12px] text-muted">{result.score}</span>
                </Link>
              </td>
              <td className={`${tdBase} text-right tabular text-ink`}>{g.goals}</td>
              <td className={`${tdBase} text-right tabular text-ink`}>{g.assists}</td>
              <td className={`${tdBase} text-right tabular ${pm > 0 ? 'text-ink font-semibold' : pm < 0 ? 'text-faint' : 'text-muted'}`}>{signed(pm)}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.blocks}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.completions}/{g.throwsAttempted}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{cmpPct ? `${cmpPct.toFixed(0)}%` : '—'}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{yds}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CareerStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface flex flex-col items-center justify-center px-3 py-5 gap-1">
      <div className="tabular text-[28px] md:text-[32px] font-bold font-tight leading-none text-ink tracking-[-0.03em]">
        {value ?? '—'}
      </div>
      <div className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
        {label}
      </div>
    </div>
  );
}

function Caret() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted flex-shrink-0 transition-transform duration-150 group-open:rotate-90"
      aria-hidden="true"
    >
      <path d="M3 2l4 3-4 3" />
    </svg>
  );
}

// ── Aggregation + parsing helpers ────────────────────────────────────────────

function groupSeasonsByYear(rows: UfaPlayerSeasonRow[]): Map<number, UfaPlayerSeasonRow[]> {
  const map = new Map<number, UfaPlayerSeasonRow[]>();
  for (const r of rows) {
    if (!map.has(r.year)) map.set(r.year, []);
    map.get(r.year)!.push(r);
  }
  return map;
}

interface CareerAgg {
  gamesPlayed: number;
  goals: number;
  assists: number;
  blocks: number;
  plusMinus: number;
  completions: number;
  throwsAttempted: number;
  cmpPct: number;
}

function aggregateCareer(rows: UfaPlayerSeasonRow[]): CareerAgg | null {
  if (rows.length === 0) return null;
  const sum = rows.reduce(
    (acc, r) => {
      acc.gamesPlayed += r.gamesPlayed;
      acc.goals += r.goals;
      acc.assists += r.assists;
      acc.blocks += r.blocks;
      acc.completions += r.completions;
      acc.throwsAttempted += r.throwsAttempted;
      acc.plusMinus += plusMinus(r);
      return acc;
    },
    { gamesPlayed: 0, goals: 0, assists: 0, blocks: 0, completions: 0, throwsAttempted: 0, plusMinus: 0 },
  );
  return {
    ...sum,
    cmpPct: sum.throwsAttempted ? (sum.completions / sum.throwsAttempted) * 100 : 0,
  };
}

interface YearAgg {
  gamesPlayed: number;
  goals: number;
  assists: number;
  blocks: number;
  plusMinus: number;
  completions: number;
  throwsAttempted: number;
}

function sumRows(rows: UfaPlayerSeasonRow[]): YearAgg {
  return rows.reduce(
    (acc, r) => {
      acc.gamesPlayed += r.gamesPlayed;
      acc.goals += r.goals;
      acc.assists += r.assists;
      acc.blocks += r.blocks;
      acc.completions += r.completions;
      acc.throwsAttempted += r.throwsAttempted;
      acc.plusMinus += plusMinus(r);
      return acc;
    },
    { gamesPlayed: 0, goals: 0, assists: 0, blocks: 0, completions: 0, throwsAttempted: 0, plusMinus: 0 },
  );
}

/** Standard ultimate +/− = goals + assists + blocks − throwaways − drops − stalls. */
function plusMinus(r: { goals: number; assists: number; blocks: number; throwaways: number; drops: number; stalls: number }): number {
  return r.goals + r.assists + r.blocks - r.throwaways - r.drops - r.stalls;
}

function signed(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function parseGameDate(gameID: string): string {
  const m = gameID.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}`;
}

function parseOpponent(g: UfaPlayerGameRow): { label: string; team: ReturnType<typeof teamMeta> | null } {
  const m = g.gameID.match(/^\d{4}-\d{2}-\d{2}-([A-Z]+)-([A-Z]+)$/);
  if (!m) return { label: '—', team: null };
  const [, away, home] = m;
  // We don't know which side the player was on directly, but `isHome` tells us:
  // when player isHome → opponent is the away team; when away → opponent is home.
  const oppAbbr = g.isHome ? away : home;
  const team = teamMetaByAbbr(oppAbbr);
  const venue = g.isHome ? 'vs' : '@';
  if (team) return { label: `${venue} ${team.abbr}`, team };
  return { label: `${venue} ${oppAbbr}`, team: null };
}

function parseResult(g: UfaPlayerGameRow): { label: string; score: string; win: boolean; loss: boolean } {
  const my = g.isHome ? g.scoreHome : g.scoreAway;
  const opp = g.isHome ? g.scoreAway : g.scoreHome;
  if (my === 0 && opp === 0) return { label: '—', score: '', win: false, loss: false };
  const win = my > opp;
  const loss = my < opp;
  return {
    label: win ? 'W' : loss ? 'L' : 'T',
    score: `${my}–${opp}`,
    win,
    loss,
  };
}
