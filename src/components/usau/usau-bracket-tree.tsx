'use client';

// Tournament bracket tree visualization for USAU events.
//
// Takes a flat list of championship-bracket games (already gender-filtered
// by the parent UsauEventDetail) and derives a left-to-right tree:
//   R1 (8 games) → QFs (8) → SFs (4) → Final
//
// The parser stores Friday R1 + Saturday QFs both as round='quarter'. We
// split them by scheduled date: earliest-date quarters = R1, later = QFs.
//
// Layout strategy: dependency-driven. Each card in column N+1 is positioned
// at the vertical midpoint of its source card(s) in column N. This makes
// the visual flow read "R1 game → QF game" without explicit connector
// lines. Source detection is by team participation — a QF feeding from R1
// must contain at least one of the R1 winners (or both teams if neither
// had a bye).

import { useMemo } from 'react';
import Link from 'next/link';
import type { UsauEventSummary } from '@/lib/usau/data';
import { formatGameTime } from '@/lib/usau/venue-tz';

type Game = UsauEventSummary['games'][number];
type Team = UsauEventSummary['teams'][number];

interface Props {
  games: Game[];
  /** Currently filtered teams. Reserved for future use (e.g. displaying
   *  bye seeds explicitly); the bracket tree itself derives everything
   *  from the games array. */
  teams: Team[];
  /** The event's US state — game times are shown as the VENUE's wall clock
   *  (scheduled_at is a true UTC instant; see lib/usau/venue-tz). */
  venueState?: string | null;
}

interface RoundColumn {
  /** Display label for this column. */
  label: string;
  /** Stable key. */
  key: 'r1' | 'qf' | 'sf' | 'final';
  games: Game[];
}

// Vertical pitch (height per "row slot") on desktop. R1 sets the base unit;
// every later column anchors to row slots in R1 so cards line up. Card
// height ≈ 88px; we leave a bit of breathing room.
const ROW_PITCH_PX = 104;

/** The group prefix of a combined-event bracket name ("GM Women · 1st
 *  Place" → "GM Women"); '' when unprefixed. Combined masters championships
 *  run several INDEPENDENT championship brackets in one event (Masters /
 *  GM / GGM per gender) — the prefix is the only reliable way to tell a GM
 *  Women game from a GGM Women game (GGM teams share the GRAND_MASTERS
 *  level tag, so team-level filtering can't separate them). */
export function bracketGroupPrefix(name: string | null | undefined): string {
  if (!name) return '';
  const i = name.lastIndexOf('·');
  return i >= 0 ? name.slice(0, i).trim() : '';
}

export function UsauBracketTree({ games, venueState }: Props) {
  // ── Pull championship-bracket games, split by group prefix ─────────────
  // One tree per independent championship bracket. Single-group events
  // (nearly all) render exactly as before; combined masters championships
  // render one labeled tree per group instead of merging unrelated
  // brackets into overlapping cards.
  const groups = useMemo(() => {
    const champGames = games.filter((g) => isChampionshipBracket(g));
    const byPrefix = new Map<string, Game[]>();
    for (const g of champGames) {
      const k = bracketGroupPrefix(g.bracketName);
      if (!byPrefix.has(k)) byPrefix.set(k, []);
      byPrefix.get(k)!.push(g);
    }
    return Array.from(byPrefix.entries())
      .map(([label, gs]) => ({ label, games: gs }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [games]);

  if (groups.length === 0) return null;

  return (
    <section className="mb-10" aria-labelledby="bracket-heading">
      <h2
        id="bracket-heading"
        className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-4"
      >
        Championship bracket
      </h2>
      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <BracketTreeGroup
            key={group.label || 'main'}
            games={group.games}
            label={groups.length > 1 ? group.label : null}
            venueState={venueState ?? null}
          />
        ))}
      </div>
    </section>
  );
}

function BracketTreeGroup({
  games,
  label,
  venueState,
}: {
  games: Game[];
  label: string | null;
  venueState: string | null;
}) {
  // ── Split into round columns + assign vertical positions ───────────────
  const columns = useMemo(() => buildColumns(games), [games]);
  const positions = useMemo(() => assignPositions(columns), [columns]);

  if (columns.every((c) => c.games.length === 0)) {
    return null;
  }

  return (
    <div>
      {label && (
        <h3 className="font-display italic font-bold text-[20px] leading-tight tracking-[-0.02em] text-ink mb-3">
          {label}
        </h3>
      )}

      {/* Mobile: vertical stack by round, latest round FIRST (Final → SF → QF
          → R1). On a phone the result you care about is the championship, so it
          leads; the desktop bracket below keeps the natural left-to-right
          feed into the final on the right. */}
      <div className="lg:hidden flex flex-col gap-5">
        {[...columns].reverse().map(
          (col) =>
            col.games.length > 0 && (
              <div key={col.key}>
                <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
                  {col.label}
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {col.games.map((g) => (
                    <MatchCard key={g.id} game={g} venueState={venueState} compact />
                  ))}
                </ul>
              </div>
            ),
        )}
      </div>

      {/* Desktop: horizontal columns with absolute-positioned cards */}
      <div className="hidden lg:block overflow-x-auto pb-2">
        <DesktopBracket columns={columns} positions={positions} venueState={venueState} />
      </div>
    </div>
  );
}

// ── Desktop bracket layout ────────────────────────────────────────────────

function DesktopBracket({
  columns,
  positions,
  venueState,
}: {
  columns: RoundColumn[];
  positions: Map<string, number>;
  venueState: string | null;
}) {
  // Determine total height needed: the tallest column sets the pitch count
  // (small regionals brackets are just 2 semis + a final — don't reserve
  // four rows of blank space for those). 32 covers the round-label row.
  const baseCount = Math.max(0, ...columns.map((c) => c.games.length));
  const totalHeight = Math.max(baseCount, 2) * ROW_PITCH_PX + 32;

  // Column count drives grid template.
  const renderedColumns = columns.filter((c) => c.games.length > 0);

  return (
    <div
      className="grid gap-x-6 min-w-[920px] relative"
      style={{
        gridTemplateColumns: `repeat(${renderedColumns.length}, minmax(180px, 1fr))`,
        height: `${totalHeight}px`,
      }}
    >
      {renderedColumns.map((col) => (
        <div key={col.key} className="relative h-full">
          <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-3 text-center h-[20px]">
            {col.label}
          </div>
          {col.games.map((g) => {
            const top = positions.get(g.id) ?? 0;
            return (
              <div
                key={g.id}
                className="absolute left-0 right-0"
                style={{ top: `${top + 32}px` }}
              >
                <MatchCard game={g} venueState={venueState} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Match card ────────────────────────────────────────────────────────────

function MatchCard({
  game,
  venueState,
  compact = false,
}: {
  game: Game;
  venueState: string | null;
  compact?: boolean;
}) {
  const aWon =
    game.scoreA != null && game.scoreB != null && game.scoreA > game.scoreB;
  const bWon =
    game.scoreA != null && game.scoreB != null && game.scoreB > game.scoreA;
  const tone = matchTone(game);

  return (
    <article
      className={[
        'bg-surface rounded-card-sm overflow-hidden transition-shadow',
        tone === 'live' ? 'shadow-lift ring-1 ring-accent/40' : 'shadow-card',
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-hairline">
        <StatusPill tone={tone} label={statusLabel(game)} />
        <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight tabular">
          {formatGameTime(game.scheduledAt, venueState)}
        </span>
      </div>
      <TeamLine
        teamId={game.teamAId}
        name={game.teamAName}
        seed={game.seedA}
        score={game.scoreA}
        won={aWon}
        lost={bWon}
        compact={compact}
      />
      <div className="h-px bg-hairline" />
      <TeamLine
        teamId={game.teamBId}
        name={game.teamBName}
        seed={game.seedB}
        score={game.scoreB}
        won={bWon}
        lost={aWon}
        compact={compact}
      />
    </article>
  );
}

function TeamLine({
  teamId,
  name,
  seed,
  score,
  won,
  lost,
  compact,
}: {
  teamId: string | null;
  name: string | null;
  seed: number | null;
  score: number | null;
  won: boolean;
  lost: boolean;
  compact?: boolean;
}) {
  const labelColor = won ? 'text-ink' : lost ? 'text-faint' : 'text-muted';
  const scoreColor = won ? 'text-accent' : lost ? 'text-faint' : 'text-muted';
  const fontWeight = won ? 'font-bold' : 'font-semibold';

  const inner = (
    <span className={`flex items-center gap-2 flex-1 min-w-0 ${labelColor}`}>
      {seed != null && (
        <span className="tabular text-[10px] text-faint font-bold w-4 text-right shrink-0">
          {seed}
        </span>
      )}
      <span className={`text-[13px] font-tight truncate ${fontWeight}`}>
        {name ?? 'TBD'}
      </span>
    </span>
  );

  return (
    <div className={`flex items-center gap-3 px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      {teamId ? (
        <Link
          href={`/usau/teams/${teamId}`}
          className="flex-1 min-w-0 hover:opacity-80 transition-opacity no-underline"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex-1 min-w-0">{inner}</span>
      )}
      <span
        className={`tabular text-[15px] font-bold font-tight leading-none w-7 text-right ${scoreColor}`}
      >
        {score ?? '–'}
      </span>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────

type Tone = 'final' | 'live' | 'upcoming' | 'tbd';

function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const toneClass = {
    final: 'text-faint',
    live: 'text-accent',
    upcoming: 'text-muted',
    tbd: 'text-faint',
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.16em] uppercase font-tight ${toneClass}`}
    >
      {tone === 'live' && (
        <span className="w-[6px] h-[6px] rounded-full bg-accent animate-pulse" aria-hidden />
      )}
      {label}
    </span>
  );
}

function matchTone(game: Game): Tone {
  if (game.status === 'in_progress') return 'live';
  if (game.status === 'final') return 'final';
  if (!game.teamAName && !game.teamBName) return 'tbd';
  return 'upcoming';
}

function statusLabel(game: Game): string {
  if (game.status === 'in_progress') return 'Live';
  if (game.status === 'final') return 'Final';
  if (!game.teamAName && !game.teamBName) return 'TBD';
  return 'Upcoming';
}

// ── Helpers: filter, columns, position assignment ────────────────────────

/**
 * Decide whether a game belongs to the "the championship bracket" — the
 * main winner's bracket of the event, which we render as a visual tree.
 *
 * USAU's bracket_name values are inconsistent across events:
 *   D-I Nationals 2026          → "1st Place"
 *   North Central Regional      → "Championship Bracket"
 *   Many regionals              → "Championship"
 *   Older events                → "First Place Bracket" / "Championship Final"
 *   Multi-format events         → "Open Championship" / "Women's Division Championship"
 *
 * Match strategy: lowercased name either (a) contains a "1st/first place"
 * marker, or (b) is exactly one of the known championship phrases (or a
 * "{division} Championship" form), or (c) lacks a bracket_name but has a
 * tree-round (legacy fallback).
 */
export function isChampionshipBracket(g: Game): boolean {
  const raw = g.bracketName ?? '';
  const b = raw.trim().toLowerCase();

  if (!b && ['quarter', 'semi', 'final'].includes(g.round)) return true;
  if (!b) return false;

  if (b.includes('1st place') || b.includes('first place')) return true;

  // Allow "Championship", "Championship Bracket", "Championship Final",
  // "National Championship", "Sectional Championship", "Regional
  // Championship", or "<Division> Championship" — but exclude things that
  // happen to contain "championship" plus an ordinal place ("5th Place
  // Championship") which signals a side bracket, not the main one.
  if (/\b\d+(st|nd|rd|th)\b/.test(b)) return false;
  if (b.includes('consolation') || b.includes('placement') || b.includes('play in') || b.includes('play-in')) return false;
  if (b === 'finals') return true;
  // The main pattern: "championship" possibly preceded by qualifiers, possibly followed by "bracket" or "final" or "game".
  if (/(^|\s)championship(\s+(bracket|final|game))?$/.test(b)) return true;
  if (/^(national|sectional|regional|open|men'?s|women'?s|mixed|men'?s division|women'?s division|mixed division)\s+championship$/.test(b)) return true;

  // Catch-all: generic "(the) bracket" / "bracket play" / "sunday bracket" names
  // used by smaller events where there's only one bracket on the page.
  if (b === 'bracket' || b === 'bracket play' || b === 'sunday bracket' || b === 'champion bracket') return true;

  return false;
}

function buildColumns(games: Game[]): RoundColumn[] {
  // Split round='quarter' into R1 (earlier date) vs QF (later date).
  const quarters = games.filter((g) => g.round === 'quarter');
  const semis = games.filter((g) => g.round === 'semi');
  const finals = games.filter((g) => g.round === 'final');

  const quarterDates = Array.from(
    new Set(
      quarters
        .map((g) => g.scheduledAt?.slice(0, 10))
        .filter((d): d is string => !!d),
    ),
  ).sort();

  let r1: Game[] = [];
  let qf: Game[] = quarters;
  if (quarterDates.length >= 2) {
    const earliest = quarterDates[0];
    r1 = quarters.filter((g) => g.scheduledAt?.slice(0, 10) === earliest);
    qf = quarters.filter((g) => g.scheduledAt?.slice(0, 10) !== earliest);
  }

  // Initial sort: R1 by lower seed first (1-vs-16, 2-vs-15... feels right
  // even though college brackets use 1-bye + 5-vs-12 style). Later rounds
  // will get re-ordered by assignPositions().
  const sortBySeed = (a: Game, b: Game) =>
    (a.seedA ?? a.seedB ?? 99) - (b.seedA ?? b.seedB ?? 99);

  return [
    { key: 'r1', label: 'Round 1', games: r1.slice().sort(sortBySeed) },
    { key: 'qf', label: 'Quarterfinals', games: qf.slice().sort(sortBySeed) },
    { key: 'sf', label: 'Semifinals', games: semis.slice().sort(sortBySeed) },
    { key: 'final', label: 'Final', games: finals.slice().sort(sortBySeed) },
  ];
}

/**
 * Assign each game a vertical pixel offset so:
 *   - R1 column lays out evenly top-to-bottom
 *   - Each later-round game sits at the midpoint between its source games
 *   - When a game has only one identifiable source (the other team had a
 *     bye), it sits at the row of its source
 *   - Games without any identifiable source fall back to an even distribution
 *
 * Returns a Map<game.id, top-px-offset>.
 *
 * Side-effect: also mutates each column's games array to be **ordered by
 * vertical position** so the bracket reads top-to-bottom in render order.
 * (We re-sort the array, not just compute positions, so the column lays
 * out without depending on insertion order.)
 */
function assignPositions(columns: RoundColumn[]): Map<string, number> {
  const positions = new Map<string, number>();

  // The base "row scale" is the FIRST NON-EMPTY column (r1 → qf → sf →
  // final) so column height matches the longest column. Small brackets
  // (regionals: 2 semis + a final, no quarters) previously bailed here and
  // left every card at top=0 — the semis rendered stacked on each other.
  const baseColumn = columns.find((c) => c.games.length > 0);
  if (!baseColumn) return positions;

  // Assign R1 positions: 0, pitch, 2*pitch, ...
  baseColumn.games.forEach((g, i) => {
    positions.set(g.id, i * ROW_PITCH_PX);
  });

  // For each subsequent column, position each game at the midpoint of its
  // source-game positions. Process in order: r1 → qf → sf → final.
  const orderedKeys: RoundColumn['key'][] = ['r1', 'qf', 'sf', 'final'];
  let prevCol: RoundColumn | null = baseColumn;
  for (const k of orderedKeys) {
    if (k === baseColumn.key) continue;
    const col = columns.find((c) => c.key === k);
    if (!col || col.games.length === 0) continue;

    for (const g of col.games) {
      const sources = findSources(g, prevCol);
      if (sources.length === 0) {
        // No matched source — fall back to even distribution across
        // baseColumn's total height.
        const idx = col.games.indexOf(g);
        const totalSlots = baseColumn.games.length;
        const step = (totalSlots * ROW_PITCH_PX) / Math.max(col.games.length, 1);
        positions.set(g.id, idx * step + step / 2 - ROW_PITCH_PX / 2);
      } else {
        const tops = sources.map((s) => positions.get(s.id) ?? 0);
        const avg = tops.reduce((a, b) => a + b, 0) / tops.length;
        positions.set(g.id, avg);
      }
    }

    // Re-sort the column array so render order matches vertical order.
    col.games.sort(
      (a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0),
    );
    prevCol = col;
  }

  return positions;
}

/**
 * Find the games in `prevCol` that fed into `game`. A prev-col game is a
 * source if it contains either of `game`'s participating team ids. (A team
 * with a bye won't have a prev-col game — that participant gets ignored.)
 */
function findSources(game: Game, prevCol: RoundColumn | null): Game[] {
  if (!prevCol) return [];
  const ids = [game.teamAId, game.teamBId].filter((x): x is string => !!x);
  if (ids.length === 0) return [];
  const sources: Game[] = [];
  for (const candidate of prevCol.games) {
    if (
      (candidate.teamAId && ids.includes(candidate.teamAId)) ||
      (candidate.teamBId && ids.includes(candidate.teamBId))
    ) {
      sources.push(candidate);
    }
  }
  return sources;
}
