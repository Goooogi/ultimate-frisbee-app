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
  key: 'r16' | 'r1' | 'qf' | 'sf' | 'final';
  games: Game[];
}

// Vertical pitch (height per "row slot") on desktop. The base column sets the
// unit; every later column anchors to its row slots so cards line up. Card
// height ≈ 88px; we leave a bit of breathing room.
// Layout math is shared across every league's bracket tree — see
// src/lib/bracket-tree.ts. USAU slots name their teams via the underlying
// game's teamAId/teamBId (null for placeholders), so we adapt to the engine's
// homeId/awayId shape at this boundary rather than renaming fields through a
// shipped component. Placeholder slots carry no team ids, so their linkage
// rides entirely on sourceIds — see slotToNode below for real-slot fallback.
function assignPositions(columns: SlotColumn[]): Map<string, number> {
  const adapted = columns.map((c) => ({
    key: c.key,
    label: c.label,
    games: c.slots.map((s) => ({
      id: s.id,
      homeId: s.game?.teamAId ?? null,
      awayId: s.game?.teamBId ?? null,
      sourceIds: s.sourceIds,
    })),
  }));
  const positions = sharedAssignPositions(adapted);
  // The engine re-sorts each column into vertical order; mirror that ordering
  // back onto the real slot arrays so render order matches the layout.
  columns.forEach((col, i) => {
    const order = new Map(adapted[i].games.map((g, idx) => [g.id, idx]));
    col.slots.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
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
  // ── Split into round columns, complete the bracket, assign positions ───
  const columns = useMemo(() => completeBracket(buildColumns(games)), [games]);
  const positions = useMemo(() => assignPositions(columns), [columns]);

  if (columns.every((c) => c.slots.length === 0)) {
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
            col.slots.length > 0 && (
              <div key={col.key}>
                <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
                  {col.label}
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {col.slots.map((s) => (
                    <MatchCard key={s.id} slot={s} venueState={venueState} compact />
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
  columns: SlotColumn[];
  positions: Map<string, number>;
  venueState: string | null;
}) {
  // Determine total height needed: the tallest column sets the pitch count
  // (small regionals brackets are just 2 semis + a final — don't reserve
  // four rows of blank space for those). 32 covers the round-label row.
  const baseCount = Math.max(0, ...columns.map((c) => c.slots.length));
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
  const renderedColumns = columns.filter((c) => c.slots.length > 0);

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
          {col.slots.map((s) => {
            const top = positions.get(s.id) ?? 0;
            return (
              <div
                key={s.id}
                className="absolute left-0 right-0"
                style={{ top: `${top + 32}px` }}
              >
                <MatchCard slot={s} venueState={venueState} />
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
  slot,
  venueState,
  compact = false,
}: {
  slot: Slot;
  venueState: string | null;
  compact?: boolean;
}) {
  const game = slot.game;
  const tag = `G${slot.number}`;

  // Wholly-synthesized slot (no stored row at all): a pure placeholder card
  // with only its "W of …" side labels and game-number tag.
  if (!game) {
    return (
      <article className="bg-surface rounded-card-sm overflow-hidden shadow-card">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-hairline">
          <StatusPill tone="upcoming" label="Upcoming" tag={tag} />
        </div>
        <TeamLine
          teamId={null}
          name={null}
          fallback={slot.aFallback}
          seed={null}
          score={null}
          won={false}
          lost={false}
          compact={compact}
        />
        <div className="h-px bg-hairline" />
        <TeamLine
          teamId={null}
          name={null}
          fallback={slot.bFallback}
          seed={null}
          score={null}
          won={false}
          lost={false}
          compact={compact}
        />
      </article>
    );
  }

  const aWon =
    game.scoreA != null && game.scoreB != null && game.scoreA > game.scoreB;
  const bWon =
    game.scoreA != null && game.scoreB != null && game.scoreB > game.scoreA;
  let tone = matchTone(game);
  let label = statusLabel(game);
  // A slot that names its origin isn't a bare "TBD" card anymore — it's a
  // scheduled game whose participants are pending, so it reads as upcoming
  // (cancelled keeps its own treatment via matchTone/statusLabel).
  if ((slot.aFallback || slot.bFallback) && tone === 'tbd' && game.status !== 'cancelled') {
    tone = 'upcoming';
    label = 'Upcoming';
  }
  // Cancelled games carry 0–0 in the DB; showing "0 0" under a Cancelled pill
  // reads like a played shutout, so blank the scores instead.
  const scoreA = tone === 'cancelled' ? null : game.scoreA;
  const scoreB = tone === 'cancelled' ? null : game.scoreB;

  return (
    <article
      className={[
        'bg-surface rounded-card-sm overflow-hidden transition-shadow',
        tone === 'live' ? 'shadow-lift ring-1 ring-accent/40' : 'shadow-card',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-hairline">
        <StatusPill tone={tone} label={label} tag={tag} />
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
        fallback={slot.aFallback}
        seed={game.seedA}
        score={scoreA}
        won={aWon}
        lost={bWon}
        compact={compact}
      />
      <div className="h-px bg-hairline" />
      <TeamLine
        teamId={game.teamBId}
        name={game.teamBName}
        fallback={slot.bFallback}
        seed={game.seedB}
        score={scoreB}
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
  fallback,
  seed,
  score,
  won,
  lost,
  compact,
}: {
  teamId: string | null;
  name: string | null;
  /** Shown in place of "TBD" when the team isn't decided yet but the slot's
   *  origin is known — USAU-style "W of Quarters G1". */
  fallback?: string | null;
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
        {name ?? fallback ?? 'TBD'}
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

type Tone = 'final' | 'live' | 'upcoming' | 'tbd' | 'cancelled';

function StatusPill({
  tone,
  label,
  tag,
}: {
  tone: Tone;
  label: string;
  /** Game number within its round ("G1") — USAU's own bracket-sheet numbering.
   *  Leads the strip, before the status label. */
  tag?: string;
}) {
  const toneClass = {
    final: 'text-faint',
    live: 'text-accent',
    upcoming: 'text-muted',
    tbd: 'text-faint',
    cancelled: 'text-faint',
  }[tone];

  return (
    <span className="inline-flex items-center gap-1.5">
      {tag && (
        <span className="inline-flex items-center rounded-full bg-ink/5 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.1em] text-muted font-tight tabular">
          {tag}
        </span>
      )}
      <span
        className={`inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.16em] uppercase font-tight ${toneClass}`}
      >
        {tone === 'live' && (
          <span className="w-[6px] h-[6px] rounded-full bg-accent animate-pulse" aria-hidden />
        )}
        {label}
      </span>
    </span>
  );
}

// 'forfeit' counts as decided and 'cancelled' gets its own pill — both
// otherwise fell through to "Upcoming", which read as a lie on games USAU
// called off (2026 Vacationland final washout).
function matchTone(game: Game): Tone {
  if (game.status === 'in_progress') return 'live';
  if (game.status === 'final' || game.status === 'forfeit') return 'final';
  if (game.status === 'cancelled') return 'cancelled';
  if (!game.teamAName && !game.teamBName) return 'tbd';
  return 'upcoming';
}

function statusLabel(game: Game): string {
  if (game.status === 'in_progress') return 'Live';
  if (game.status === 'final' || game.status === 'forfeit') return 'Final';
  if (game.status === 'cancelled') return 'Cancelled';
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
const TREE_ROUNDS = ['prequarter', 'quarter', 'semi', 'final'];

export function isBracketGame(g: Game): boolean {
  // 'other' is admitted so buildColumns can recover a round-of-16 / mislabeled
  // final from it (see recoverFeederRound). Games it doesn't claim are simply
  // ignored when the columns are built, so this widening can't leak stray
  // boxes into the tree.
  if (!TREE_ROUNDS.includes(g.round) && g.round !== 'other') return false;
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

  if (!b && ['prequarter', 'quarter', 'semi', 'final'].includes(g.round)) return true;
  if (!b) return false;

  // Word-boundary the "1st place" / "first place" check — a naive substring
  // match also fires on "2**1st place**" / "3**1st place**", which pulled
  // Heavyweights' "21st/31st Place" side brackets into the championship tree and
  // overlapped the real semifinals. The \b before "1" fails inside "21".
  if (/\b1st place\b/.test(b) || /\bfirst place\b/.test(b)) return true;

  // Bare "1st" / "champs" brackets (Cooler Classic, Portland) — accepted by the
  // server-side twin in data.ts since 2026-08-10; without them here the event
  // crowns a champion but renders no tree. Must run BEFORE the ordinal reject
  // ("1st" would fail it).
  if (b === '1st' || b === 'champs') return true;

  // Allow "Championship", "Championship Bracket", "Championship Final",
  // "National Championship", "Sectional Championship", "Regional
  // Championship", or "<Division> Championship" — but exclude things that
  // happen to contain "championship" plus an ordinal place ("5th Place
  // Championship") which signals a side bracket, not the main one.
  if (/\b\d+(st|nd|rd|th)\b/.test(b)) return false;
  // Seeding crossovers are NOT championship-bracket games: they only set
  // seeding for the bracket that follows.
  if (
    b.includes('consolation') ||
    b.includes('placement') ||
    b.includes('play in') ||
    b.includes('play-in') ||
    b.includes('crossover')
  ) return false;
  if (b === 'finals') return true;
  // The main pattern: "championship" possibly preceded by qualifiers, possibly followed by "bracket" or "final" or "game".
  if (/(^|\s)championship(\s+(bracket|final|game))?$/.test(b)) return true;
  if (/^(national|sectional|regional|open|men'?s|women'?s|mixed|men'?s division|women'?s division|mixed division)\s+championship$/.test(b)) return true;

  // Catch-all: generic "(the) bracket" / "bracket play" / "sunday bracket" names
  // used by smaller events where there's only one bracket on the page.
  if (b === 'bracket' || b === 'bracket play' || b === 'sunday bracket' || b === 'champion bracket') return true;

  // Championship play-in rounds stored as their own bracket ("Pre-Quarters" —
  // Ski Town Mixed). Exact match only, placed AFTER the ordinal reject so
  // "9th Place Pre-Quarters" still reads as a side bracket.
  if (b === 'pre-quarters' || b === 'prequarters' || b === 'pre quarters') return true;

  return false;
}

/**
 * Recover a feeder round stored as round='other' (the enum has no round-of-16).
 *
 * A game qualifies when it is outside the tree rounds and its WINNER appears in
 * one of the `openers` — the column that currently starts the tree. Matching on
 * the winner (not either team) is what keeps this tight: the loser of a real
 * feeder game drops to a placement bracket and never reappears upstream, so a
 * placement or consolation game can't sneak in.
 *
 * Only fires when the openers have known teams; an all-TBD opener column would
 * otherwise match nothing and cost nothing.
 */
function recoverFeederRound(games: Game[], openers: Game[]): Game[] {
  if (openers.length === 0) return [];

  const openerTeams = new Set<string>();
  for (const g of openers) {
    if (g.teamAId) openerTeams.add(g.teamAId);
    if (g.teamBId) openerTeams.add(g.teamBId);
  }
  if (openerTeams.size === 0) return [];

  return games.filter((g) => {
    if (TREE_ROUNDS.includes(g.round)) return false;
    if (!g.teamAId || !g.teamBId) return false;
    if (g.scoreA == null || g.scoreB == null || g.scoreA === g.scoreB) return false;
    const winner = g.scoreA > g.scoreB ? g.teamAId : g.teamBId;
    return openerTeams.has(winner);
  });
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
  let finals = games.filter((g) => g.round === 'final');
  const quarters = games.filter((g) => g.round === 'quarter');

  // Round-of-16 recovery. The usau_game_round enum tops out at 'prequarter', so
  // a bracket that opens with a round of 16 is stored as round='other' and was
  // dropped entirely — isBracketGame() rejects 'other' by default, so a whole
  // played round vanished from the tree while its winners appeared in the QFs.
  //
  // Identify it structurally rather than by name: an 'other' game in this
  // bracket whose winner plays in the round that opens the tree. That keeps a
  // genuinely unclassifiable game out while recovering a real feeder round.
  const openers = prequarters.length > 0 ? prequarters : quarters;
  const recovered = recoverFeederRound(games, openers);
  // Type the recovered round by SIZE: more games than the openers is a round
  // of 16; equal-or-fewer is a play-in/prequarter round feeding the openers
  // (Ski Town Mixed stores its play-ins as round='other', bracket
  // "Pre-Quarters"). Only claims the prequarter column when none is explicitly
  // tagged.
  const recoveredAsPrequarters =
    prequarters.length === 0 && recovered.length > 0 && recovered.length <= openers.length;
  const r16 = recoveredAsPrequarters ? [] : recovered;

  // USAU routinely mislabels a bracket's FINAL as round='other': a placement
  // bracket's semis store round='semi' but the deciding game stores 'other',
  // so the tree draws semis with no final. Recover it the same way — a game
  // outside the tree rounds whose two teams are both semi WINNERS is the final.
  if (finals.length === 0 && semis.length > 0) {
    const semiWinners = new Set(
      semis
        .map((g) =>
          g.scoreA != null && g.scoreB != null && g.scoreA !== g.scoreB
            ? (g.scoreA > g.scoreB ? g.teamAId : g.teamBId)
            : null,
        )
        .filter((id): id is string => !!id),
    );
    finals = games.filter(
      (g) =>
        !TREE_ROUNDS.includes(g.round) &&
        !!g.teamAId && !!g.teamBId &&
        semiWinners.has(g.teamAId) &&
        semiWinners.has(g.teamBId),
    );
  }

  let r1: Game[];
  let qf: Game[];
  if (prequarters.length > 0) {
    // Explicitly tagged: pre-quarters are their own column, quarters stay whole.
    r1 = prequarters;
    qf = quarters;
  } else if (recoveredAsPrequarters) {
    // Recovered play-in round takes the prequarter column; the date-split
    // fallback below must not also fire (it would double-claim quarters).
    r1 = recovered;
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

  // USAU's schedule-row ids are assigned in bracket-sheet order within a
  // bracket, and slot k of a round is fed by games 2k-1/2k of the previous
  // one. Sorting each column by that id makes the column order USAU's own
  // G1…Gn — which completeBracket then relies on for game numbers, feeder
  // pairing, and "W of …" labels. Seed order is the fallback for batches
  // whose ids are opaque hashes.
  const sortByBracketOrder = (a: Game, b: Game) =>
    (a.usauGameOrder ?? Number.MAX_SAFE_INTEGER) - (b.usauGameOrder ?? Number.MAX_SAFE_INTEGER) ||
    (a.seedA ?? a.seedB ?? 99) - (b.seedA ?? b.seedB ?? 99);

  return [
    { key: 'r16', label: 'Round of 16', games: r16.slice().sort(sortByBracketOrder) },
    {
      key: 'r1',
      // Name the column for what it actually is when the round is tagged or
      // recovered; the date-split fallback can't know, so it stays "Round 1".
      label: prequarters.length > 0 || recoveredAsPrequarters ? 'Pre-Quarters' : 'Round 1',
      games: r1.slice().sort(sortByBracketOrder),
    },
    { key: 'qf', label: 'Quarterfinals', games: qf.slice().sort(sortByBracketOrder) },
    { key: 'sf', label: 'Semifinals', games: semis.slice().sort(sortByBracketOrder) },
    { key: 'final', label: 'Final', games: finals.slice().sort(sortByBracketOrder) },
  ];
}

// ─── Full-bracket completion (USAU-parity placeholder slots) ─────────────────
//
// USAU renders the WHOLE bracket up front: every downstream game shows as a
// slot ("W of Quarters G1" vs "W of Quarters G2") with its round + game number,
// even before any team is known. The rows themselves are purely data-driven, so
// this pass adds the structural layer on top of buildColumns' output:
//
//   • every game gets its USAU game number within its round (G1…Gn — column
//     order is bracket-sheet order, see sortByBracketOrder),
//   • a real row whose team(s) aren't decided yet gets "W of <round> G<n>"
//     side labels derived from its feeder slots, plus explicit sourceIds so
//     the layout engine can order/connect it despite having no team ids,
//   • rounds USAU omitted entirely are synthesized as placeholder slots, so a
//     bracket that only has its opening round stored still renders its full
//     shape through the final.

interface Slot {
  /** Real row id, or a synthetic `ph-…` id for a synthesized slot. */
  id: string;
  game: Game | null;
  /** 1-based game number within the round (USAU's G1…Gn). */
  number: number;
  /** Feeder slot ids in the previous column. */
  sourceIds: string[];
  /** Side labels used when the team is unknown ("W of Quarters G1"). */
  aFallback: string | null;
  bFallback: string | null;
}

export interface SlotColumn {
  key: string;
  label: string;
  slots: Slot[];
}

/** Short round names for "W of …" labels (USAU wording). */
const FEEDER_SHORT: Record<string, string> = {
  r16: 'R16',
  r1: 'Prequarters',
  qf: 'Quarters',
  sf: 'Semis',
};

function wOf(prevKey: string, n: number): string {
  return `W of ${FEEDER_SHORT[prevKey] ?? 'Round'} G${n}`;
}

function isDecidedForTree(g: Game): boolean {
  const s = g.status.toLowerCase();
  if (s === 'forfeit') return true;
  return s === 'final' && g.scoreA != null && g.scoreB != null && g.scoreA !== g.scoreB;
}

function treeWinnerId(g: Game): string | null {
  if (!isDecidedForTree(g) || g.scoreA == null || g.scoreB == null || g.scoreA === g.scoreB) {
    return null;
  }
  return g.scoreA > g.scoreB ? g.teamAId : g.teamBId;
}

/** Slot for a real row: attach feeders, derive side labels for unknown sides. */
function makeRealSlot(g: Game, idx: number, feeders: Slot[], prevKey: string): Slot {
  const known = [g.teamAId, g.teamBId].filter((id): id is string => !!id);

  // The structural pairing (slot k ← feeders 2k-1/2k) is an assumption about
  // USAU's sheet — verify it wherever the data can speak, and drop the linkage
  // for this slot when contradicted (team-id links still apply naturally).
  let fs = feeders;
  if (fs.length > 0 && known.length > 0) {
    const winners = fs
      .map((f) => (f.game ? treeWinnerId(f.game) : null))
      .filter((id): id is string => !!id);
    const contradicted =
      known.length === 2
        ? winners.some((w) => !known.includes(w))
        : winners.length === fs.length && !winners.includes(known[0]);
    if (contradicted) fs = [];
  }

  let aFallback: string | null = null;
  let bFallback: string | null = null;
  if (fs.length === 2) {
    // Which feeder feeds which side: when a side's team already appears in a
    // feeder's row, that feeder is its source; otherwise positional (top
    // feeder → side A).
    const inFeeder = (teamId: string | null, f: Slot): boolean =>
      teamId != null &&
      f.game != null &&
      (f.game.teamAId === teamId || f.game.teamBId === teamId);
    let [fa, fb] = fs;
    if (inFeeder(g.teamAId, fb) || inFeeder(g.teamBId, fa)) [fa, fb] = [fb, fa];
    if (g.teamAId == null) aFallback = wOf(prevKey, fa.number);
    if (g.teamBId == null) bFallback = wOf(prevKey, fb.number);
  } else if (fs.length === 1) {
    // Play-in feeder (prequarter → quarter): only the open side gets a label.
    if (g.teamAId == null) aFallback = wOf(prevKey, fs[0].number);
    else if (g.teamBId == null) bFallback = wOf(prevKey, fs[0].number);
  }

  return {
    id: g.id,
    game: g,
    number: idx + 1,
    sourceIds: fs.map((f) => f.id),
    aFallback,
    bFallback,
  };
}

// Rounds a synthesized chain can step through. 'r1' (prequarters) never
// synthesizes forward: a prequarter round is by definition a partial play-in
// (some quarter slots are byes), so its count says nothing about the quarters'.
const SYNTH_NEXT: Record<string, { key: string; label: string }> = {
  r16: { key: 'qf', label: 'Quarterfinals' },
  qf: { key: 'sf', label: 'Semifinals' },
  sf: { key: 'final', label: 'Final' },
};

/**
 * Turn buildColumns' output into slot columns: number every game, link each
 * round to its feeders, label undecided sides, and synthesize wholly-missing
 * downstream rounds.
 *
 * Feeder linkage between two present rounds fires when the counts relate
 * structurally: next = prev/2 (two feeders per slot) or next = prev (play-in,
 * one feeder per slot). Anything else leaves the games unlinked — team-id
 * linkage still applies — rather than guessing.
 *
 * Synthesis fires only past the LAST stored round, only from a power-of-2
 * column that can halve cleanly to a final, and only while that round is not
 * fully decided — a decided round with no stored successor is historical data
 * that genuinely ends there, and a synthesized never-resolving slot would
 * misread as an upcoming game.
 */
function completeBracket(cols: RoundColumn[]): SlotColumn[] {
  const present = cols.filter((c) => c.games.length > 0);
  if (present.length === 0) return [];

  const out: SlotColumn[] = [
    {
      key: present[0].key,
      label: present[0].label,
      slots: present[0].games.map((g, i) => ({
        id: g.id,
        game: g,
        number: i + 1,
        sourceIds: [],
        aFallback: null,
        bFallback: null,
      })),
    },
  ];

  for (let i = 1; i < present.length; i++) {
    const col = present[i];
    const prev = out[out.length - 1];
    const half = col.games.length * 2 === prev.slots.length;
    // Positional linkage is only trusted for the halving case and 1↔1 chains.
    // Same-sized rounds (4 play-ins → 4 QFs) looked positional but real data
    // disproved it — Ski Town Mixed slots play-in G4's winner into QF G1, so an
    // equal-count guess renders wrong "W of …" labels on unplayed rounds.
    // (Played feeders get rescued by the winner-contradiction check either
    // way; unplayed ones have nothing to contradict.)
    const chain = col.games.length === 1 && prev.slots.length === 1;
    out.push({
      key: col.key,
      label: col.label,
      slots: col.games.map((g, j) =>
        makeRealSlot(
          g,
          j,
          half
            ? [prev.slots[2 * j], prev.slots[2 * j + 1]]
            : chain
              ? [prev.slots[0]]
              : [],
          prev.key,
        ),
      ),
    });
  }

  let last = out[out.length - 1];
  const isPow2 = (n: number) => n >= 2 && (n & (n - 1)) === 0;
  while (
    SYNTH_NEXT[last.key] != null &&
    isPow2(last.slots.length) &&
    last.slots.some((s) => !s.game || !isDecidedForTree(s.game))
  ) {
    const next = SYNTH_NEXT[last.key];
    const slots: Slot[] = [];
    for (let j = 0; j < last.slots.length / 2; j++) {
      const fa = last.slots[2 * j];
      const fb = last.slots[2 * j + 1];
      slots.push({
        id: `ph-${next.key}-${j}`,
        game: null,
        number: j + 1,
        sourceIds: [fa.id, fb.id],
        aFallback: wOf(last.key, fa.number),
        bFallback: wOf(last.key, fb.number),
      });
    }
    last = { key: next.key, label: next.label, slots };
    out.push(last);
  }

  return out;
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
