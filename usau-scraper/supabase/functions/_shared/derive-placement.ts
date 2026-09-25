// ⚠️ SYNCED COPY of src/lib/usau/derive-placement.ts — edge functions can't import
// src/. Don't edit here: change the canonical file, re-copy it below these five
// lines, then redeploy sync-event-details + ingest-from-ultirzr:
//   { head -5 usau-scraper/supabase/functions/_shared/derive-placement.ts; cat src/lib/usau/derive-placement.ts; } > /tmp/dp.ts && mv /tmp/dp.ts usau-scraper/supabase/functions/_shared/derive-placement.ts
// In sync when this prints nothing: diff <(tail -n +6 usau-scraper/supabase/functions/_shared/derive-placement.ts) src/lib/usau/derive-placement.ts
// Derive each team's FINAL PLACEMENT at a USAU event from its bracket results.
//
// USAU never stores a team's finish directly (usau_event_teams.final_placement
// is unpopulated). It runs a ladder of brackets whose NAME encodes the place it
// awards ("Championship" → 1st, "5th Place" → 5th, "13th Place" → 13th) and whose
// GAMES (final/semi) order teams within that place range. This module turns that
// into a { teamId → place } map, per (event, gender_division).
//
// Rules (from recon over 1,330 CLUB events — see #18; fixed 2026-09-23):
//   • Partition by gender_division — one bracket_name spans every division at an
//     event (three "Championship Bracket" finals = three divisions' champions) —
//     and by masters group prefix ("GM Women · 1st Place").
//   • bracket_name is the AUTHORITY for which place; `round` only orders games
//     within a sub-bracket (and is unreliable — pool/bracket games alike sit in
//     round='other'). So: base place from the name, position from the games.
//     Only real place tokens count: ordinals, number ranges, "13 Place". Bare
//     indexes ("Round 1", "Seeding 2", "Games to 13") are not places.
//   • A place-N bracket's decider (its 'final', else the game between its two
//     semi winners, else its single game, else the one ladder game after its
//     single semi, else the game the place-(N-1) loser plays in it — a
//     game-to-go): winner → N, loser → N+1. A single semi's loser → N+2.
//   • Semifinal losers in a place-N bracket → N+2. If a 3rd-place-style game
//     between them exists (present only ~69% of the time), its winner → N+2,
//     loser → N+3. A rematch in any other bracket AFTER the semis orders them
//     the same way; otherwise both tie at N+2.
//   • A team finishes where the LAST (lowest-ranked) placement bracket it
//     played in put it: a game-to-go / backdoor bracket decides after the one
//     that first placed it, so a final loser who then loses the 2nd-place game
//     is 3rd, not 2nd. If that bracket can't place it, it stays unplaced. A
//     bracket at N+1 that the place-N loser never plays in awards N+2 onward.
//   • EXCLUDE non-placement brackets (Play-In, Qualification) — they decide
//     next-season seeding / Worlds qualification, not this event's finish. A
//     numbered game-to-go ("2nd Place Game to Go") awards its place.
//   • Only status='final' games count.
//
// Deliberately conservative: when the data can't place a team unambiguously we
// leave it UNPLACED rather than guess — a wrong placement is worse than none.
//
// ⚠️ MIRROR: usau-scraper/supabase/functions/_shared/derive-placement.ts is a
// SYNCED COPY (edge functions can't import src/). After any change re-copy the
// body below the header and redeploy sync-event-details + ingest-from-ultirzr.

export interface DerivePlacementGame {
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  round: string; // pool|prequarter|quarter|semi|final|placement|consolation|other
  bracketName: string | null;
  /** Gender division of the game (teams never cross divisions). */
  division: string | null;
  /** Start time (ISO). Orders a semi-loser rematch against the semis; null = unknown. */
  scheduledAt?: string | null;
}

const WORD_ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18,
  nineteenth: 19, twenty: 20, twentieth: 20, 'twenty-first': 21,
};

// Playful bracket names USAU organizers use — decode to their place number.
// ("Ninals" = 9th finals pun; "Fivals" = 5th; "Sevals" = 7th, etc.)
const PUN_ORDINALS: Record<string, number> = {
  ninals: 9, fivals: 5, sevals: 7, threevals: 3, elevals: 11, thirteenals: 13,
};

// An ordinal that numbers a round/day/seed is not a place ("2nd Round Swiss").
const NOT_A_PLACE_AFTER = /^\s*(?:round|rd\b|day|seed|draw)/;

/** Bracket names that do NOT award a final placement at THIS event. */
function isNonPlacementBracket(t: string): boolean {
  return (
    t.includes('play in') ||
    t.includes('play-in') ||
    t.includes('playin') ||
    t.includes('qualification') ||
    t.includes('qualifier') ||
    t.includes('pre-quarter') || // pre-quarters aren't a placement bracket
    /^pool\b/.test(t) ||
    t === 'rr' ||
    t.includes('round robin') ||
    t === '.' ||
    t === 'a' ||
    t === 'b'
  );
}

/**
 * Base placement a bracket name awards (its WINNER's finish), or null when the
 * name carries no placement signal / is a non-placement bracket.
 *   "Championship Bracket" | "1st Place" | "Finals" → 1
 *   "5th Place" | "Fifth Place" | "Fivals"          → 5
 *   "13th Place Bracket" | "13th Place Seeding 2"   → 13
 *   "9th/10th Place" | "7/8" | "Third/Fourth"       → the LOWER number (9, 7, 3)
 *   "Round 1" | "Pool A - Games to 13" | "Tier 2"   → null (an index, not a place)
 * A masters group prefix ("GGM Men · 5th Place") is ignored.
 */
export function bracketBasePlace(name: string | null | undefined): number | null {
  const raw = (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const t = raw.replace(/^[^·]*·\s*/, '');
  if (!t) return null;
  if (isNonPlacementBracket(t)) return null;

  // Pun ordinals ("Ninals" → 9, "Fivals" → 5) — check FIRST so "Ninals" isn't
  // caught by the "finals" championship test below.
  for (const [word, n] of Object.entries(PUN_ORDINALS)) {
    if (t.includes(word)) return n;
  }

  // Championship = 1st, however spelled (incl. the "chumpionship"/"ship" jokes).
  if (
    t.includes('championship') ||
    t.includes('chumpionship') ||
    t === "bro we won the 'ship!" ||
    raw === 'finals' || // a bare "Final(s)" — behind a masters group prefix it isn't the title game
    raw === 'final'
  ) {
    return 1;
  }

  // Place tokens only, lowest wins (the bracket is named for the top place it
  // can award): number ranges ("7/8", "9-11th", "13-18"), ordinals ("13th"),
  // and a bare number beside "place" ("13 Place"). A bare index elsewhere —
  // "Round 1", "Seeding 2", "Game 2", "Games to 13", "Tier 3" — is not a place.
  const places: number[] = [];
  for (const m of t.matchAll(/\b(\d+)(?:st|nd|rd|th)?(?:\s*(?:\/|-|–|to)\s*\d+(?:st|nd|rd|th)?\b)+/g)) {
    places.push(parseInt(m[1], 10));
  }
  for (const m of t.matchAll(/\b(\d+)(?:st|nd|rd|th)\b/g)) {
    if (!NOT_A_PLACE_AFTER.test(t.slice(m.index! + m[0].length))) places.push(parseInt(m[1], 10));
  }
  for (const m of t.matchAll(/\b(\d+)\s+place\b|\bplace\s+(\d+)\b/g)) {
    places.push(parseInt(m[1] ?? m[2], 10));
  }
  const valid = places.filter((n) => n >= 1 && n <= 100);
  if (valid.length > 0) return Math.min(...valid);

  // Word ordinals ("Fifth Place", "Third/Fourth") — lowest wins here too.
  const words: number[] = [];
  for (const m of t.matchAll(/\b(twenty-first|[a-z]+)\b/g)) {
    const n = WORD_ORDINALS[m[1]];
    if (n != null && !NOT_A_PLACE_AFTER.test(t.slice(m.index! + m[0].length))) words.push(n);
  }
  return words.length > 0 ? Math.min(...words) : null; // no placement signal ("Consolation", "Elite")
}

function decided(g: DerivePlacementGame): boolean {
  return (
    g.scoreA != null &&
    g.scoreB != null &&
    g.scoreA !== g.scoreB &&
    g.teamAId != null &&
    g.teamBId != null
  );
}
const winner = (g: DerivePlacementGame) => (g.scoreA! > g.scoreB! ? g.teamAId! : g.teamBId!);
const loser = (g: DerivePlacementGame) => (g.scoreA! > g.scoreB! ? g.teamBId! : g.teamAId!);
const involves = (g: DerivePlacementGame, t: string) => g.teamAId === t || g.teamBId === t;
const pairs = (g: DerivePlacementGame, a: string, b: string) =>
  (g.teamAId === a && g.teamBId === b) || (g.teamAId === b && g.teamBId === a);
const timeOf = (g: DerivePlacementGame) => {
  const ms = g.scheduledAt ? Date.parse(g.scheduledAt) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

// Pool play, optionally behind a masters group prefix ("GGM Men · Pool A").
const POOL_RE = /^\s*([^·]*·\s*)?pool\b/i;

const MASTERS_LEVELS = new Set(['MASTERS', 'GRAND_MASTERS', 'GREAT_GRAND_MASTERS']);

/** The usau_teams fields a game's division comes from. */
export interface PlacementTeam {
  gender_division: string | null;
  competition_level: string | null;
}

/**
 * A game's `division` from its two team rows: the gender (team A's, else team
 * B's), split by level within the masters family — a Masters Championships
 * event runs Masters, GM and GGM brackets under one bracket name.
 */
export function gameDivision(a: PlacementTeam | null, b: PlacementTeam | null): string | null {
  const gender = a?.gender_division ?? b?.gender_division ?? null;
  const level = a?.competition_level ?? b?.competition_level ?? null;
  if (gender == null) return null;
  return level != null && MASTERS_LEVELS.has(level) ? `${gender} ${level}` : gender;
}

/**
 * The competition a game belongs to: its gender division, split further by a
 * masters group prefix — one combined masters event holds "Masters Women ·"
 * and "GM Women ·" brackets that each crown a champion.
 */
export function placementPartition(g: DerivePlacementGame): string {
  const prefix = /^\s*([^·]*?)\s*·/.exec(g.bracketName ?? '')?.[1]?.toLowerCase() ?? '';
  return `${g.division ?? '__none__'}|${prefix}`;
}

/**
 * Each decided game's partition. A team row missing its gender would split one
 * real bracket across partitions and invent lone-game brackets; teams linked by
 * games share a division, so a game without one takes the single division its
 * linked teams show.
 */
function partitionGames(games: DerivePlacementGame[]): Map<DerivePlacementGame, string> {
  const parent = new Map<string, string>();
  const root = (t: string): string => {
    let r = t;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(t, r);
    return r;
  };
  const decidedGames = games.filter(decided);
  for (const g of decidedGames) {
    for (const t of [g.teamAId!, g.teamBId!]) if (!parent.has(t)) parent.set(t, t);
    parent.set(root(g.teamAId!), root(g.teamBId!));
  }
  const known = new Map<string, Set<string>>();
  for (const g of decidedGames) {
    if (g.division == null) continue;
    const r = root(g.teamAId!);
    known.set(r, (known.get(r) ?? new Set<string>()).add(g.division));
  }
  const out = new Map<DerivePlacementGame, string>();
  for (const g of decidedGames) {
    const ks = known.get(root(g.teamAId!));
    const division = g.division ?? (ks?.size === 1 ? [...ks][0] : null);
    out.set(g, placementPartition({ ...g, division }));
  }
  return out;
}

/** A bracket (non-pool) game. An event is only settled once all of these are. */
export function isBracketGame(bracketName: string | null): boolean {
  return bracketName != null && !POOL_RE.test(bracketName);
}

// Rounds a ladder's deciding game carries (never an earlier bracket round).
const LADDER_ROUNDS = new Set(['placement', 'consolation', 'other']);

// A clock more than this far from the games it's compared with is a bad stamp
// (a 2020 game in a 2026 event), not an ordering.
const MAX_GAP_MS = 3 * 86_400_000;

interface Decider {
  game: DerivePlacementGame;
  /** The bracket's own final, when the place above's loser then played its
   *  winner (a game-to-go after the bracket): that final's loser is N+2. */
  before?: DerivePlacementGame;
}

/**
 * A place-N bracket's deciding game: winner → N, loser → N+1. `upperLoser` is
 * the loser of the place-(N-1) bracket's decider, when there is one.
 */
function findDecider(bg: DerivePlacementGame[], upperLoser: string | null): Decider | null {
  const own = ownDecider(bg, upperLoser);
  if (!own || !upperLoser || involves(own, upperLoser)) return own && { game: own };
  // The place above's loser met this bracket's winner after it: game-to-go.
  const g2g = bg.filter((g) => g !== own && pairs(g, upperLoser, winner(own)));
  return g2g.length === 1 ? { game: g2g[0], before: own } : { game: own };
}

function ownDecider(bg: DerivePlacementGame[], upperLoser: string | null): DerivePlacementGame | null {
  const finals = bg.filter((g) => g.round === 'final');
  const semis = bg.filter((g) => g.round === 'semi');
  //   1. the 'final' game if labeled (repeat rows of it must agree on the
  //      winner). Different 'final's on one weekend are quarters mislabeled
  //      'final'; the semis below find the real one.
  if (finals.length > 0 && finals.every((g) => pairs(g, finals[0].teamAId!, finals[0].teamBId!) && winner(g) === winner(finals[0]))) {
    return finals[0];
  }
  //   2. else, when there are 2 semis, the game between the two semi WINNERS
  //      (USAU sometimes mislabels a bracket's final as round='other' —
  //      "Ninals" etc. — so identify it by the pairing, not the label);
  if (semis.length === 2) {
    const [w1, w2] = semis.map(winner);
    return bg.find((g) => g.round !== 'semi' && pairs(g, w1, w2)) ?? null;
  }
  //   3. else a lone single game (2-team place bracket);
  if (semis.length === 0 && bg.length === 1) return bg[0];
  //   4. else a ladder: ONE semi whose winner plays exactly one more game (a
  //      2nd-place / game-to-go bracket — semi winner vs the final's loser).
  if (semis.length === 1 && finals.length === 0) {
    const w = winner(semis[0]);
    const semiAt = timeOf(semis[0]);
    const next = bg.filter((g) => {
      if (g === semis[0] || !LADDER_ROUNDS.has(g.round) || !involves(g, w)) return false;
      const at = timeOf(g);
      return semiAt == null || at == null || at >= semiAt;
    });
    if (next.length === 1) return next[0];
  }
  //   5. else a game-to-go the place above's loser plays in: that team's game
  //      (its last one, by the clock) — "2nd Place": the challenger vs the
  //      final's loser.
  if (upperLoser) {
    const mine = bg.filter((g) => g.round !== 'pool' && involves(g, upperLoser));
    if (mine.length === 1) return mine[0];
    const times = mine.map(timeOf);
    if (mine.length > 1 && times.every((t) => t != null)) {
      const latest = Math.max(...(times as number[]));
      const last = mine.filter((g) => timeOf(g) === latest);
      if (last.length === 1) return last[0];
    }
  }
  return null;
}

interface Award {
  team: string;
  place: number;
  /** Where the awarding bracket starts — matched against a team's last bracket. */
  base: number;
  /** When the game that settled it started (null = unknown). */
  at: number | null;
  /** From a semi-loser rematch: yields to that bracket's own result. */
  soft?: boolean;
}

interface PendingSemiLosers {
  base: number;
  l1: string;
  l2: string;
  semis: DerivePlacementGame[];
}

/** Placement brackets that follow a bracket starting at `base`. */
function isLaterStage(g: DerivePlacementGame, base: number): boolean {
  const b = bracketBasePlace(g.bracketName);
  return (b != null && b > base) || /game.?to.?go|g2g/i.test(g.bracketName ?? '');
}
/** Brackets played before the placement brackets. */
function isEarlierStage(g: DerivePlacementGame): boolean {
  return (
    g.round === 'prequarter' ||
    g.round === 'quarter' ||
    /crossover|play.?in|pre.?quarter|prelim/i.test(g.bracketName ?? '')
  );
}

/**
 * The game that orders two semi losers AFTER their semis (a game-to-go, a lower
 * placement bracket), null when they never met after, 'unknown' when they met
 * but neither the clock nor the bracket says whether it was after.
 */
function semiLoserRematch(divGames: DerivePlacementGame[], p: PendingSemiLosers): DerivePlacementGame | null | 'unknown' {
  const semiTimes = p.semis.map(timeOf);
  const known = semiTimes.every((t) => t != null);
  const semisStart = known ? Math.min(...(semiTimes as number[])) : null;
  const semisEnd = known ? Math.max(...(semiTimes as number[])) : null;
  const after: DerivePlacementGame[] = [];
  for (const g of divGames) {
    if (p.semis.includes(g) || !isBracketGame(g.bracketName) || g.round === 'pool' || !pairs(g, p.l1, p.l2)) continue;
    const t = timeOf(g);
    const at = t != null && semisEnd != null && Math.abs(t - semisEnd) <= MAX_GAP_MS ? t : null;
    if (semisEnd != null && at != null && at > semisEnd) after.push(g);
    else if (semisStart != null && at != null && at < semisStart) continue;
    else if (isLaterStage(g, p.base)) after.push(g);
    else if (!isEarlierStage(g)) return 'unknown';
  }
  if (after.length === 0) return null;
  if (after.every((g) => winner(g) === winner(after[0]))) return after[0];
  // Rematches disagree: the latest decides, if the clock can tell.
  const times = after.map(timeOf);
  if (times.some((t) => t == null)) return 'unknown';
  const latest = Math.max(...(times as number[]));
  const last = after.filter((g) => timeOf(g) === latest);
  return last.length === 1 ? last[0] : 'unknown';
}

/** Placements from ONE division's placement brackets. */
function divisionPlacements(divGames: DerivePlacementGame[], ambiguous: Set<string>): Map<string, number> {
  // Group this division's games by the base place their bracket awards.
  // Each bracket_name is a SELF-CONTAINED sub-bracket awarding places starting
  // at `base` (Championship=1, "5th Place"=5, "3rd Place"=3, "Ninals"=9…).
  const byBase = new Map<number, DerivePlacementGame[]>();
  for (const g of divGames) {
    const base = bracketBasePlace(g.bracketName);
    if (base == null) continue; // pool / non-placement / unrecognized
    let arr = byBase.get(base);
    if (!arr) { arr = []; byBase.set(base, arr); }
    arr.push(g);
  }
  // Different 'final's in one bracket more than a few days apart are several
  // seasons merged into one event (a year-less slug): nothing here holds.
  const merged = [...byBase.values()].some((bg) => {
    const times = bg.filter((g) => g.round === 'final').map(timeOf).filter((t): t is number => t != null);
    return times.length > 1 && Math.max(...times) - Math.min(...times) > MAX_GAP_MS;
  });
  if (merged) {
    for (const g of divGames) {
      ambiguous.add(g.teamAId!);
      ambiguous.add(g.teamBId!);
    }
    return new Map();
  }
  const deciders = new Map<number, Decider | null>();
  for (const base of [...byBase.keys()].sort((a, b) => a - b)) {
    const above = deciders.get(base - 1);
    deciders.set(base, findDecider(byBase.get(base)!, above ? loser(above.game) : null));
  }

  // A bracket one place below a decided bracket awards that place only when
  // the decider's loser plays in it (a 2nd-place game-to-go / backdoor
  // bracket). Otherwise it is for the places after: it starts one lower.
  const start = new Map<number, number>();
  for (const [base, bg] of byBase) {
    const above = deciders.get(base - 1);
    start.set(base, above != null && !bg.some((g) => involves(g, loser(above.game))) ? base + 1 : base);
  }
  const claims = new Map<number, number>();
  for (const s of start.values()) claims.set(s, (claims.get(s) ?? 0) + 1);

  // The placement brackets each team played in, by where they start, with its
  // last game time in each (null when any is unknown).
  const played = new Map<string, Map<number, number | null>>();
  for (const [base, bg] of byBase) {
    const s = start.get(base)!;
    for (const g of bg) {
      const at = timeOf(g);
      for (const t of [g.teamAId!, g.teamBId!]) {
        const byStart = played.get(t) ?? new Map<number, number | null>();
        const cur = byStart.has(s) ? byStart.get(s)! : at;
        byStart.set(s, cur == null || at == null ? null : Math.max(cur, at));
        played.set(t, byStart);
      }
    }
  }

  const awards: Award[] = [];
  const pending: PendingSemiLosers[] = [];
  for (const [base, bg] of byBase) {
    const b = start.get(base)!;
    if (claims.get(b)! > 1) continue; // a shifted bracket landed on another: can't tell them apart
    const found = deciders.get(base) ?? null;
    const decider = found?.game ?? null;
    if (decider) {
      const at = timeOf(decider);
      awards.push({ team: winner(decider), place: b, base: b, at }, { team: loser(decider), place: b + 1, base: b, at });
    }
    if (found?.before) {
      // A game-to-go after the bracket's own final: that final's loser is next.
      // Deeper places in this bracket are left unplaced.
      awards.push({ team: loser(found.before), place: b + 2, base: b, at: timeOf(found.before) });
      continue;
    }

    // Semifinal losers finish at b+2 / b+3.
    const semis = bg.filter((g) => g.round === 'semi');
    // A ladder's single semi: its loser finishes below the decider's loser.
    if (semis.length === 1 && decider && decider !== semis[0] && involves(decider, winner(semis[0]))) {
      awards.push({ team: loser(semis[0]), place: b + 2, base: b, at: timeOf(semis[0]) });
    }
    if (semis.length !== 2) continue;
    // A 3rd-place game WITHIN this bracket (the two semi losers meet again) →
    // its winner b+2, loser b+3.
    const [l1, l2] = semis.map(loser);
    const thirdGame = bg.find(
      (g) => g !== decider && g.round !== 'semi' && g.round !== 'pool' && pairs(g, l1, l2),
    );
    if (thirdGame) {
      const at = timeOf(thirdGame);
      awards.push({ team: winner(thirdGame), place: b + 2, base: b, at }, { team: loser(thirdGame), place: b + 3, base: b, at });
    } else {
      pending.push({ base: b, l1, l2, semis });
    }
  }

  // Semi losers with no 3rd-place game in their bracket:
  //   (b) they met again AFTER the semis (a game-to-go, a lower placement
  //       bracket) → that game orders them b+2 / b+3, as a result of the
  //       bracket it was played in unless that bracket places them itself; a
  //       rematch that can't be ordered leaves both unplaced;
  //   (c) otherwise they tie at b+2 (USAU's official standings tie for 3rd when
  //       no bronze game is played) — unless a bracket starting at b+2 exists,
  //       which is where they'd be placed.
  for (const p of pending) {
    const rematch = semiLoserRematch(divGames, p);
    if (rematch === 'unknown') {
      ambiguous.add(p.l1);
      ambiguous.add(p.l2);
    } else if (rematch) {
      const rb = bracketBasePlace(rematch.bracketName);
      const base = rb != null && start.has(rb) ? start.get(rb)! : p.base;
      const at = timeOf(rematch);
      awards.push(
        { team: winner(rematch), place: p.base + 2, base, at, soft: true },
        { team: loser(rematch), place: p.base + 3, base, at, soft: true },
      );
    } else if (!claims.has(p.base + 2)) {
      const times = p.semis.map(timeOf);
      const at = times.every((t) => t != null) ? Math.max(...(times as number[])) : null;
      awards.push({ team: p.l1, place: p.base + 2, base: p.base, at }, { team: p.l2, place: p.base + 2, base: p.base, at });
    }
  }

  // Each team finishes where its LAST (lowest-ranked) bracket put it; awards
  // there that disagree leave it unplaced. A last bracket that placed nothing
  // is skipped only when the team was done with it before an upper bracket's
  // placing game (Saturday seeding games like "AB Placement 2/3" ahead of
  // Sunday's final). Otherwise the team is unplaced: the upper bracket's place
  // no longer holds once it played on for lower places.
  const out = new Map<string, number>();
  for (const [team, byStart] of played) {
    const mine = awards.filter((a) => a.team === team);
    for (const lv of [...byStart.keys()].sort((x, y) => y - x)) {
      const here = mine.filter((a) => a.base === lv);
      const hard = here.filter((a) => !a.soft);
      const use = hard.length > 0 ? hard : here;
      if (use.length > 0) {
        if (use.some((a) => a.place !== use[0].place)) ambiguous.add(team);
        else out.set(team, use[0].place);
        break;
      }
      const doneAt = byStart.get(lv)!;
      const placedLater = mine.some(
        (a) => a.base < lv && a.at != null && doneAt != null && a.at > doneAt && a.at - doneAt <= MAX_GAP_MS,
      );
      if (!placedLater) break;
    }
  }
  return out;
}

export interface PlacementDerivation {
  placements: Map<string, number>;
  /** Teams whose bracket results contradict any single place: awards from their
   *  last bracket disagree, a semi-loser rematch can't be ordered, or two
   *  divisions place them differently. */
  ambiguous: Set<string>;
}

/**
 * Derive { teamId → finalPlacement } for ONE event across all its divisions,
 * plus the teams whose results contradict each other. Games from every
 * division are passed together; we partition internally. Only teams the
 * bracket results can place unambiguously are returned.
 */
export function derivePlacementsDetailed(games: DerivePlacementGame[]): PlacementDerivation {
  const byDivision = new Map<string, DerivePlacementGame[]>();
  for (const [g, div] of partitionGames(games)) {
    let arr = byDivision.get(div);
    if (!arr) { arr = []; byDivision.set(div, arr); }
    arr.push(g);
  }
  const ambiguous = new Set<string>();
  const placements = new Map<string, number>();
  for (const divGames of byDivision.values()) {
    for (const [team, place] of divisionPlacements(divGames, ambiguous)) {
      // A team placed in two divisions (a gender-less team row) differently is unplaced.
      if (placements.has(team) && placements.get(team) !== place) ambiguous.add(team);
      placements.set(team, place);
    }
  }
  for (const team of ambiguous) placements.delete(team);
  return { placements, ambiguous };
}

/** { teamId → finalPlacement } for ONE event — see derivePlacementsDetailed. */
export function derivePlacements(games: DerivePlacementGame[]): Map<string, number> {
  return derivePlacementsDetailed(games).placements;
}

export type PlacementChangeReason =
  | 'fill' // NULL → derived place
  | 'correct' // stored place → a different derived place
  | 'clear-conflict' // stored place collides: two 1sts / two 2nds / 3+ on one place
  | 'clear-contradicted' // the team's bracket results contradict any single place
  | 'clear-unsupported'; // current games no longer produce it (repair mode only)

export interface PlacementChange {
  from: number | null;
  to: number | null;
  reason: PlacementChangeReason;
}

export interface PlacementPlan {
  /** Rows to write, by team — only those whose final_placement changes. */
  changes: Map<string, PlacementChange>;
  /** Divisions whose derived places themselves broke integrity: nothing derived
   *  is written there, only stored conflicts are cleared. */
  untrustedDivisions: string[];
  /** Derived teams with no usau_event_teams row (can't be written). */
  unknownTeams: number;
}

/** Teams sharing a place illegally: two 1sts, two 2nds, or 3+ on one place. */
function conflicts(places: Array<[string, number]>): string[][] {
  const byPlace = new Map<number, string[]>();
  for (const [t, p] of places) byPlace.set(p, [...(byPlace.get(p) ?? []), t]);
  return [...byPlace].filter(([p, ts]) => (p <= 2 && ts.length > 1) || ts.length > 2).map(([, ts]) => ts);
}

/** Each team's division = its most common game partition, the one
 *  derivePlacements placed it in. */
function teamDivisions(games: DerivePlacementGame[]): (team: string) => string {
  const votes = new Map<string, Map<string, number>>();
  for (const [g, div] of partitionGames(games)) {
    for (const t of [g.teamAId!, g.teamBId!]) {
      const v = votes.get(t) ?? new Map<string, number>();
      v.set(div, (v.get(div) ?? 0) + 1);
      votes.set(t, v);
    }
  }
  return (t) =>
    [...(votes.get(t) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    '__none__';
}

/**
 * Stored places that break a division on their own (two 1sts, two 2nds, 3+ on
 * one place) — wrong whatever the brackets say, so clearable even while an
 * event still has unfinished games and can't be re-derived.
 */
export function storedConflicts(games: DerivePlacementGame[], stored: ReadonlyMap<string, number | null>): string[] {
  const divOf = teamDivisions(games);
  const byDiv = new Map<string, Array<[string, number]>>();
  for (const [t, p] of stored) if (p != null) byDiv.set(divOf(t), [...(byDiv.get(divOf(t)) ?? []), [t, p]]);
  return [...byDiv.values()].flatMap((places) => conflicts(places).flat());
}

/**
 * What to write to ONE finished event's usau_event_teams.final_placement —
 * the safety layer shared by scripts/derive-usau-placements.ts and the USAU
 * edge functions. Callers must only pass events whose bracket games are all
 * finished (isBracketGame + status).
 *   • Per division, the derived places must pass integrity (at most one 1st,
 *     one 2nd, two teams on any place). If not, nothing derived is written there.
 *   • A derived place replaces the stored one (recompute on change).
 *   • A stored place is cleared only when it's proven wrong: it collides with
 *     the division's places, or the team's results contradict any single place.
 *     `clearUnsupported` also clears stored places the current games no longer
 *     produce — the one-shot repair of the 07-20 backfill, never the edge path.
 */
export function planEventPlacements(
  games: DerivePlacementGame[],
  stored: ReadonlyMap<string, number | null>,
  opts: { clearUnsupported?: boolean } = {},
): PlacementPlan {
  const { placements, ambiguous } = derivePlacementsDetailed(games);
  const divOf = teamDivisions(games);
  const teamsByDiv = new Map<string, string[]>();
  for (const t of stored.keys()) teamsByDiv.set(divOf(t), [...(teamsByDiv.get(divOf(t)) ?? []), t]);

  const changes = new Map<string, PlacementChange>();
  const untrustedDivisions: string[] = [];
  for (const [div, teams] of teamsByDiv) {
    const target = new Map<string, number | null>();
    const reason = new Map<string, PlacementChangeReason>();
    const trusted = conflicts(teams.filter((t) => placements.has(t)).map((t) => [t, placements.get(t)!])).length === 0;
    if (!trusted) untrustedDivisions.push(div);
    for (const t of teams) {
      const s = stored.get(t) ?? null;
      if (trusted && placements.has(t)) {
        target.set(t, placements.get(t)!);
        reason.set(t, s == null ? 'fill' : 'correct');
      } else if (trusted && s != null && ambiguous.has(t)) {
        target.set(t, null);
        reason.set(t, 'clear-contradicted');
      } else if (trusted && s != null && opts.clearUnsupported) {
        target.set(t, null);
        reason.set(t, 'clear-unsupported');
      } else {
        target.set(t, s);
      }
    }
    // A kept stored place that collides is wrong: clear it (derived places win).
    const kept = [...target].filter((e): e is [string, number] => e[1] != null);
    for (const group of conflicts(kept)) {
      for (const t of group) {
        if (trusted && placements.has(t)) continue;
        target.set(t, null);
        reason.set(t, 'clear-conflict');
      }
    }
    for (const t of teams) {
      const from = stored.get(t) ?? null;
      const to = target.get(t) ?? null;
      if (from !== to) changes.set(t, { from, to, reason: reason.get(t)! });
    }
  }
  const unknownTeams = [...placements.keys()].filter((t) => !stored.has(t)).length;
  return { changes, untrustedDivisions, unknownTeams };
}
