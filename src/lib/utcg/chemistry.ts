// UTCG — chemistry resolver (modern count-based FUT model).
//
// Chemistry rewards drafting players who actually played together. Each card
// earns 0–3 chem points from three shared-link dimensions across the built
// lineup, on incremental count thresholds (à la FC24 Club/League/Nation):
//
//   TEAM     (same team_slug)          — strongest link, lowest thresholds
//   DIVISION (same UFA division)       — mid link
//   LEAGUE   (all UFA cards share this) — weak link, a small floor for everyone
//
// A card's chem = the single strongest dimension it qualifies for (not summed
// across dimensions — that would let a big same-division blob out-chem a real
// same-team line). Team chemistry = sum of all 7 cards' chem, 0–21.
//
// IN-POSITION GATE: a card played out of its natural position contributes ZERO
// chemistry (the FUT positional gate, frisbee-flavored). Hybrids always count
// as in-position. This is applied by the caller (which knows slot assignment);
// see teamChemistry().

import type { UtcgPosition } from './position';
import { fitsSlot } from './position';

export const MAX_CARD_CHEM = 3;
export const MAX_TEAM_CHEM = 21; // 7 cards × 3

/** A card as the chemistry resolver sees it. */
export interface ChemCard {
  teamSlug: string;
  /** UFA division of the card's team, or null for historical/defunct franchises. */
  division: string | null;
  position: UtcgPosition;
  /** The slot this card was played in (null = benched/unassigned = 0 chem). */
  slot: 'handler' | 'cutter' | null;
}

// Count thresholds: how many OTHER same-link cards you need for +1/+2/+3.
// Team is easiest (2 teammates → already strong), division mid, league loosest.
// Counts are "how many cards in the lineup share this link" (including self),
// mirroring FUT which counts the whole XI.
const TEAM_THRESHOLDS = [2, 3, 4] as const;     // 2 same-team → +1, 3 → +2, 4 → +3
const DIVISION_THRESHOLDS = [3, 5, 7] as const; // 3 → +1, 5 → +2, 7 → +3
// League is a FLOOR, capped at +1: a full UFA lineup always counts 7, so any
// higher cap would hand every full squad max chem and erase the team/division
// puzzle entirely (shipped briefly with [5,7,7] — every squad scored 21/21).
// 99-sentinels are unreachable (lineup max is 7). MIRRORED in utcg_eval_lineup
// (SQL) — change both together.
const LEAGUE_THRESHOLDS = [5, 99, 99] as const;

function chemFromCount(count: number, thresholds: readonly [number, number, number]): number {
  if (count >= thresholds[2]) return 3;
  if (count >= thresholds[1]) return 2;
  if (count >= thresholds[0]) return 1;
  return 0;
}

export interface CardChemResult {
  chem: number;                 // 0–3
  reason: 'team' | 'division' | 'league' | 'none';
  inPosition: boolean;
}

export interface TeamChemResult {
  total: number;                // 0–21
  perCard: CardChemResult[];    // aligned to input order
}

/**
 * Compute chemistry for a full lineup.
 *
 * @param cards Up to 7 cards, each with its played slot (null = unassigned).
 * @returns per-card chem (0–3) + team total (0–21).
 */
export function teamChemistry(cards: ChemCard[]): TeamChemResult {
  // Count shared links across the WHOLE lineup (including out-of-position cards,
  // matching FUT — an out-of-position card still counts toward others' links;
  // it just earns none itself).
  const teamCounts = new Map<string, number>();
  const divCounts = new Map<string, number>();
  let leagueCount = 0;

  for (const c of cards) {
    teamCounts.set(c.teamSlug, (teamCounts.get(c.teamSlug) ?? 0) + 1);
    if (c.division) divCounts.set(c.division, (divCounts.get(c.division) ?? 0) + 1);
    leagueCount += 1; // every UFA card
  }

  const perCard: CardChemResult[] = cards.map((c) => {
    // In-position gate: unassigned or out-of-position → 0 chem.
    const inPosition = c.slot !== null && fitsSlot(c.position, c.slot);
    if (!inPosition) {
      return { chem: 0, reason: 'none', inPosition: false };
    }

    const teamChem = chemFromCount(teamCounts.get(c.teamSlug) ?? 0, TEAM_THRESHOLDS);
    const divChem = c.division
      ? chemFromCount(divCounts.get(c.division) ?? 0, DIVISION_THRESHOLDS)
      : 0;
    const leagueChem = chemFromCount(leagueCount, LEAGUE_THRESHOLDS);

    // Strongest single dimension wins (not a sum).
    const chem = Math.min(MAX_CARD_CHEM, Math.max(teamChem, divChem, leagueChem));
    const reason: CardChemResult['reason'] =
      chem === 0 ? 'none'
        : teamChem >= divChem && teamChem >= leagueChem ? 'team'
          : divChem >= leagueChem ? 'division'
            : 'league';

    return { chem, reason, inPosition: true };
  });

  const total = perCard.reduce((s, r) => s + r.chem, 0);
  return { total, perCard };
}

// ── Draft-time projection ────────────────────────────────────────────────

/** What one candidate would do to team chemistry if picked into a slot. */
export interface ChemProjection {
  /** Team chem total AFTER adding this candidate (partial lineup). */
  total: number;
  /** Change vs the current partial lineup — the headline number. */
  delta: number;
  /** This card's own chem in the projected lineup (0-3). */
  cardChem: number;
  /** Why this card links: which dimension earned its chem. */
  reason: CardChemResult['reason'];
  /** How many ALREADY-PICKED cards share this card's team / division. */
  sharedTeam: number;
  sharedDivision: number;
}

/**
 * Project chemistry for a draft candidate against the picks made so far.
 *
 * Beta feedback: "not ever seeing chem go up in both squad builder challenges"
 * — the draft dealt 5 blind candidates with no indication which one linked with
 * the squad, so chemistry felt invisible/broken. This computes the projected
 * team-chem delta for each candidate so the UI can surface it at pick time.
 *
 * NOTE this is a PARTIAL-lineup projection: links strengthen as more cards land,
 * so a card showing +1 now may end up worth more once the squad fills. The delta
 * is the honest "what changes if I pick this right now" number, which is what a
 * drafter is actually choosing between.
 *
 * @param picked   Cards already drafted, in slot order.
 * @param candidate The card being considered.
 * @param slot     The slot the candidate would fill.
 * @param pickedSlots Slot types for the already-picked cards (same order).
 */
export function projectChem(
  picked: Omit<ChemCard, 'slot'>[],
  candidate: Omit<ChemCard, 'slot'>,
  slot: 'handler' | 'cutter',
  pickedSlots: ('handler' | 'cutter')[],
): ChemProjection {
  const before = teamChemistry(
    picked.map((c, i) => ({ ...c, slot: pickedSlots[i] ?? null })),
  );
  const after = teamChemistry([
    ...picked.map((c, i) => ({ ...c, slot: pickedSlots[i] ?? null })),
    { ...candidate, slot },
  ]);

  const sharedTeam = picked.filter((c) => c.teamSlug === candidate.teamSlug).length;
  const sharedDivision = candidate.division
    ? picked.filter((c) => c.division === candidate.division).length
    : 0;

  const own = after.perCard[after.perCard.length - 1];
  return {
    total: after.total,
    delta: after.total - before.total,
    cardChem: own?.chem ?? 0,
    reason: own?.reason ?? 'none',
    sharedTeam,
    sharedDivision,
  };
}
