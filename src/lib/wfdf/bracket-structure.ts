// WFDF structural bracket derivation — builds the FULL bracket shape (future
// rounds, TBD slots) from the source's own scheduling metadata instead of
// reconstructing it from played results.
//
// TWIN: mobileapp-thelayout/src/lib/brackets/adapters/wfdf-structural.ts
// (the mobile app keeps a verbatim copy — keep the two in sync).
//
// HOW THE SOURCE ENCODES STRUCTURE (results.wfdf.sport, verified on WUCC 2026
// 2026-08-18, 80/80 predictions correct against since-seeded games):
//   Every unseeded slot carries a scheduling NAME + the POOL it is fed from:
//     "R1 Winner 3" / "QF Loser 2" / "SF Winner 1"  round-relative game refs
//     "Wx17" / "Lx17"                               crossover-style game refs
//     "1A"                                          pool position (1st, Pool A)
//   A game ref resolves to the from-pool's games ordered by wfdf_game_id,
//   index (N-1) mod count — numbering continues across sibling pools, hence
//   the modulo. Winner/Loser picks the side.
//
//   Round pools are CUMULATIVE per playoff group (same convention the legacy
//   reachability walk documents): "Playoff (1-32)" base → "… Round 1" → "…
//   Quarterfinals" → "… Semifinals" → "… Finals", every round holding both the
//   winner-path games and the parallel placement games, finals deciding one
//   adjacent rank pair each.
//
// WHAT THIS MODULE PRODUCES per rail (championship, 5th–8th, …):
//   • columns of REAL game rows chained through Winner-refs only — a
//     Loser-fed slot ends the chain and shows its placeholder text instead
//     (matches how brackets are conventionally drawn; the loser's origin game
//     already renders in its own rail),
//   • per-game fallback labels for unseeded sides ("W of R1 G3", "1st Pool A"),
//   • explicit feeder ids (sourceIds) so the layout engine can order and
//     connect columns with no team ids present,
//   • the rail's rank pair, derived purely from the W/L path signature —
//     fold the group's rank range once per round: Winner keeps the top half,
//     Loser drops to the bottom half.
//
// A group is eligible only when every Finals game's refs parse and resolve and
// every rank fold lands on an adjacent pair — anything else returns null and
// the caller keeps the legacy results-walk for that group.

import type { WfdfGameRow } from '@/lib/wfdf/data';
import { ordinal } from '@/lib/bracket-tree';

// ─── Round classification (superset of the legacy classifier: adds Round N) ──

const GROUP_RE =
  /^(Playoff \(\d+-\d+\)|Placement \(\d+-\d+\))(?:\s+(?:Round (\d+)|(Quarterfinals)|(Semifinals)|(Finals)))?$/;

interface StructRound {
  group: string;
  /** base 0 < Round n (1…) < QF 90 < SF 91 < Finals 92. */
  level: number;
}

export function classifyStructRound(pool: string | null): StructRound | null {
  if (!pool) return null;
  const m = pool.match(GROUP_RE);
  if (!m) return null;
  const group = m[1].trim();
  if (m[2] != null) return { group, level: Number(m[2]) };
  if (m[3]) return { group, level: 90 };
  if (m[4]) return { group, level: 91 };
  if (m[5]) return { group, level: 92 };
  return { group, level: 0 };
}

const LEVEL_FINAL = 92;

// ─── Scheduling-ref parsing + resolution ──────────────────────────────────────

interface GameRef {
  wl: 'W' | 'L';
  n: number;
  /** Short round token for display ("R1", "QF", "SF", "CX", null = plain). */
  round: string | null;
}

function parseGameRef(name: string | null): GameRef | null {
  if (!name) return null;
  let m = name.match(/^([WL])x(\d+)$/);
  if (m) return { wl: m[1] as 'W' | 'L', n: Number(m[2]), round: null };
  m = name.match(/^(R\d+|QF|SF) (Winner|Loser) (\d+)$/);
  if (m) return { wl: m[2] === 'Winner' ? 'W' : 'L', n: Number(m[3]), round: m[1] };
  return null;
}

/** Placeholder text for an unseeded side. Game refs render as "W of R1 G3";
 *  pool positions as "1st Pool A"; anything unrecognized keeps the raw text. */
function fallbackLabel(name: string | null, fromPool: string | null): string | null {
  if (!name) return null;
  const ref = parseGameRef(name);
  if (ref) {
    const round = ref.round ?? (fromPool && /crossover/i.test(fromPool) ? 'CX' : null);
    return `${ref.wl} of ${round ? `${round} ` : ''}G${ref.n}`;
  }
  const pos = name.match(/^(\d+)\s*([A-Za-z])$/);
  if (pos && fromPool) return `${ordinal(Number(pos[1]))} ${fromPool}`;
  return name;
}

// ─── Output shape ─────────────────────────────────────────────────────────────

export interface StructuralRail {
  group: string;
  /** Primary final's rank pair start (1 = championship). */
  minRank: number;
  /** Highest rank decided in this section (siblings included). */
  maxRank: number;
  /** Earliest round → final. The final column is [primary, …sibling finals]. */
  columns: WfdfGameRow[][];
  /** gameId → unseeded-side placeholder labels. */
  fallbacks: Map<string, { home: string | null; away: string | null }>;
  /** gameId → same-group Winner-ref feeder game ids (for engine linkage). */
  sources: Map<string, string[]>;
  /** gameId → placement label for final-column games ("3rd Place", "5th
   *  Place") — set for every final EXCEPT the championship pair (1/2), whose
   *  column label already reads "Final". Disambiguates the sibling finals
   *  sharing the final column (gold + bronze stacked under one "Final"). */
  finalLabels: Map<string, string>;
}

// ─── Derivation ───────────────────────────────────────────────────────────────

/**
 * Structural rails for ONE playoff group of ONE division, or null when the
 * group's scheduling metadata can't fully describe it (legacy events, partial
 * ingests) — the caller falls back to the results-walk for that group.
 *
 * @param divisionGames EVERY game of the division (pool play included) — refs
 *                      resolve into crossover and round-robin pools too.
 */
export function buildStructuralRails(
  group: string,
  divisionGames: WfdfGameRow[],
): StructuralRail[] | null {
  // From-pool game lists, ordered by the source's own game id.
  const byPool = new Map<string, WfdfGameRow[]>();
  for (const g of divisionGames) {
    if (!g.poolName) continue;
    const arr = byPool.get(g.poolName) ?? [];
    arr.push(g);
    byPool.set(g.poolName, arr);
  }
  for (const arr of byPool.values()) {
    arr.sort((a, b) => (a.wfdfGameId ?? 0) - (b.wfdfGameId ?? 0) || a.id.localeCompare(b.id));
  }

  const inGroup = (g: WfdfGameRow): StructRound | null => {
    const c = classifyStructRound(g.poolName);
    return c && c.group === group ? c : null;
  };
  const groupGames = divisionGames.filter((g) => inGroup(g));
  const finals = groupGames.filter((g) => inGroup(g)!.level === LEVEL_FINAL);
  if (finals.length === 0) return null;

  // Resolve one side's ref to its source game (null = unresolvable).
  const resolve = (name: string | null, fromPool: string | null): WfdfGameRow | null => {
    const ref = parseGameRef(name);
    if (!ref || !fromPool) return null;
    const pool = byPool.get(fromPool);
    if (!pool || pool.length === 0) return null;
    return pool[(ref.n - 1) % pool.length];
  };

  const rankRange = group.match(/\((\d+)-(\d+)\)/);
  if (!rankRange) return null;
  const groupLo = Number(rankRange[1]);
  const groupHi = Number(rankRange[2]);

  // Rank pair per final from its W/L path signature. The walk follows the home
  // side (both sides of a game share ref kind and from-pool in this format)
  // and stops when the chain leaves the group (base rounds are fed from pool
  // play / crossovers).
  const pairOf = (final: WfdfGameRow): [number, number] | null => {
    const flags: Array<'W' | 'L'> = [];
    let cur: WfdfGameRow | null = final;
    for (let step = 0; cur && step < 12; step++) {
      const ref = parseGameRef(cur.homeSchedulingName);
      if (!ref) break;
      const src = resolve(cur.homeSchedulingName, cur.homeSchedulingPool);
      if (!src) return null;
      if (!inGroup(src)) break;
      flags.push(ref.wl);
      cur = src;
    }
    flags.reverse();
    let lo = groupLo;
    let hi = groupHi;
    for (const f of flags) {
      const size = (hi - lo + 1) / 2;
      if (!Number.isInteger(size)) return null;
      if (f === 'W') hi -= size;
      else lo += size;
    }
    return hi === lo + 1 ? [lo, hi] : null;
  };

  // Both refs of a game, resolved. null when either side fails to parse.
  const refsOf = (g: WfdfGameRow): { wl: 'W' | 'L'; src: WfdfGameRow }[] | null => {
    const out: { wl: 'W' | 'L'; src: WfdfGameRow }[] = [];
    for (const side of ['home', 'away'] as const) {
      const name = side === 'home' ? g.homeSchedulingName : g.awaySchedulingName;
      const pool = side === 'home' ? g.homeSchedulingPool : g.awaySchedulingPool;
      const ref = parseGameRef(name);
      if (!ref) return null;
      const src = resolve(name, pool);
      if (!src) return null;
      out.push({ wl: ref.wl, src });
    }
    return out;
  };

  // Eligibility: every final must carry resolvable refs and a clean rank pair.
  const pairs = new Map<string, [number, number]>();
  for (const f of finals) {
    if (!refsOf(f)) return null;
    const p = pairOf(f);
    if (!p) return null;
    pairs.set(f.id, p);
  }

  const sortedFinals = [...finals].sort((a, b) => pairs.get(a.id)![0] - pairs.get(b.id)![0]);
  const srcKey = (g: WfdfGameRow) =>
    refsOf(g)!
      .map((r) => r.src.id)
      .sort()
      .join('|');

  const rails: StructuralRail[] = [];
  const usedFinals = new Set<string>();

  for (const final of sortedFinals) {
    if (usedFinals.has(final.id)) continue;
    usedFinals.add(final.id);

    // Sibling final(s): decided by the SAME source games (gold + bronze share
    // the semis; 5/6 + 7/8 share the 5–8 semis) — they render as extra cards
    // in this rail's final column instead of a bare single-card section.
    const siblings = sortedFinals.filter(
      (f) => !usedFinals.has(f.id) && srcKey(f) === srcKey(final),
    );
    for (const s of siblings) usedFinals.add(s.id);

    // Columns: chain Winner-refs backwards while they stay in-group. A
    // Loser-ref or out-of-group source ends the chain — that slot renders its
    // placeholder text.
    const columnsDesc: WfdfGameRow[][] = [];
    let frontier: WfdfGameRow[] = [final];
    for (let depth = 0; depth < 12; depth++) {
      const next: WfdfGameRow[] = [];
      let chained = true;
      for (const g of frontier) {
        const refs = refsOf(g);
        if (!refs || !refs.every((r) => r.wl === 'W' && inGroup(r.src))) {
          chained = false;
          break;
        }
        for (const r of refs) if (!next.some((x) => x.id === r.src.id)) next.push(r.src);
      }
      if (!chained || next.length === 0) break;
      columnsDesc.push(next);
      frontier = next;
    }
    const columns = [...columnsDesc].reverse();
    columns.push([final, ...siblings]);

    // Fallback labels + engine linkage for every rendered game.
    const fallbacks = new Map<string, { home: string | null; away: string | null }>();
    const sources = new Map<string, string[]>();
    for (const col of columns) {
      for (const g of col) {
        fallbacks.set(g.id, {
          home: g.homeTeamId ? null : fallbackLabel(g.homeSchedulingName, g.homeSchedulingPool),
          away: g.awayTeamId ? null : fallbackLabel(g.awaySchedulingName, g.awaySchedulingPool),
        });
        const refs = refsOf(g);
        if (refs && refs.every((r) => r.wl === 'W' && inGroup(r.src))) {
          sources.set(
            g.id,
            refs.map((r) => r.src.id),
          );
        }
      }
    }

    const pair = pairs.get(final.id)!;
    const maxRank = siblings.length
      ? Math.max(...siblings.map((s) => pairs.get(s.id)![1]), pair[1])
      : pair[1];

    const finalLabels = new Map<string, string>();
    for (const f of [final, ...siblings]) {
      const p = pairs.get(f.id)!;
      if (p[0] !== 1) finalLabels.set(f.id, `${ordinal(p[0])} Place`);
    }

    rails.push({ group, minRank: pair[0], maxRank, columns, fallbacks, sources, finalLabels });
  }

  rails.sort((a, b) => a.minRank - b.minRank);
  return rails;
}
