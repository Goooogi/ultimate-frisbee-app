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
import {
  bracketBucket,
  type BracketBucket,
  assignPositions as sharedAssignPositions,
  ROW_PITCH_PX,
} from '@/lib/bracket-tree';
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
  /** Render placement brackets (5th/9th/13th …) as extra trees alongside the
   *  championship. Off by default: the event page surfaces placement through
   *  its own dropdown filter, and rendering both duplicates every game. */
  includePlacement?: boolean;
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
// Layout math is shared across every league's bracket tree — see
// src/lib/bracket-tree.ts. USAU games name their teams teamAId/teamBId, so we
// adapt to the engine's homeId/awayId shape at this boundary rather than
// renaming fields through a shipped component.
function assignPositions(columns: RoundColumn[]): Map<string, number> {
  const adapted = columns.map((c) => ({
    key: c.key,
    label: c.label,
    games: c.games.map((g) => ({ id: g.id, homeId: g.teamAId, awayId: g.teamBId })),
  }));
  const positions = sharedAssignPositions(adapted);
  // The engine re-sorts each column into vertical order; mirror that ordering
  // back onto the real game arrays so render order matches the layout.
  columns.forEach((col, i) => {
    const order = new Map(adapted[i].games.map((g, idx) => [g.id, idx]));
    col.games.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
  });
  return positions;
}

/** The group prefix of a combined-event bracket name ("GM Women · 1st
 *  Place" → "GM Women"); '' when unprefixed. Combined masters championships
 *  run several INDEPENDENT championship brackets in one event (Masters /
 *  GM / GGM per gender) — the prefix is the only reliable way to tell a GM
 *  Women game from a GGM Women game within the games already loaded for the
 *  combined event. */
export function bracketGroupPrefix(name: string | null | undefined): string {
  if (!name) return '';
  const i = name.lastIndexOf('·');
  return i >= 0 ? name.slice(0, i).trim() : '';
}

/**
 * Renders a single already-filtered game list (one placement bracket, e.g.
 * "9th Place Bracket") as a bracket tree, with no heading of its own — the
 * caller (usau-event-detail's Bracket tab) supplies the label. Reuses the
 * same column-building + positioning as the championship tree so placement
 * brackets that are genuinely multi-round get the identical tree treatment.
 */
export function UsauPlacementBracketTree({
  games,
  venueState,
}: {
  games: Game[];
  venueState?: string | null;
}) {
  return <BracketTreeGroup games={games} label={null} venueState={venueState ?? null} />;
}

export function UsauBracketTree({ games, venueState, includePlacement = false }: Props) {
  // ── Which brackets this tree renders ──────────────────────────────────
  // Tournaments run parallel placement brackets (5th, 9th, 13th …) that decide
  // real finishes, and this component can bucket EVERY bracket game by
  // (group prefix, placement bucket) into its own labeled tree.
  //
  // But the event page already routes placement brackets to their own "5th
  // Place" / "9th Place" dropdown filter, so rendering them here too showed the
  // SAME games twice — and the duplicate read as a stray, final-less
  // "SEMIFINALS" column hanging off the championship tree (the 5th-place
  // bracket at the 2026 U.S. Open is 6 semis with no final). Default to
  // championship-only; callers with no placement UI of their own opt in.
  //
  // Group prefix still splits combined-masters events (Masters Mixed vs Grand
  // Masters Open) so unrelated brackets never share a tree.
  const groups = useMemo(() => {
    const bracketGames = games.filter(
      (g) => isBracketGame(g) && (includePlacement || isChampionshipBracket(g)),
    );
    const byKey = new Map<string, { prefix: string; bucket: BracketBucket; games: Game[] }>();
    for (const g of bracketGames) {
      const prefix = bracketGroupPrefix(g.bracketName);
      const bucket = bracketBucket(g.bracketName);
      const k = `${prefix}|${bucket.key}`;
      if (!byKey.has(k)) byKey.set(k, { prefix, bucket, games: [] });
      byKey.get(k)!.games.push(g);
    }
    return Array.from(byKey.values()).sort(
      (a, b) => a.prefix.localeCompare(b.prefix) || a.bucket.order - b.bucket.order,
    );
  }, [games, includePlacement]);

  if (groups.length === 0) return null;

  const multiPrefix = new Set(groups.map((g) => g.prefix)).size > 1;

  return (
    <section className="mb-10" aria-labelledby="bracket-heading">
      <h2
        id="bracket-heading"
        className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-4"
      >
        {groups.length > 1 ? 'Brackets' : 'Championship bracket'}
      </h2>
      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <BracketTreeGroup
            key={`${group.prefix}|${group.bucket.key}`}
            games={group.games}
            label={
              groups.length > 1
                ? [multiPrefix ? group.prefix : '', group.bucket.label]
                    .filter(Boolean)
                    .join(' · ')
                : null
            }
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
  // A de-overlap pass can push a later-round card below the base-column count
  // (two collided semis get spread to 156/260 while the QF column ends at 312),
  // so also honor the lowest positioned card + one card-height so nothing clips.
  // Height = whichever is taller: the base column's rows, or the lowest card a
  // de-overlap pass pushed down (two collided semis get spread to 156/260 while
  // the QF column ends at 312), plus breathing room.
  //
  // NOTE: no minimum-2-rows floor. Placement brackets are often a SINGLE game
  // (a lone 3rd-place final), and forcing two rows left a full empty row of
  // dead space under every one of them once side brackets started rendering.
  const maxTop = Math.max(0, ...Array.from(positions.values()));
  const totalHeight = Math.max(baseCount * ROW_PITCH_PX, maxTop + ROW_PITCH_PX) + 32;

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
        {/* Field + time. The bracket previously showed time only, so the field
            number was unavailable on exactly the games spectators travel for.
            `location` is usually a bare number ("7") but occasionally a full
            venue string, so only prefix "Field" for the bare-number form. */}
        <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight tabular truncate">
          {[
            game.location
              ? /^\d+[A-Za-z]?$/.test(game.location.trim())
                ? `Field ${game.location.trim()}`
                : game.location.trim()
              : null,
            formatGameTime(game.scheduledAt, venueState) || null,
          ]
            .filter(Boolean)
            .join(' · ')}
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
/**
 * Is this game part of ANY single-elimination bracket (championship or a
 * placement bracket)?
 *
 * isChampionshipBracket() below answers a narrower question — "is this the MAIN
 * bracket" — and is still used by the event page for its champion/medal logic.
 * The TREE uses this wider predicate so 5th/9th/13th-place brackets render too.
 *
 * A game qualifies when it has a tree-shaped round (prequarter/quarter/semi/
 * final) and its bracket name isn't a pool. Pool-play rows carry pool names and
 * non-tree rounds, so they're excluded; "Pool E"-style second-phase pools are
 * excluded here as well because they're round-robins, not trees.
 */
export function isBracketGame(g: Game): boolean {
  const TREE_ROUNDS = ['prequarter', 'quarter', 'semi', 'final'];
  if (!TREE_ROUNDS.includes(g.round)) return false;
  const raw = (g.bracketName ?? '').trim();
  if (!raw) return true; // untagged but tree-rounded — legacy events
  const lastDot = raw.lastIndexOf('\u00b7');
  const tail = (lastDot >= 0 ? raw.slice(lastDot + 1) : raw).trim().toLowerCase();
  if (/^pool\b/.test(tail)) return false;
  return true;
}

export function isChampionshipBracket(g: Game): boolean {
  const raw = g.bracketName ?? '';
  // Combined masters events prefix every bracket with a group ("Masters Mixed ·
  // Bracket Play"). Match on the TAIL after the last "·" so the exact-match
  // rules below ("bracket play", "championship", …) still fire — otherwise a
  // group-prefixed first-place bracket reads as unrecognized and its winner
  // never surfaces as champion.
  const lastDot = raw.lastIndexOf('·');
  const tail = lastDot >= 0 ? raw.slice(lastDot + 1) : raw;
  const b = tail.trim().toLowerCase();

  if (!b && ['quarter', 'semi', 'final'].includes(g.round)) return true;
  if (!b) return false;

  // Word-boundary the "1st place" / "first place" check — a naive substring
  // match also fires on "2**1st place**" / "3**1st place**", which pulled
  // Heavyweights' "21st/31st Place" side brackets into the championship tree and
  // overlapped the real semifinals. The \b before "1" fails inside "21".
  if (/\b1st place\b/.test(b) || /\bfirst place\b/.test(b)) return true;

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
  // PRE-QUARTERS are a real round in the data (`usau_game_round` has an explicit
  // 'prequarter' value — 1,347 club games across 245 events carry it), but this
  // builder used to look only at quarter/semi/final and so dropped every one of
  // them from the tree. A 16-team bracket rendered as if it started at the QFs.
  //
  // Prefer the explicit round. The old behavior — splitting round='quarter' by
  // scheduled DATE and calling the earlier day "Round 1" — is kept ONLY as a
  // fallback for events whose scraper run predates the prequarter tagging, so
  // those brackets don't regress to a single collapsed column.
  const prequarters = games.filter((g) => g.round === 'prequarter');
  const semis = games.filter((g) => g.round === 'semi');
  const finals = games.filter((g) => g.round === 'final');
  const quarters = games.filter((g) => g.round === 'quarter');

  let r1: Game[];
  let qf: Game[];
  if (prequarters.length > 0) {
    // Explicitly tagged: pre-quarters are their own column, quarters stay whole.
    r1 = prequarters;
    qf = quarters;
  } else {
    // Legacy fallback: infer an opening round from a two-date quarter split.
    const quarterDates = Array.from(
      new Set(
        quarters
          .map((g) => g.scheduledAt?.slice(0, 10))
          .filter((d): d is string => !!d),
      ),
    ).sort();
    if (quarterDates.length >= 2) {
      const earliest = quarterDates[0];
      r1 = quarters.filter((g) => g.scheduledAt?.slice(0, 10) === earliest);
      qf = quarters.filter((g) => g.scheduledAt?.slice(0, 10) !== earliest);
    } else {
      r1 = [];
      qf = quarters;
    }
  }

  // Initial sort: R1 by lower seed first (1-vs-16, 2-vs-15... feels right
  // even though college brackets use 1-bye + 5-vs-12 style). Later rounds
  // will get re-ordered by assignPositions().
  const sortBySeed = (a: Game, b: Game) =>
    (a.seedA ?? a.seedB ?? 99) - (b.seedA ?? b.seedB ?? 99);

  return [
    {
      key: 'r1',
      // Name the column for what it actually is when the round is tagged;
      // the date-split fallback can't know, so it stays the generic "Round 1".
      label: prequarters.length > 0 ? 'Pre-Quarters' : 'Round 1',
      games: r1.slice().sort(sortBySeed),
    },
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

/**
 * Find the games in `prevCol` that fed into `game`. A prev-col game is a
 * source if it contains either of `game`'s participating team ids. (A team
 * with a bye won't have a prev-col game — that participant gets ignored.)
 */
