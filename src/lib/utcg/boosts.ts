// UTCG real-stats layer — Team of the Week, Live (Champion/Finalist) boosts,
// Flash challenges, Evolutions (pure types + mappers). Server-authoritative
// (migrations 20260930210000 + 220000): utcg_eval_lineup adds a card's active
// boosts (capped +6) and the caller's own evolution boost to its base score.
// Market floors/ceilings and quicksell stay on the BASE score.

import type { PackKind } from './packs';

/** TOTW in-form boost for the week. */
export const TOTW_BOOST = 3;
export const MAX_ACTIVE_EVOLUTIONS = 3;
/** Cap on TOTW + Live together, and on all boosts including Evolution. */
export const MAX_GLOBAL_BOOST = 6;
export const MAX_CARD_BOOST = 8;

export interface TotwCard {
  playerId: string;
  teamSlug: string;
  year: number;
  name: string;
  teamAbbr: string;
  score: number;
  boost: number;
  /** e.g. 'Throwback TOTW · 2015 Week 7' */
  label: string;
  owned: boolean;
}

export interface FlashChallenge {
  key: string;
  label: string;
  kind: 'own_totw';
  target: number;
  rewardPack: PackKind;
  /** Exclusive end date (YYYY-MM-DD). */
  endsOn: string;
  claimed: boolean;
}

export interface OwnedBoost {
  playerId: string;
  teamSlug: string;
  year: number;
  boost: number;
  labels: string[];
}

export interface WeekExtras {
  totw: TotwCard[];
  flash: FlashChallenge[];
  ownedBoosts: OwnedBoost[];
}

export function mapWeekExtras(raw: Record<string, unknown> | null): WeekExtras | null {
  if (!raw) return null;
  return {
    totw: ((raw.totw ?? []) as Record<string, unknown>[]).map((t) => ({
      playerId: String(t.player_id),
      teamSlug: String(t.team_slug),
      year: Number(t.year),
      name: String(t.name),
      teamAbbr: String(t.team_abbr),
      score: Number(t.score),
      boost: Number(t.boost),
      label: String(t.label),
      owned: Boolean(t.owned),
    })),
    flash: ((raw.flash ?? []) as Record<string, unknown>[]).map((f) => ({
      key: String(f.key),
      label: String(f.label),
      kind: f.kind as FlashChallenge['kind'],
      target: Number(f.target),
      rewardPack: f.reward_pack as PackKind,
      endsOn: String(f.ends_on),
      claimed: Boolean(f.claimed),
    })),
    ownedBoosts: ((raw.owned_boosts ?? []) as Record<string, unknown>[]).map((b) => ({
      playerId: String(b.player_id),
      teamSlug: String(b.team_slug),
      year: Number(b.year),
      boost: Number(b.boost),
      labels: ((b.labels ?? []) as unknown[]).map(String),
    })),
  };
}

export interface EvolutionStage {
  games: number;
  boost: number;
}

export interface EvolutionDef {
  key: string;
  name: string;
  description: string;
  maxScore: number | null;
  maxYear: number | null;
  stages: EvolutionStage[];
}

export interface CardEvolution {
  playerId: string;
  teamSlug: string;
  year: number;
  evoKey: string;
  games: number;
  stage: number;
  boost: number;
  completed: boolean;
}

export interface EvolutionState {
  defs: EvolutionDef[];
  mine: CardEvolution[];
}

export function mapEvolutionState(raw: Record<string, unknown> | null): EvolutionState | null {
  if (!raw) return null;
  return {
    defs: ((raw.defs ?? []) as Record<string, unknown>[]).map((d) => ({
      key: String(d.key),
      name: String(d.name),
      description: String(d.description),
      maxScore: d.max_score === null || d.max_score === undefined ? null : Number(d.max_score),
      maxYear: d.max_year === null || d.max_year === undefined ? null : Number(d.max_year),
      stages: ((d.stages ?? []) as Record<string, unknown>[]).map((s) => ({
        games: Number(s.games),
        boost: Number(s.boost),
      })),
    })),
    mine: ((raw.mine ?? []) as Record<string, unknown>[]).map((e) => ({
      playerId: String(e.player_id),
      teamSlug: String(e.team_slug),
      year: Number(e.year),
      evoKey: String(e.evo_key),
      games: Number(e.games),
      stage: Number(e.stage),
      boost: Number(e.boost),
      completed: Boolean(e.completed),
    })),
  };
}

/** Whether a card (base score + season) can start an evolution. */
export function evolutionEligible(def: EvolutionDef, card: { playerScore: number; year: number }): boolean {
  return (def.maxScore === null || card.playerScore <= def.maxScore) && (def.maxYear === null || card.year <= def.maxYear);
}
