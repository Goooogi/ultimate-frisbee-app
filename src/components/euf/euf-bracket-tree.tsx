'use client';

// EUF bracket tree — renders one bracket group (e.g. "Bracket 1-8") as a
// USAU-style tree: round columns left to right, cards positioned by the
// shared bracket-tree layout engine (src/lib/bracket-tree.ts), same card
// language as usau-bracket-tree.tsx (status row, team lines, box-score link).
//
// EUCS brackets are PLACEMENT brackets: the "Finals" round is four simultaneous
// games deciding 1st/3rd/5th/7th, not a single title game. So we label each
// final with the places it awards rather than calling them all "Final".
//
// Those labels come from the STORED euf_teams.final_placement (derived once by
// derive_euf_placements() in SQL) — this component does NOT re-derive them.
// An earlier version mirrored the SQL ordering rule here; that's the same
// TS-vs-SQL drift footgun as the 12-0 scoring mirror, and it can silently
// disagree with the standings table on the same page. Reading the stored value
// means a not-yet-derived event renders an unlabelled card instead of a
// confidently wrong one.

import { useMemo } from 'react';
import Link from 'next/link';
import type { EufGameCard } from '@/lib/euf/data';
import {
  bracketBucket,
  ordinal as sharedOrdinal,
  assignPositions as sharedAssignPositions,
  ROW_PITCH_PX,
  type BracketColumn,
} from '@/lib/bracket-tree';
import { eufGameDate, eufGameTime } from '@/lib/euf/format-date';
import { EufFlag } from './euf-flag';

/** "Bracket 1-8 Semifinals" → "Bracket 1-8"
 *
 *  Upstream writes the bracket range on EITHER side of the word: the tour stops
 *  use "Bracket 1-8 Finals" while EUCF 2023 uses "1-16 Bracket Finals". Only the
 *  prefix form was matched before, so EUCF 2023's 44 bracket games — the whole
 *  championship — fell through to the flat round lists and never drew a tree.
 *  Both shapes normalize to the same "Bracket {lo}-{hi}" key so bracketBucket()
 *  labels them identically. */
function bracketOf(roundName: string | null): string | null {
  if (!roundName) return null;
  const stripped = roundName.replace(/\s+(Quarterfinals|Semifinals|Finals)$/, '');
  const prefix = stripped.match(/^Bracket (\d+)-(\d+)$/);
  if (prefix) return `Bracket ${prefix[1]}-${prefix[2]}`;
  const suffix = stripped.match(/^(\d+)-(\d+) Bracket$/);
  if (suffix) return `Bracket ${suffix[1]}-${suffix[2]}`;
  return null;
}

/** Column index within a bracket. EUCF 2023 adds an explicit Quarterfinals
 *  round, so the tree is up to 3 columns of play plus the placement finals. */
function depthOf(roundName: string | null): number {
  if (!roundName) return 1;
  if (/Quarterfinals$/.test(roundName)) return 1;
  if (/Semifinals$/.test(roundName)) return 2;
  if (/Finals$/.test(roundName)) return 3;
  return 1;
}

const ORDINAL = sharedOrdinal;

export function hasEufBracket(games: EufGameCard[]): boolean {
  return games.some((g) => bracketOf(g.roundName));
}

/** teamId → final_placement, from the standings rows. */
export type PlacementMap = ReadonlyMap<string, number>;

export function EufBracketTree({
  games,
  placements,
}: {
  games: EufGameCard[];
  placements: PlacementMap;
}) {
  const bracketGames = games.filter((g) => bracketOf(g.roundName));
  if (!bracketGames.length) return null;

  // Group into brackets ("Bracket 1-8", "Bracket 9-16"), each with its rounds.
  const brackets = new Map<string, EufGameCard[]>();
  for (const g of bracketGames) {
    const b = bracketOf(g.roundName)!;
    if (!brackets.has(b)) brackets.set(b, []);
    brackets.get(b)!.push(g);
  }

  const ordered = [...brackets.entries()].sort((a, b) => {
    const la = Number(a[0].match(/(\d+)-/)?.[1] ?? 99);
    const lb = Number(b[0].match(/(\d+)-/)?.[1] ?? 99);
    return la - lb;
  });

  return (
    <div className="flex flex-col gap-8">
      {ordered.map(([name, list]) => (
        <BracketGroup key={name} name={name} games={list} placements={placements} />
      ))}
    </div>
  );
}

interface RoundColumn {
  key: 'qf' | 'sf' | 'final';
  label: string;
  games: EufGameCard[];
}

function BracketGroup({
  name,
  games,
  placements,
}: {
  name: string;
  games: EufGameCard[];
  placements: PlacementMap;
}) {
  // A placement game's places ARE its two teams' stored placements. Sorting the
  // finals by the better of the two puts the gold game first, 3rd/4th next, and
  // so on — no re-derivation, and it stays correct if the SQL rule ever changes.
  const placesOf = (g: EufGameCard): [number, number] | null => {
    const h = g.homeTeamId ? placements.get(g.homeTeamId) : undefined;
    const a = g.awayTeamId ? placements.get(g.awayTeamId) : undefined;
    if (h == null || a == null) return null;
    return h < a ? [h, a] : [a, h];
  };

  const columns = useMemo<RoundColumn[]>(() => {
    const qf = games.filter((g) => depthOf(g.roundName) === 1);
    const sf = games.filter((g) => depthOf(g.roundName) === 2);
    const finals = games
      .filter((g) => depthOf(g.roundName) === 3)
      .slice()
      .sort((a, b) => (placesOf(a)?.[0] ?? 99) - (placesOf(b)?.[0] ?? 99));
    return [
      { key: 'qf', label: 'Quarterfinals', games: qf },
      { key: 'sf', label: 'Semifinals', games: sf },
      { key: 'final', label: 'Placement', games: finals },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, placements]);

  const positions = useMemo(() => assignPositions(columns), [columns]);

  if (columns.every((c) => c.games.length === 0)) return null;

  return (
    <div>
      <h3 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-2 border-b border-hairline mb-4">
        {bracketBucket(name).label}
      </h3>

      {/* Mobile: vertical stack by round, latest round FIRST (placement finals
          lead, same rationale as the USAU tree — the result you care about
          leads on a phone). */}
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
                    <MatchCard
                      key={g.id}
                      game={g}
                      places={col.key === 'final' ? placesOf(g) : null}
                      compact
                    />
                  ))}
                </ul>
              </div>
            ),
        )}
      </div>

      {/* Desktop: horizontal columns with absolute-positioned cards */}
      <div className="hidden lg:block overflow-x-auto pb-2">
        <DesktopBracket columns={columns} positions={positions} placesOf={placesOf} />
      </div>
    </div>
  );
}

// ── Desktop bracket layout ────────────────────────────────────────────────

function DesktopBracket({
  columns,
  positions,
  placesOf,
}: {
  columns: RoundColumn[];
  positions: Map<string, number>;
  placesOf: (g: EufGameCard) => [number, number] | null;
}) {
  const baseCount = Math.max(0, ...columns.map((c) => c.games.length));
  const maxTop = Math.max(0, ...Array.from(positions.values()));
  const totalHeight = Math.max(baseCount * ROW_PITCH_PX, maxTop + ROW_PITCH_PX) + 32;

  const renderedColumns = columns.filter((c) => c.games.length > 0);

  return (
    <div
      className="grid gap-x-6 min-w-[700px] relative"
      style={{
        gridTemplateColumns: `repeat(${renderedColumns.length}, minmax(200px, 1fr))`,
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
                <MatchCard game={g} places={col.key === 'final' ? placesOf(g) : null} />
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
  places,
  compact = false,
}: {
  game: EufGameCard;
  places: [number, number] | null;
  compact?: boolean;
}) {
  const homeWon =
    game.homeScore != null && game.awayScore != null && game.homeScore > game.awayScore;
  const awayWon =
    game.homeScore != null && game.awayScore != null && game.awayScore > game.homeScore;
  const isForfeit = game.status === 'forfeit';

  const fieldLabel = game.field
    ? /^\d+[A-Za-z]?$/.test(game.field.trim())
      ? `Field ${game.field.trim()}`
      : game.field.trim()
    : null;
  const meta = [
    places ? `${ORDINAL(places[0])} / ${ORDINAL(places[1])} place` : null,
    fieldLabel,
    eufGameDate(game.scheduledAt) || null,
    eufGameTime(game.scheduledAt) || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="bg-surface rounded-card-sm shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-hairline gap-2">
        <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight truncate">
          {meta || (isForfeit ? 'Forfeit' : '')}
        </span>
        {isForfeit && (
          <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-muted font-tight flex-shrink-0">
            FF
          </span>
        )}
        {/* Box score lives on the game page. Team names below are their own
            links, so this is a separate affordance rather than wrapping the
            whole node — same rule as the flat game rows elsewhere in EUF. */}
        {game.eufGameId != null && (
          <Link
            href={`/euf/g/${game.id}`}
            aria-label={`Box score: ${game.homeName} vs ${game.awayName}`}
            className="text-muted no-underline hover:text-accent transition-colors flex-shrink-0 text-[9px] font-bold tracking-[0.16em] uppercase font-tight"
          >
            Box
          </Link>
        )}
      </div>
      <TeamLine
        teamId={game.homeTeamId}
        name={game.homeName}
        country={game.homeCountry}
        score={game.homeScore}
        won={homeWon}
        lost={awayWon}
        compact={compact}
      />
      <div className="h-px bg-hairline" />
      <TeamLine
        teamId={game.awayTeamId}
        name={game.awayName}
        country={game.awayCountry}
        score={game.awayScore}
        won={awayWon}
        lost={homeWon}
        compact={compact}
      />
    </article>
  );
}

function TeamLine({
  teamId,
  name,
  country,
  score,
  won,
  lost,
  compact,
}: {
  teamId: string | null;
  name: string;
  country: string | null;
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
      <EufFlag countryName={country} size={13} />
      <span className={`text-[13px] font-tight truncate ${fontWeight}`}>{name}</span>
    </span>
  );

  return (
    <div className={`flex items-center gap-3 px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      {teamId ? (
        <Link
          href={`/euf/teams/${teamId}`}
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

// ── Layout adapter ───────────────────────────────────────────────────────
// EUF games name their teams homeTeamId/awayTeamId; the shared engine wants
// homeId/awayId. Adapt at this boundary rather than renaming fields through a
// shipped component (same pattern as usau-bracket-tree.tsx's assignPositions).
function assignPositions(columns: RoundColumn[]): Map<string, number> {
  const adapted: BracketColumn[] = columns.map((c) => ({
    key: c.key,
    label: c.label,
    games: c.games.map((g) => ({ id: g.id, homeId: g.homeTeamId, awayId: g.awayTeamId })),
  }));
  const positions = sharedAssignPositions(adapted);
  columns.forEach((col, i) => {
    const order = new Map(adapted[i].games.map((g, idx) => [g.id, idx]));
    col.games.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
  });
  return positions;
}
