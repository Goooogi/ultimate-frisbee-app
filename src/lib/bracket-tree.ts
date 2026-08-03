// Shared bracket-tree engine — league-agnostic layout for tournament brackets.
//
// WHY THIS EXISTS
// Three leagues render bracket trees (USAU, WFDF, EUF) and all three had their
// own copy of the same midpoint-of-sources layout math; wfdf-bracket-tree.tsx's
// own comments described its positioning as "same as USAU tree". This module is
// the single implementation.
//
// WHAT IS SHARED vs WHAT IS NOT
// Only the GENERIC parts live here: turning ordered round-columns into vertical
// pixel offsets, and the small value types the renderer needs. Round DERIVATION
// stays per-league, because each source encodes rounds completely differently:
//
//   USAU  round column + scheduled DATE (R1 and QF both store round='quarter')
//   WFDF  pool_name string, brackets partitioned by REACHABILITY
//   EUF   round-name text ("Bracket 1-8 Semifinals")
//
// Each league supplies an adapter that produces BracketColumn[]; everything
// downstream (positioning, de-overlap, ordering) is this file's job.

/** One game as the layout engine needs to see it. */
export interface BracketNode {
  id: string;
  /** Participating team ids. Used to link a game to the games that fed it.
   *  Nulls (byes / TBD) are ignored. */
  homeId: string | null;
  awayId: string | null;
}

/** One round, ordered earliest → latest (left → right on desktop).
 *  `key` is optional — the engine only needs the ordered games; leagues that
 *  already carry their own column identity (WFDF uses `level`) can omit it. */
export interface BracketColumn<T extends BracketNode = BracketNode> {
  key?: string;
  label?: string;
  games: T[];
}

/** Vertical pitch between stacked cards, in px. */
export const ROW_PITCH_PX = 104;

/**
 * Find the games in `prev` that fed into `game` — a previous-round game is a
 * source when it involved either of this game's teams. A team that had a bye
 * simply has no source, which the caller handles.
 */
export function sourcesFor<T extends BracketNode>(game: T, prev: readonly T[]): T[] {
  const ids = [game.homeId, game.awayId].filter((x): x is string => !!x);
  if (ids.length === 0) return [];
  return prev.filter(
    (c) => (c.homeId && ids.includes(c.homeId)) || (c.awayId && ids.includes(c.awayId)),
  );
}

/**
 * Assign every game a vertical pixel offset so the bracket reads as a tree:
 *   - the first non-empty column lays out evenly, top to bottom
 *   - each later game sits at the midpoint of the games that fed it
 *   - a game with one identifiable source (opponent had a bye) sits on it
 *   - a game with no identifiable source falls back to an even distribution
 *
 * Returns Map<game.id, top-px>.
 *
 * SIDE EFFECT: each column's `games` array is re-sorted into vertical order, so
 * render order matches visual order.
 *
 * The de-overlap pass matters: two games in one column can resolve to the SAME
 * midpoint and paint on top of each other (it happened with seed-ordered USAU
 * quarterfinals, where both semis straddled the full column and collapsed to the
 * same center). After sorting, any card closer than one pitch to its predecessor
 * is pushed down. This was USAU-only before and is now shared.
 */
export function assignPositions<T extends BracketNode>(
  columns: BracketColumn<T>[],
): Map<string, number> {
  const positions = new Map<string, number>();
  const present = columns.filter((c) => c.games.length > 0);
  if (present.length === 0) return positions;

  const base = present[0];
  base.games.forEach((g, i) => positions.set(g.id, i * ROW_PITCH_PX));
  const totalSlots = Math.max(base.games.length, 1);

  let prev = base;
  for (let i = 1; i < present.length; i++) {
    const col = present[i];

    for (const g of col.games) {
      const sources = sourcesFor(g, prev.games);
      if (sources.length === 0) {
        const idx = col.games.indexOf(g);
        const step = (totalSlots * ROW_PITCH_PX) / Math.max(col.games.length, 1);
        positions.set(g.id, idx * step + step / 2 - ROW_PITCH_PX / 2);
      } else {
        const tops = sources.map((s) => positions.get(s.id) ?? 0);
        positions.set(g.id, tops.reduce((a, b) => a + b, 0) / tops.length);
      }
    }

    col.games.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));

    for (let j = 1; j < col.games.length; j++) {
      const prevTop = positions.get(col.games[j - 1].id) ?? 0;
      const curTop = positions.get(col.games[j].id) ?? 0;
      const minTop = prevTop + ROW_PITCH_PX;
      if (curTop < minTop) positions.set(col.games[j].id, minTop);
    }

    prev = col;
  }

  return positions;
}

/** Pixel height a bracket needs, so the absolute-positioned column has a box. */
export function bracketHeight<T extends BracketNode>(
  columns: BracketColumn<T>[],
  positions: Map<string, number>,
): number {
  const baseCount = columns.find((c) => c.games.length > 0)?.games.length ?? 0;
  const maxTop = positions.size ? Math.max(...positions.values()) : 0;
  return Math.max(Math.max(baseCount, 2) * ROW_PITCH_PX, maxTop + ROW_PITCH_PX);
}

// ── Placement / sub-bracket naming ──────────────────────────────────────────
// Tournaments don't just run a championship bracket — they run parallel 5th-,
// 9th-, 13th-place brackets that decide real finishes. These helpers give every
// league one vocabulary for naming and ordering them.

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  twenty: 20, twentyfirst: 21, twentyfifth: 25,
};

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export interface BracketBucket {
  /** Stable grouping identity ('championship', 'p5', 'p9', …). */
  key: string;
  /** Human label ('Championship', '5th Place Bracket'). */
  label: string;
  /** Sort order — championship first, then ascending by starting place. */
  order: number;
  /** The place this bracket's winner earns (1 for championship). */
  startPlace: number | null;
}

/**
 * Normalize any league's bracket label into a placement bucket.
 *
 * Handles the shapes seen across all three sources:
 *   USAU  "1st Place", "1st Place Bracket", "Championship Bracket",
 *         "5th Place", "9th Place Bracket", "13th Place", "Fifth Place"
 *   EUF   "Bracket 1-8", "Bracket 9-16", "Bracket 1-4"
 *   WFDF  "Playoff (1-16)", "Playoff (17-24)"
 *
 * Combined-masters events prefix a group ("Masters Mixed · Bracket Play"), so we
 * read the tail after the last "·" — otherwise a group-prefixed first-place
 * bracket reads as unrecognized.
 */
export function bracketBucket(name: string | null | undefined): BracketBucket {
  const raw = (name ?? '').trim();
  const lastDot = raw.lastIndexOf('·');
  const tail = (lastDot >= 0 ? raw.slice(lastDot + 1) : raw).trim();
  const t = tail.toLowerCase();

  // Range forms carry their start place directly: "Bracket 9-16", "(17-24)".
  const range = t.match(/(?:bracket|playoff)?\s*\(?(\d+)\s*[-–]\s*(\d+)\)?/);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (lo >= 1 && hi > lo) {
      return lo === 1
        ? { key: 'championship', label: 'Championship', order: 0, startPlace: 1 }
        : {
            key: `p${lo}`,
            label: `${ordinal(lo)}–${ordinal(hi)} Place`,
            order: lo,
            startPlace: lo,
          };
    }
  }

  // Championship, however spelled. Word-boundary the "1st" so "21st"/"31st"
  // side brackets don't get pulled in as the championship.
  if (
    t.includes('championship') ||
    /\b1st\b/.test(t) ||
    t.includes('first place') ||
    t === 'finals' || t === 'final' ||
    t === 'bracket' || t === 'bracket play' || t === 'sunday bracket' ||
    t === 'champion bracket'
  ) {
    // "5th Place Championship" is a side bracket, not the main one.
    const ord = t.match(/\b(\d+)(st|nd|rd|th)\b/);
    if (!(ord && Number(ord[1]) >= 2)) {
      return { key: 'championship', label: 'Championship', order: 0, startPlace: 1 };
    }
  }

  const num = t.match(/\b(\d+)(st|nd|rd|th)\b/);
  let place: number | null = num ? Number(num[1]) : null;
  if (place == null) {
    for (const [word, n] of Object.entries(ORDINAL_WORDS)) {
      if (t.includes(word)) { place = n; break; }
    }
  }
  if (place != null && place >= 2) {
    return {
      key: `p${place}`,
      label: `${ordinal(place)} Place Bracket`,
      order: place,
      startPlace: place,
    };
  }

  // Second-phase pools routed into a bracket view carry no ordinal.
  const pool = t.match(/^pool\s+(\S+)$/);
  if (pool) return { key: `pool-${pool[1]}`, label: tail, order: 500, startPlace: null };

  return { key: 'other', label: tail || 'Other Bracket', order: 999, startPlace: null };
}
