'use client';

// WFDF championship-bracket tree — reconstructs the single-elimination winner's
// bracket for one division of a WFDF event and renders it left-to-right
// (Round 1 → Quarterfinals → Semifinals → Final → 🥇/🥈).
//
// HOW THE TREE IS DERIVED (modern events only — 2025-26 static-cache data):
//   WFDF game `pool_name` encodes the round: "Playoff (1-16)",
//   "Playoff (1-16) Quarterfinals/Semifinals/Finals". The "Finals" group holds
//   the gold-medal game PLUS every consolation placement game, so we don't draw
//   it wholesale. Instead:
//     1. Find THE final — the Finals-group game between the teams with
//        final_standing 1 and 2 (fallback: latest scheduled).
//     2. Walk backwards by team participation (findSources): final's two teams
//        → their SF games → their QF games → their R1 games. This prunes all
//        consolation branches, leaving the clean 1→2→4→8 winner's tree.
//   Layout reuses the USAU bracket approach: each later-round card sits at the
//   vertical midpoint of its source cards, so the feed reads without connectors.

import { useMemo } from 'react';
import Link from 'next/link';
import type { WfdfEventDetail } from '@/lib/wfdf/data';
import { WfdfFlag } from './wfdf-flag';

type Game = WfdfEventDetail['games'][number];
type Team = WfdfEventDetail['teams'][number];

interface Props {
  divisionName: string;
  games: Game[];
  teams: Team[];
}

// Enriched game with the resolved round + per-team seed/standing/flag.
interface BracketGame {
  id: string;
  round: RoundKey;
  homeId: string | null;
  homeName: string | null;
  homeSeed: number | null;
  homeFlag: string | null;
  homeCountry: string | null;
  homeScore: number | null;
  awayId: string | null;
  awayName: string | null;
  awaySeed: number | null;
  awayFlag: string | null;
  awayCountry: string | null;
  awayScore: number | null;
  status: string;
  scheduledAt: string | null;
}

type RoundKey = 'r1' | 'qf' | 'sf' | 'final';

interface RoundColumn {
  label: string;
  key: RoundKey;
  games: BracketGame[];
}

const ROW_PITCH_PX = 104;

const ROUND_LABEL: Record<RoundKey, string> = {
  r1: 'Round 1',
  qf: 'Quarterfinals',
  sf: 'Semifinals',
  final: 'Final',
};

// Classify a bracket game's pool_name into a championship-tree round. Returns
// null for names we don't place in the winner's tree (placement pools, etc.).
// The base "Playoff (N-M)" name (no round suffix) is the FIRST bracket round.
function classifyRound(pool: string | null): { group: string; round: RoundKey } | null {
  if (!pool) return null;
  const m = pool.match(/^(.*?)(?:\s+(Quarterfinals|Semifinals|Finals))?$/);
  if (!m) return null;
  const group = m[1].trim();
  const suffix = m[2];
  // Only the main championship playoff group ("Playoff (1-…)") forms the tree.
  // e.g. "Playoff (1-16)", "Playoff (1-8)". Not "Playoff (9-16)" / "(17-32)".
  if (!/^Playoff \(1-\d+\)$/.test(group)) return null;
  if (suffix === 'Quarterfinals') return { group, round: 'qf' };
  if (suffix === 'Semifinals') return { group, round: 'sf' };
  if (suffix === 'Finals') return { group, round: 'final' };
  return { group, round: 'r1' };
}

export function WfdfBracketTree({ divisionName, games, teams }: Props) {
  const columns = useMemo(() => buildTree(divisionName, games, teams), [divisionName, games, teams]);
  const positions = useMemo(() => (columns ? assignPositions(columns.columns) : new Map()), [columns]);

  if (!columns) return null;
  const { columns: cols, gold, silver } = columns;
  const rendered = cols.filter((c) => c.games.length > 0);
  if (rendered.length < 2) return null; // need at least a couple of rounds to be a tree

  return (
    <section className="mb-4" aria-labelledby="wfdf-bracket-heading">
      <div className="flex items-center justify-between mb-4">
        <h3
          id="wfdf-bracket-heading"
          className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight"
        >
          Championship Bracket
        </h3>
        {(gold || silver) && (
          <div className="flex items-center gap-3">
            {gold && <MedalTag place="gold" name={gold} />}
            {silver && <MedalTag place="silver" name={silver} />}
          </div>
        )}
      </div>

      {/* Mobile: latest round first (Final → SF → QF → R1) */}
      <div className="lg:hidden flex flex-col gap-5">
        {[...rendered].reverse().map((col) => (
          <div key={col.key}>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
              {col.label}
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {col.games.map((g) => (
                <MatchCard key={g.id} game={g} compact />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Desktop: horizontal columns, absolute-positioned cards */}
      <div className="hidden lg:block overflow-x-auto pb-2">
        <DesktopBracket columns={rendered} positions={positions} />
      </div>
    </section>
  );
}

function DesktopBracket({
  columns,
  positions,
}: {
  columns: RoundColumn[];
  positions: Map<string, number>;
}) {
  const baseCount = Math.max(...columns.map((c) => c.games.length), 4);
  const totalHeight = baseCount * ROW_PITCH_PX + 32;

  return (
    <div
      className="grid gap-x-6 min-w-[820px] relative"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, minmax(180px, 1fr))`,
        height: `${totalHeight}px`,
      }}
    >
      {columns.map((col) => (
        <div key={col.key} className="relative h-full">
          <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-3 text-center h-[20px]">
            {col.label}
          </div>
          {col.games.map((g) => {
            const top = positions.get(g.id) ?? 0;
            return (
              <div key={g.id} className="absolute left-0 right-0" style={{ top: `${top + 32}px` }}>
                <MatchCard game={g} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MatchCard({ game, compact = false }: { game: BracketGame; compact?: boolean }) {
  const done = game.status === 'completed' && game.homeScore != null && game.awayScore != null;
  const homeWon = done && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = done && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <article className="bg-surface border border-border rounded-md overflow-hidden">
      <TeamLine
        teamId={game.homeId}
        name={game.homeName}
        seed={game.homeSeed}
        flag={game.homeFlag}
        country={game.homeCountry}
        score={game.homeScore}
        won={homeWon}
        lost={awayWon}
        done={done}
        compact={compact}
      />
      <div className="h-px bg-hairline" />
      <TeamLine
        teamId={game.awayId}
        name={game.awayName}
        seed={game.awaySeed}
        flag={game.awayFlag}
        country={game.awayCountry}
        score={game.awayScore}
        won={awayWon}
        lost={homeWon}
        done={done}
        compact={compact}
      />
    </article>
  );
}

function TeamLine({
  teamId,
  name,
  seed,
  flag,
  country,
  score,
  won,
  lost,
  done,
  compact,
}: {
  teamId: string | null;
  name: string | null;
  seed: number | null;
  flag: string | null;
  country: string | null;
  score: number | null;
  won: boolean;
  lost: boolean;
  done: boolean;
  compact?: boolean;
}) {
  const labelColor = won ? 'text-ink' : lost ? 'text-faint' : 'text-muted';
  const scoreColor = won ? 'text-accent' : lost ? 'text-faint' : 'text-muted';
  const fontWeight = won ? 'font-bold' : 'font-semibold';

  const inner = (
    <span className={`flex items-center gap-2 flex-1 min-w-0 ${labelColor}`}>
      {seed != null && (
        <span className="tabular text-[10px] text-faint font-bold w-4 text-right shrink-0">{seed}</span>
      )}
      <WfdfFlag flagFile={flag} countryCode={country} size={14} />
      <span className={`text-[13px] font-tight truncate ${fontWeight}`}>{name ?? 'TBD'}</span>
    </span>
  );

  return (
    <div className={`flex items-center gap-3 px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      {teamId ? (
        <Link
          href={`/wfdf/teams/${teamId}`}
          className="flex-1 min-w-0 hover:opacity-80 transition-opacity no-underline"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex-1 min-w-0">{inner}</span>
      )}
      <span className={`tabular text-[15px] font-bold font-tight leading-none w-7 text-right ${scoreColor}`}>
        {done ? score : '–'}
      </span>
    </div>
  );
}

function MedalTag({ place, name }: { place: 'gold' | 'silver'; name: string }) {
  const color = place === 'gold' ? 'text-[#d4af37]' : 'text-[#9ca3af]';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-tight">
      <span className={color} aria-hidden="true">
        ●
      </span>
      <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint">
        {place === 'gold' ? 'Gold' : 'Silver'}
      </span>
      <span className="font-semibold text-ink truncate max-w-[140px]">{name}</span>
    </span>
  );
}

// ── Tree construction ──────────────────────────────────────────────────────

interface BuiltTree {
  columns: RoundColumn[];
  gold: string | null;
  silver: string | null;
}

function buildTree(divisionName: string, games: Game[], teams: Team[]): BuiltTree | null {
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // Collect this division's championship-playoff bracket games, tagged by round.
  const tagged: BracketGame[] = [];
  const groupCounts = new Map<string, number>();
  for (const g of games) {
    if (g.divisionName !== divisionName || !g.isBracket) continue;
    const c = classifyRound(g.poolName);
    if (!c) continue;
    groupCounts.set(c.group, (groupCounts.get(c.group) ?? 0) + 1);
    tagged.push(enrich(g, c.round, teamById));
  }
  if (tagged.length === 0) return null;

  // If multiple "Playoff (1-N)" groups exist (rare), keep the largest.
  if (groupCounts.size > 1) {
    // Re-tag: only keep games from the dominant group.
    // (classifyRound stored group only transiently; recompute by pool match.)
    let topGroup = '';
    let topCount = -1;
    for (const [grp, n] of groupCounts) {
      if (n > topCount) {
        topGroup = grp;
        topCount = n;
      }
    }
    const filtered = games.filter((g) => {
      if (g.divisionName !== divisionName || !g.isBracket) return false;
      const c = classifyRound(g.poolName);
      return c?.group === topGroup;
    });
    tagged.length = 0;
    for (const g of filtered) {
      const c = classifyRound(g.poolName)!;
      tagged.push(enrich(g, c.round, teamById));
    }
  }

  const byRound: Record<RoundKey, BracketGame[]> = { r1: [], qf: [], sf: [], final: [] };
  for (const g of tagged) byRound[g.round].push(g);

  // The "final" round holds gold + all placement games. Find THE gold-medal
  // game: the one between final_standing 1 and 2 (fallback: latest scheduled).
  const finalGame = pickFinal(byRound.final, teamById);
  if (!finalGame) return null;

  // Walk backwards to prune consolation branches → clean winner's tree.
  const sf = sourcesFor(finalGame, byRound.sf);
  const qf = sf.flatMap((s) => sourcesFor(s, byRound.qf));
  const r1 = qf.flatMap((s) => sourcesFor(s, byRound.r1));

  const dedupe = (arr: BracketGame[]) => Array.from(new Map(arr.map((g) => [g.id, g])).values());

  const columns: RoundColumn[] = [
    { key: 'r1', label: ROUND_LABEL.r1, games: dedupe(r1) },
    { key: 'qf', label: ROUND_LABEL.qf, games: dedupe(qf) },
    { key: 'sf', label: ROUND_LABEL.sf, games: dedupe(sf) },
    { key: 'final', label: ROUND_LABEL.final, games: [finalGame] },
  ];

  // Gold/silver from final_standing on the two finalists.
  const home = finalGame.homeId ? teamById.get(finalGame.homeId) : null;
  const away = finalGame.awayId ? teamById.get(finalGame.awayId) : null;
  let gold: string | null = null;
  let silver: string | null = null;
  if (home?.finalStanding === 1 || away?.finalStanding === 2) {
    gold = home?.name ?? null;
    silver = away?.name ?? null;
  } else if (away?.finalStanding === 1 || home?.finalStanding === 2) {
    gold = away?.name ?? null;
    silver = home?.name ?? null;
  } else {
    // Fall back to the score if standings are absent.
    const hs = finalGame.homeScore ?? -1;
    const as = finalGame.awayScore ?? -1;
    gold = hs >= as ? finalGame.homeName : finalGame.awayName;
    silver = hs >= as ? finalGame.awayName : finalGame.homeName;
  }

  return { columns, gold, silver };
}

function enrich(g: Game, round: RoundKey, teamById: Map<string, Team>): BracketGame {
  const home = g.homeTeamId ? teamById.get(g.homeTeamId) : null;
  const away = g.awayTeamId ? teamById.get(g.awayTeamId) : null;
  return {
    id: g.id,
    round,
    homeId: g.homeTeamId,
    homeName: g.homeTeam,
    homeSeed: home?.seed ?? null,
    homeFlag: home?.flagFile ?? null,
    homeCountry: g.homeCountry,
    homeScore: g.homeScore,
    awayId: g.awayTeamId,
    awayName: g.awayTeam,
    awaySeed: away?.seed ?? null,
    awayFlag: away?.flagFile ?? null,
    awayCountry: g.awayCountry,
    awayScore: g.awayScore,
    status: g.status,
    scheduledAt: g.scheduledAt,
  };
}

// Pick the gold-medal final from the Finals-round pool.
function pickFinal(finals: BracketGame[], teamById: Map<string, Team>): BracketGame | null {
  if (finals.length === 0) return null;
  // Prefer the game between final_standing 1 and 2.
  const byStanding = finals.find((g) => {
    const h = g.homeId ? teamById.get(g.homeId)?.finalStanding : null;
    const a = g.awayId ? teamById.get(g.awayId)?.finalStanding : null;
    return (h === 1 && a === 2) || (h === 2 && a === 1);
  });
  if (byStanding) return byStanding;
  // Fallback: latest scheduled game.
  return [...finals].sort((x, y) => (y.scheduledAt ?? '').localeCompare(x.scheduledAt ?? ''))[0];
}

// The prev-round games that fed `game`: those sharing at least one team id.
function sourcesFor(game: BracketGame, prev: BracketGame[]): BracketGame[] {
  const ids = [game.homeId, game.awayId].filter((x): x is string => !!x);
  if (ids.length === 0) return [];
  const out: BracketGame[] = [];
  for (const c of prev) {
    if ((c.homeId && ids.includes(c.homeId)) || (c.awayId && ids.includes(c.awayId))) {
      out.push(c);
    }
  }
  return out;
}

// ── Vertical positioning (midpoint-of-sources, same as USAU tree) ──────────

function assignPositions(columns: RoundColumn[]): Map<string, number> {
  const positions = new Map<string, number>();
  const base = columns.find((c) => c.key === 'r1' && c.games.length > 0) ?? columns[0];
  if (!base || base.games.length === 0) return positions;

  base.games.forEach((g, i) => positions.set(g.id, i * ROW_PITCH_PX));

  const order: RoundKey[] = ['r1', 'qf', 'sf', 'final'];
  let prev: RoundColumn | null = base;
  for (const k of order) {
    if (k === base.key) continue;
    const col = columns.find((c) => c.key === k);
    if (!col || col.games.length === 0) continue;
    for (const g of col.games) {
      const sources = prev ? sourcesFor(g, prev.games) : [];
      if (sources.length === 0) {
        const idx = col.games.indexOf(g);
        const step = (base.games.length * ROW_PITCH_PX) / Math.max(col.games.length, 1);
        positions.set(g.id, idx * step + step / 2 - ROW_PITCH_PX / 2);
      } else {
        const tops = sources.map((s) => positions.get(s.id) ?? 0);
        positions.set(g.id, tops.reduce((a, b) => a + b, 0) / tops.length);
      }
    }
    col.games.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
    prev = col;
  }
  return positions;
}
