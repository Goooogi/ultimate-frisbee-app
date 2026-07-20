// Derive each team's FINAL PLACEMENT at a USAU event from its bracket results.
//
// USAU never stores a team's finish directly (usau_event_teams.final_placement
// is unpopulated). It runs a ladder of brackets whose NAME encodes the place it
// awards ("Championship" → 1st, "5th Place" → 5th, "13th Place" → 13th) and whose
// GAMES (final/semi) order teams within that place range. This module turns that
// into a { teamId → place } map, per (event, gender_division).
//
// Rules (from recon over 1,330 CLUB events — see #18):
//   • Partition by gender_division — one bracket_name spans every division at an
//     event (three "Championship Bracket" finals = three divisions' champions).
//   • bracket_name is the AUTHORITY for which place; `round` only orders games
//     within a sub-bracket (and is unreliable — pool/bracket games alike sit in
//     round='other'). So: base place from the name, position from the games.
//   • A place-N bracket's decider (its 'final', else its single game, else its
//     highest-round game): winner → N, loser → N+1.
//   • Semifinal losers in a place-N bracket → N+2. If a 3rd-place-style game
//     between them exists (present only ~69% of the time), its winner → N+2,
//     loser → N+3; otherwise both tie at N+2.
//   • EXCLUDE non-placement brackets (Play-In, Qualification, Game-to-Go) — they
//     decide next-season seeding / Worlds qualification, not this event's finish.
//   • Only status='final' games count.
//
// Deliberately conservative: when the data can't place a team unambiguously we
// leave it UNPLACED rather than guess — a wrong placement is worse than none.

export interface DerivePlacementGame {
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  round: string; // pool|prequarter|quarter|semi|final|placement|consolation|other
  bracketName: string | null;
  /** Gender division of the game (teams never cross divisions). */
  division: string | null;
}

const WORD_ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, nineteenth: 19,
  twenty: 20, 'twenty-first': 21,
};

// Playful bracket names USAU organizers use — decode to their place number.
// ("Ninals" = 9th finals pun; "Fivals" = 5th; "Sevals" = 7th, etc.)
const PUN_ORDINALS: Record<string, number> = {
  ninals: 9, fivals: 5, sevals: 7, threevals: 3, elevals: 11, thirteenals: 13,
};

/** Bracket names that do NOT award a final placement at THIS event. */
function isNonPlacementBracket(t: string): boolean {
  return (
    t.includes('play in') ||
    t.includes('play-in') ||
    t.includes('playin') ||
    t.includes('qualification') ||
    t.includes('qualifier') ||
    t.includes('game to go') ||
    t.includes('g2g') ||
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
 *   "13th Place Bracket"                            → 13
 *   "9th/10th Place" | "7/8"                        → the LOWER number (9, 7)
 */
export function bracketBasePlace(name: string | null | undefined): number | null {
  const t = (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
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
    /\b1st\b/.test(t) ||
    t.includes('first place') ||
    t === 'finals' ||
    t === 'final'
  ) {
    return 1;
  }

  // Numeric ordinal — take the FIRST/lowest number in slash forms ("9th/10th",
  // "7/8 bracket"): the bracket is named for the top place it can award.
  const nums = [...t.matchAll(/\b(\d+)(?:st|nd|rd|th)?\b/g)].map((m) => parseInt(m[1], 10));
  if (nums.length > 0) {
    const min = Math.min(...nums.filter((n) => n >= 1 && n <= 100));
    if (Number.isFinite(min)) return min;
  }

  // Word ordinal ("Fifth Place", "Ninth Place Bracket").
  for (const [word, n] of Object.entries(WORD_ORDINALS)) {
    if (t.includes(word)) return n;
  }

  return null; // no placement signal (consolation without a number, "Elite", etc.)
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

/**
 * Derive { teamId → finalPlacement } for ONE event across all its divisions.
 * Games from every division are passed together; we partition internally.
 * Only teams the bracket results can place unambiguously are returned.
 */
export function derivePlacements(games: DerivePlacementGame[]): Map<string, number> {
  const out = new Map<string, number>();

  // Partition by division, then by base-place bracket.
  const byDivision = new Map<string, DerivePlacementGame[]>();
  for (const g of games) {
    if (!decided(g)) continue;
    const div = g.division ?? '__none__';
    let arr = byDivision.get(div);
    if (!arr) { arr = []; byDivision.set(div, arr); }
    arr.push(g);
  }

  for (const divGames of byDivision.values()) {
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
    const hasBracketAt = (place: number) => byBase.has(place);

    for (const [base, bg] of byBase) {
      const finals = bg.filter((g) => g.round === 'final');
      const semis = bg.filter((g) => g.round === 'semi');

      // Decider (awards `base` / `base+1`):
      //   1. the 'final' game if labeled;
      //   2. else, when there are 2 semis, the game between the two semi WINNERS
      //      (USAU sometimes mislabels a bracket's final as round='other' —
      //      "Ninals" etc. — so identify it by the pairing, not the label);
      //   3. else a lone single game (2-team place bracket).
      let decider: DerivePlacementGame | null = null;
      if (finals.length === 1) {
        decider = finals[0];
      } else if (semis.length === 2) {
        const [w1, w2] = semis.map(winner);
        decider =
          bg.find(
            (g) =>
              g.round !== 'semi' &&
              ((g.teamAId === w1 && g.teamBId === w2) || (g.teamAId === w2 && g.teamBId === w1)),
          ) ?? null;
      } else if (finals.length === 0 && semis.length === 0 && bg.length === 1) {
        decider = bg[0];
      }

      if (decider) {
        setBest(out, winner(decider), base);
        setBest(out, loser(decider), base + 1);
      }

      // Semifinal losers finish at base+2 / base+3. USAU decides those two spots
      // one of three ways:
      //   (a) a 3rd-place game WITHIN this bracket (the two semi losers meet
      //       again) → its winner base+2, loser base+3;
      //   (b) a SEPARATE downstream placement bracket exists at base+2 (e.g. the
      //       Championship's semi losers drop into a "3rd Place" bracket) → let
      //       THAT bracket place them, don't tie here;
      //   (c) neither → the two semi losers tie at base+2 (USAU's official
      //       standings tie for 3rd when no bronze game is played).
      if (semis.length === 2) {
        const [l1, l2] = semis.map(loser);
        const thirdGame = bg.find(
          (g) =>
            g !== decider &&
            g.round !== 'semi' &&
            g.round !== 'pool' &&
            ((g.teamAId === l1 && g.teamBId === l2) || (g.teamAId === l2 && g.teamBId === l1)),
        );
        if (thirdGame) {
          setBest(out, winner(thirdGame), base + 2); // (a)
          setBest(out, loser(thirdGame), base + 3);
        } else if (!hasBracketAt(base + 2)) {
          setBest(out, l1, base + 2); // (c) tie — no downstream bracket to place them
          setBest(out, l2, base + 2);
        }
        // (b) a base+2 bracket exists → its own decider/semis place these teams.
      }
    }
  }

  return out;
}

/** Keep the BEST (lowest) place if a team somehow lands in two brackets. */
function setBest(map: Map<string, number>, teamId: string, place: number) {
  const cur = map.get(teamId);
  if (cur == null || place < cur) map.set(teamId, place);
}
