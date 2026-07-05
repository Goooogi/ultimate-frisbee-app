'use client';

// WFDF bracket trees — reconstructs the championship AND placement brackets for
// one division of a WFDF event and renders each as a left-to-right tree
// (Round 1 → Quarterfinals → Semifinals → Final) with a final-placement rail.
//
// HOW THE TREES ARE DERIVED (modern events only — 2025-26 static-cache data):
//   WFDF game `pool_name` encodes the round: "Playoff (1-16)",
//   "Playoff (1-16) Quarterfinals/Semifinals/Finals". Each round holds BOTH the
//   championship-path games and the parallel placement (consolation) games; the
//   "Finals" round holds one game per adjacent rank pair (1/2 = gold, 3/4 =
//   bronze, 5/6, 7/8, 9/10 …). Separate "Playoff (17-24)" etc. groups are their
//   own brackets.
//
//   We partition into brackets by REACHABILITY: pick the lowest-rank final not
//   yet assigned, then grow its team set backwards (final's teams → their SF →
//   QF → R1 games). Because a top-8 team never plays a 9-16 team in the bracket,
//   each reachable team set is exactly one self-contained bracket. The lowest
//   final (ranks 1/2) yields the Championship bracket; the next yields 5th–8th
//   or 9th–16th, etc. Each bracket's placement rail comes from `final_standing`.
//
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
  level: RoundLevel;
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

// Canonical round LEVEL within a playoff group. A group has whatever levels
// exist (a small 8-team group skips QF; a 4-team group skips QF+SF), always
// ending at FINAL. We chain through the present levels in order rather than
// assuming a fixed depth — this is what makes variable-size brackets work.
const LEVEL_BASE = 0; // the un-suffixed "Playoff (N-M)" round (first round)
const LEVEL_QF = 1; // "… Quarterfinals"
const LEVEL_SF = 2; // "… Semifinals"
const LEVEL_FINAL = 3; // "… Finals"
type RoundLevel = 0 | 1 | 2 | 3;

interface RoundColumn {
  label: string;
  level: RoundLevel;
  games: BracketGame[];
}

// One reconstructed bracket (championship or a placement range).
interface Bracket {
  /** Stable id for keys. */
  id: string;
  /** Human title, e.g. "Championship Bracket", "9th–16th Place". */
  title: string;
  columns: RoundColumn[];
  /** Final placement rail (rank → team), sorted ascending by rank. */
  rail: { rank: number; teamName: string; countryCode: string | null; flagFile: string | null }[];
  /** Gold/silver/bronze (only set on the championship bracket). */
  medals: { gold: string | null; silver: string | null; bronze: string | null } | null;
}

const ROW_PITCH_PX = 104;

// Classify a bracket game's pool_name into { group, level }. The base
// "Playoff (N-M)" name (no round suffix) is the FIRST round of that group.
// Returns null for names that aren't a numbered playoff group.
function classifyRound(pool: string | null): { group: string; level: RoundLevel } | null {
  if (!pool) return null;
  const m = pool.match(/^(Playoff \(\d+-\d+\)|Placement \(\d+-\d+\))(?:\s+(Quarterfinals|Semifinals|Finals))?$/);
  if (!m) return null;
  const group = m[1].trim();
  const suffix = m[2];
  if (suffix === 'Quarterfinals') return { group, level: LEVEL_QF };
  if (suffix === 'Semifinals') return { group, level: LEVEL_SF };
  if (suffix === 'Finals') return { group, level: LEVEL_FINAL };
  return { group, level: LEVEL_BASE };
}

/** Whether a bracket tree is derivable for this division (drives the flat-list
 *  fallback in the event detail). */
export function hasWfdfBracket(
  divisionName: string,
  games: Game[],
  teams: Team[],
): boolean {
  return buildBrackets(divisionName, games, teams).length > 0;
}

export function WfdfBracketTree({ divisionName, games, teams }: Props) {
  const brackets = useMemo(
    () => buildBrackets(divisionName, games, teams),
    [divisionName, games, teams],
  );

  if (brackets.length === 0) return null;

  return (
    <div className="flex flex-col gap-10">
      {brackets.map((b) => (
        <BracketSection key={b.id} bracket={b} />
      ))}
    </div>
  );
}

function BracketSection({ bracket }: { bracket: Bracket }) {
  const positions = useMemo(() => assignPositions(bracket.columns), [bracket.columns]);
  const rendered = bracket.columns.filter((c) => c.games.length > 0);
  if (rendered.length === 0) return null;

  return (
    <section aria-label={bracket.title}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          {bracket.title}
        </h3>
        {bracket.medals && (
          <div className="flex items-center gap-3 flex-wrap">
            {bracket.medals.gold && <MedalTag place="gold" name={bracket.medals.gold} />}
            {bracket.medals.silver && <MedalTag place="silver" name={bracket.medals.silver} />}
            {bracket.medals.bronze && <MedalTag place="bronze" name={bracket.medals.bronze} />}
          </div>
        )}
      </div>

      {/* Mobile: rounds stacked latest-first, then the placement rail. */}
      <div className="lg:hidden flex flex-col gap-5">
        {[...rendered].reverse().map((col) => (
          <div key={col.label}>
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
        {bracket.rail.length > 0 && <PlacementRail rail={bracket.rail} mobile />}
      </div>

      {/* Desktop: horizontal columns + placement rail. */}
      <div className="hidden lg:block overflow-x-auto pb-2">
        <div className="flex items-start gap-4 min-w-max">
          <DesktopBracket columns={rendered} positions={positions} />
          {bracket.rail.length > 0 && <PlacementRail rail={bracket.rail} />}
        </div>
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
  const baseCount = Math.max(...columns.map((c) => c.games.length), 2);
  const totalHeight = baseCount * ROW_PITCH_PX + 32;

  return (
    <div
      className="grid gap-x-6 relative flex-shrink-0"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, 180px)`,
        height: `${totalHeight}px`,
      }}
    >
      {columns.map((col) => (
        <div key={col.label} className="relative h-full">
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

// Final-placement rail — the "9th Team / 10th Team …" column on the right.
function PlacementRail({
  rail,
  mobile = false,
}: {
  rail: Bracket['rail'];
  mobile?: boolean;
}) {
  return (
    <div className={mobile ? '' : 'pt-[32px] min-w-[190px]'}>
      {mobile && (
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
          Final Placement
        </div>
      )}
      <ul className={mobile ? 'flex flex-col gap-1' : 'flex flex-col'}>
        {rail.map((r) => (
          <li
            key={r.rank}
            className={[
              'flex items-center gap-2 py-1.5',
              mobile ? '' : 'border-b border-hairline last:border-0 h-[52px]',
            ].join(' ')}
          >
            <span className="text-[12px] font-bold tabular text-faint w-8 flex-shrink-0">
              {ordinal(r.rank)}
            </span>
            <WfdfFlag flagFile={r.flagFile} countryCode={r.countryCode} size={14} />
            <span className="text-[13px] font-semibold text-ink font-tight truncate">
              {r.teamName}
            </span>
          </li>
        ))}
      </ul>
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

function MedalTag({ place, name }: { place: 'gold' | 'silver' | 'bronze'; name: string }) {
  const color =
    place === 'gold' ? 'text-[#d4af37]' : place === 'silver' ? 'text-[#9ca3af]' : 'text-[#c07a3e]';
  const label = place === 'gold' ? 'Gold' : place === 'silver' ? 'Silver' : 'Bronze';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-tight">
      <span className={color} aria-hidden="true">
        ●
      </span>
      <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint">{label}</span>
      <span className="font-semibold text-ink truncate max-w-[140px]">{name}</span>
    </span>
  );
}

// ── Tree construction ──────────────────────────────────────────────────────

function buildBrackets(divisionName: string, games: Game[], teams: Team[]): Bracket[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // Collect this division's numbered-playoff bracket games, tagged by round +
  // group. Multiple groups may coexist (e.g. "Playoff (1-16)" and
  // "Placement (17-24)") — we handle each group's brackets independently.
  const byGroup = new Map<string, BracketGame[]>();
  for (const g of games) {
    if (g.divisionName !== divisionName || !g.isBracket) continue;
    const c = classifyRound(g.poolName);
    if (!c) continue;
    if (!byGroup.has(c.group)) byGroup.set(c.group, []);
    byGroup.get(c.group)!.push(enrich(g, c.level, teamById));
  }
  if (byGroup.size === 0) return [];

  const standingOf = (id: string | null) => (id ? teamById.get(id)?.finalStanding ?? 9999 : 9999);

  const brackets: Bracket[] = [];

  // Sort groups so the top group (lowest starting rank) comes first.
  const groups = [...byGroup.entries()].sort((a, b) => startRank(a[0]) - startRank(b[0]));

  for (const [group, tagged] of groups) {
    // Bucket by canonical level; keep only the levels that actually exist.
    const byLevel = new Map<RoundLevel, BracketGame[]>();
    for (const g of tagged) {
      if (!byLevel.has(g.level)) byLevel.set(g.level, []);
      byLevel.get(g.level)!.push(g);
    }
    const presentLevels = [...byLevel.keys()].sort((a, b) => a - b); // ascending
    if (!byLevel.has(LEVEL_FINAL)) continue; // no finals → can't rank a tree
    const baseLevel = presentLevels[0];

    // PARTITION into sub-brackets. Each "final" decides two adjacent ranks. We
    // grow each bracket's team set backwards through the NON-BASE levels only.
    // Rationale: the base round pairs a team that advances up with one that
    // drops to a lower bracket, so base games bridge sibling brackets and would
    // collapse them if walked. Each base game is instead assigned to its
    // WINNER's bracket. For narrow groups (base + final only, no middle rounds)
    // there's nothing to bridge, so the whole group is one bracket.
    const finals = [...(byLevel.get(LEVEL_FINAL) ?? [])].sort(
      (a, b) =>
        Math.min(standingOf(a.homeId), standingOf(a.awayId)) -
        Math.min(standingOf(b.homeId), standingOf(b.awayId)),
    );
    const usedFinals = new Set<string>();

    // A group is WIDE (its base round splits into a top bracket + a lower
    // "N/2..N" bracket) iff it has a Quarterfinals round. WFDF only emits a QF
    // suffix on the big 16-team groups ("Playoff (1-16)", "Playoff (17-32)")
    // that split; the 8-team groups ("Playoff (1-8)", "Playoff (9-16)") run
    // base→Semifinals→Finals with the base losers staying in the SAME bracket
    // for 5th-8th, and the tiny 4-team groups ("Playoff (1-4)") run
    // base→Finals. So: wide = QF present; narrow = no QF.
    const isWide = byLevel.has(LEVEL_QF);

    // For a WIDE group we walk the middle rounds and split at the base (winner
    // up / loser down). For a NARROW group the base round belongs wholly to the
    // one bracket, so we DON'T treat it as a splitter — walk every non-final
    // round including the base.
    const walkLevels = presentLevels
      .filter((l) => l < LEVEL_FINAL && (isWide ? l > baseLevel : true))
      .sort((a, b) => b - a);

    for (const finalGame of finals) {
      if (usedFinals.has(finalGame.id)) continue;

      const bracketGames: BracketGame[] = [finalGame];
      const teamSet = new Set<string>(
        [finalGame.homeId, finalGame.awayId].filter((x): x is string => !!x),
      );

      // Walk down through the walk levels collecting sources. For a narrow
      // group this includes the base round (all its teams stay in-bracket); for
      // a wide group it stops above the base (the base is winner-split below).
      let frontier: BracketGame[] = [finalGame];
      for (const lvl of walkLevels) {
        const src = frontier.flatMap((f) => sourcesFor(f, byLevel.get(lvl) ?? []));
        collect(src, bracketGames, teamSet);
        frontier = src;
      }

      // Rank set = teams connected through the walked rounds. For a wide group
      // that's the top-half only (base losers drop to the sibling bracket); for
      // a narrow group it's the whole bracket (base losers rank here).
      const rankTeamIds = new Set(teamSet);

      // Sibling finals (bronze / 5th-6th / 7th-8th …) belong to this bracket
      // when BOTH their teams are in the RANK set — i.e. placement games among
      // this bracket's own round losers. We match against rankTeamIds (the
      // walked, pre-base set) so that for a WIDE group the lower bracket's
      // finals don't get absorbed once base losers are folded in below.
      const siblingFinals = finals.filter(
        (f) =>
          f.id !== finalGame.id &&
          !usedFinals.has(f.id) &&
          rankTeamIds.has(f.homeId ?? '') &&
          rankTeamIds.has(f.awayId ?? ''),
      );
      for (const f of siblingFinals) {
        usedFinals.add(f.id);
        bracketGames.push(f);
        if (f.homeId) rankTeamIds.add(f.homeId);
        if (f.awayId) rankTeamIds.add(f.awayId);
      }
      usedFinals.add(finalGame.id);

      // WIDE groups only: the base round splits — assign each base game to its
      // WINNER's bracket (the loser drops to the sibling bracket, ranked there).
      // Done AFTER sibling matching so base losers don't leak into this rail.
      if (isWide) {
        const baseGames = (byLevel.get(baseLevel) ?? []).filter((g) => {
          if (bracketGames.some((bg) => bg.id === g.id)) return false;
          const w = winnerOf(g);
          return w != null && teamSet.has(w);
        });
        collect(baseGames, bracketGames, teamSet);
      }

      const bracket = assembleBracket(group, bracketGames, rankTeamIds, presentLevels, teamById);
      if (bracket) brackets.push(bracket);
    }
  }

  // Order: championship (contains rank 1) first, then by starting rank.
  brackets.sort((a, b) => bracketMinRank(a) - bracketMinRank(b));
  return brackets;
}

function winnerOf(g: BracketGame): string | null {
  if (g.homeScore == null || g.awayScore == null) return null;
  if (g.homeScore === g.awayScore) return null;
  return g.homeScore > g.awayScore ? g.homeId : g.awayId;
}

function assembleBracket(
  group: string,
  gamesIn: BracketGame[],
  rankTeamIds: Set<string>,
  presentLevels: RoundLevel[],
  teamById: Map<string, Team>,
): Bracket | null {
  const dedupe = (arr: BracketGame[]) =>
    Array.from(new Map(arr.map((g) => [g.id, g])).values());
  const all = dedupe(gamesIn);

  const byLevel = new Map<RoundLevel, BracketGame[]>();
  for (const g of all) {
    if (!byLevel.has(g.level)) byLevel.set(g.level, []);
    byLevel.get(g.level)!.push(g);
  }

  const standingOf = (id: string | null) => (id ? teamById.get(id)?.finalStanding ?? 9999 : 9999);
  const topFinal = [...(byLevel.get(LEVEL_FINAL) ?? [])].sort(
    (a, b) =>
      Math.min(standingOf(a.homeId), standingOf(a.awayId)) -
      Math.min(standingOf(b.homeId), standingOf(b.awayId)),
  )[0];
  if (!topFinal) return null;

  // Build the winner's-path columns by walking down through the present levels
  // (final → each lower present level in turn). A missing level (e.g. no QF in
  // an 8-team bracket) is simply skipped — the walk chains SF directly onto the
  // base round. Column order is deepest-round → final.
  const levelsDesc = presentLevels.filter((l) => l < LEVEL_FINAL).sort((a, b) => b - a);
  const columnsDesc: BracketGame[][] = [];
  let frontier: BracketGame[] = [topFinal];
  for (const lvl of levelsDesc) {
    const src = dedupe(frontier.flatMap((f) => sourcesFor(f, byLevel.get(lvl) ?? [])));
    if (src.length > 0) {
      columnsDesc.push(src);
      frontier = src;
    }
  }
  // columnsDesc is deepest-first already (we pushed SF, then QF/base). Reverse
  // to render left→right, then append the final.
  const orderedGameCols = [...columnsDesc].reverse();
  orderedGameCols.push([topFinal]);

  // Relative labels: last col = Final, filling backward SF/QF/Round 1.
  const relLabels = relativeRoundLabels(orderedGameCols.length);
  const columns: RoundColumn[] = orderedGameCols.map((gs, i) => ({
    level: (i === orderedGameCols.length - 1 ? LEVEL_FINAL : LEVEL_BASE) as RoundLevel,
    label: relLabels[i],
    games: gs,
  }));

  // Placement rail — the teams that RANK in this bracket (its own rank range),
  // ascending. Uses rankTeamIds (SF/QF-connected set), NOT every team in the
  // games, so R1 losers who drop to a lower bracket aren't listed here.
  const rail = [...rankTeamIds]
    .map((id) => teamById.get(id))
    .filter((t): t is Team => !!t && t.finalStanding != null)
    .sort((a, b) => (a.finalStanding ?? 0) - (b.finalStanding ?? 0))
    .map((t) => ({
      rank: t.finalStanding as number,
      teamName: t.name,
      countryCode: t.countryCode,
      flagFile: t.flagFile,
    }));

  const minRank = rail.length ? rail[0].rank : startRank(group);
  const maxRank = rail.length ? rail[rail.length - 1].rank : 9999;

  let title: string;
  let medals: Bracket['medals'] = null;
  if (minRank === 1) {
    title = 'Championship Bracket';
    medals = {
      gold: rail.find((r) => r.rank === 1)?.teamName ?? null,
      silver: rail.find((r) => r.rank === 2)?.teamName ?? null,
      bronze: rail.find((r) => r.rank === 3)?.teamName ?? null,
    };
  } else if (rail.length) {
    title = `${ordinal(minRank)}–${ordinal(maxRank)} Place`;
  } else {
    title = groupTitle(group);
  }

  return { id: `${group}-${minRank}`, title, columns, rail, medals };
}

// Round labels for a bracket with `n` columns, ending in Final. e.g. n=4 →
// [Round 1, Quarterfinals, Semifinals, Final]; n=2 → [Semifinals, Final].
function relativeRoundLabels(n: number): string[] {
  const tail = ['Final', 'Semifinals', 'Quarterfinals', 'Round 1'];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    // The earliest column (i=0) should be "Round 1" when n is large; fill from
    // the tail so the LAST column is always "Final".
    const fromEnd = n - 1 - i;
    out.push(tail[Math.min(fromEnd, tail.length - 1)]);
  }
  // If deeper than our tail vocabulary, the earliest columns all read "Round 1".
  return out;
}

function enrich(g: Game, level: RoundLevel, teamById: Map<string, Team>): BracketGame {
  const home = g.homeTeamId ? teamById.get(g.homeTeamId) : null;
  const away = g.awayTeamId ? teamById.get(g.awayTeamId) : null;
  return {
    id: g.id,
    level,
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

// Add games to the accumulator + register their teams in the set.
function collect(games: BracketGame[], into: BracketGame[], teamSet: Set<string>) {
  for (const g of games) {
    into.push(g);
    if (g.homeId) teamSet.add(g.homeId);
    if (g.awayId) teamSet.add(g.awayId);
  }
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

function startRank(group: string): number {
  const m = group.match(/\((\d+)-\d+\)/);
  return m ? Number(m[1]) : 9999;
}

function groupTitle(group: string): string {
  const m = group.match(/\((\d+)-(\d+)\)/);
  if (m) return `${ordinal(Number(m[1]))}–${ordinal(Number(m[2]))} Place`;
  return group;
}

function bracketMinRank(b: Bracket): number {
  return b.rail.length ? b.rail[0].rank : Number(b.id.split('-').pop()) || 9999;
}

// ── Vertical positioning (midpoint-of-sources, same as USAU tree) ──────────

function assignPositions(columns: RoundColumn[]): Map<string, number> {
  const positions = new Map<string, number>();
  const present = columns.filter((c) => c.games.length > 0);
  if (present.length === 0) return positions;

  // The FIRST present column is the base (deepest round) — position evenly.
  const base = present[0];
  base.games.forEach((g, i) => positions.set(g.id, i * ROW_PITCH_PX));

  // Each subsequent column: position each game at the midpoint of its sources
  // in the previous column.
  let prev: RoundColumn = base;
  for (let i = 1; i < present.length; i++) {
    const col = present[i];
    for (const g of col.games) {
      const sources = sourcesFor(g, prev.games);
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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
