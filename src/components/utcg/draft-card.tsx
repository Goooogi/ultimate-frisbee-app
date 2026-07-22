// Shared helper for Draft Mode — adapts a server-dealt DraftCard (a thin,
// display-ready payload: no team colors/logo/headshot/stat line) into the
// full UtcgCard shape CardTile expects, so every draft screen can reuse the
// exact same rarity-ringed card visual as the rest of the app instead of
// forking a second card component. Team colors/logo resolve through the same
// TEAM_META idiom data.ts and pack-open-animation.tsx already use.

import type { UtcgCard } from '@/lib/utcg/data';
import type { DraftCard } from '@/lib/utcg/draft';
import { tierFromRank } from '@/lib/utcg/actions';
import { teamMeta } from '@/lib/ufa/teams';

/** DraftCard -> UtcgCard, for feeding into CardTile. The draft deal payload
 *  carries no headshot (it would bloat the run's jsonb), so the caller resolves
 *  them client-side from ufa_players — same idiom as the pack reveal
 *  (getPullHeadshots) — and passes the URL in here. The draft pool is UFA-only
 *  and ~half of UFA players have a headshot, so most cards get a real photo;
 *  CardTile's monogram fallback still covers the rest. */
export function draftCardToUtcgCard(card: DraftCard, headshotUrl: string | null = null): UtcgCard {
  const meta = teamMeta(card.teamSlug);
  return {
    playerId: card.playerId,
    teamSlug: card.teamSlug,
    year: card.year,
    name: card.name,
    teamAbbr: card.teamAbbr,
    city: meta.city ?? '',
    teamName: meta.name ?? card.teamAbbr,
    primary: meta.primary,
    accent: meta.accent,
    logo: meta.logo ?? null,
    headshotUrl,
    playerScore: card.playerScore,
    tier: tierFromRank(card.tierRank),
    position: card.position,
    division: card.division,
    // Draft payload carries no box-score stat line — not needed by CardTile,
    // which never reads these, but the UtcgCard type requires them present.
    goals: 0,
    assists: 0,
    blocks: 0,
    plusMinus: 0,
  };
}
