// UTCG — formations & squad scoring.
//
// A formation lays out 7 TYPED slots (handler / cutter). The user's premise:
// "pick your formation, 2–4 handlers, fill each slot from a choice of players."
// Ultimate-authentic splits:
//
//   VERT-STACK  — 2 handlers, 5 cutters. The deep-heavy classic; cutters cut
//                 straight downfield from a vertical stack. Handler-light.
//   HO-STACK    — 3 handlers, 4 cutters. Horizontal stack spreads 3 handlers
//                 across the back with 4 cutters underneath. Balanced.
//   HEX         — 4 handlers, 3 cutters. Positionless, everyone-throws motion
//                 offense — a connected hexagon of interchangeable, throw-first
//                 players. Handler-heavy by design.
//   3-2 STACK   — 2 handlers, 5 cutters. Two side stacks (3 + 2) opening the
//                 lanes; handler-light like vert but a wider downfield shape.
//
// Slots are typed so the position deriver + chemistry in-position gate mean
// something: a cutter played in a handler slot earns no chem (and vice-versa),
// exactly like FUT's positional gate.

import { teamChemistry, MAX_TEAM_CHEM, type ChemCard } from './chemistry';
import { teamRecord, type TeamRecordResult } from '@/lib/twelve-oh/rating';
import { winCurveForLeague } from '@/lib/twelve-oh/leagues';

export type FormationKey = 'vert' | 'ho' | 'hex' | 'threeTwo';
export type SlotType = 'handler' | 'cutter';

export interface Formation {
  key: FormationKey;
  name: string;
  tagline: string;
  /** The 7 slot types, in display order (handlers first). */
  slots: SlotType[];
  handlers: number;
  cutters: number;
}

export const FORMATIONS: Record<FormationKey, Formation> = {
  vert: {
    key: 'vert',
    name: 'Vert Stack',
    tagline: 'Deep-heavy — 2 handlers, 5 cutters',
    slots: ['handler', 'handler', 'cutter', 'cutter', 'cutter', 'cutter', 'cutter'],
    handlers: 2,
    cutters: 5,
  },
  ho: {
    key: 'ho',
    name: 'Ho Stack',
    tagline: 'Balanced — 3 handlers, 4 cutters',
    slots: ['handler', 'handler', 'handler', 'cutter', 'cutter', 'cutter', 'cutter'],
    handlers: 3,
    cutters: 4,
  },
  hex: {
    key: 'hex',
    name: 'Hex',
    tagline: 'Positionless — 4 handlers, 3 cutters',
    slots: ['handler', 'handler', 'handler', 'handler', 'cutter', 'cutter', 'cutter'],
    handlers: 4,
    cutters: 3,
  },
  threeTwo: {
    key: 'threeTwo',
    name: '3-2 Stack',
    tagline: 'Wide lanes — 2 handlers, 5 cutters',
    slots: ['handler', 'handler', 'cutter', 'cutter', 'cutter', 'cutter', 'cutter'],
    handlers: 2,
    cutters: 5,
  },
};

// Only Vert and Ho stack are offered in the picker. Hex / 3-2 definitions are
// kept in FORMATIONS (above) so any in-flight run saved with one still renders,
// but they're no longer selectable.
export const FORMATION_ORDER: FormationKey[] = ['vert', 'ho'];
export const SQUAD_SIZE = 7;

// ── Squad scoring: rating + chemistry → record ──────────────────────────────
//
// We reuse the 12-0 engine's teamRecord() (mean of 7 scores + balance bonus →
// win curve). Chemistry is folded in as a bonus to each card's effective score
// BEFORE the record is computed, so a well-linked squad genuinely out-performs
// a pile of mismatched stars — the whole point of the game.
//
// CHEM_SCORE_BONUS_MAX caps how much perfect chemistry can lift team strength.
// At MAX_TEAM_CHEM (21) the squad gets the full bonus; it scales linearly down
// to 0 at zero chem. The cap is deliberately modest (same philosophy as the
// 12-0 balance bonus) so chemistry TILTS outcomes without letting a low-rated
// but perfectly-linked squad beat an elite one — rating still leads.

/** Max points chemistry can add to team strength (at full 21/21 chem). */
export const CHEM_SCORE_BONUS_MAX = 3.0;

export interface SquadScoreResult {
  meanScore: number;         // raw mean of the 7 player scores (0–99)
  chem: number;              // 0–21 team chemistry
  chemBonus: number;         // points added to strength from chem
  effectiveStrength: number; // meanScore + chemBonus (drives the record)
  record: TeamRecordResult;  // wins/losses/rationale from the 12-0 curve
}

export interface ScoredCard extends ChemCard {
  playerScore: number;
}

/**
 * Score a built squad: combine each card's rating with team chemistry to
 * produce a simulated season record via the UFA 12-0 win curve.
 */
export function scoreSquad(cards: ScoredCard[]): SquadScoreResult {
  const scores = cards.map((c) => c.playerScore);
  const meanScore =
    scores.length > 0 ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;

  const { total: chem } = teamChemistry(cards);
  const chemBonus = (chem / MAX_TEAM_CHEM) * CHEM_SCORE_BONUS_MAX;

  // Fold the chem bonus in by lifting every score equally, then run the
  // existing UFA record curve. (Lifting scores rather than the mean keeps the
  // balance-bonus logic inside teamRecord meaningful.)
  const boosted = scores.map((s) => s + chemBonus);
  const record = teamRecord(boosted, winCurveForLeague('ufa'));

  return {
    meanScore,
    chem,
    chemBonus,
    effectiveStrength: meanScore + chemBonus,
    record,
  };
}
