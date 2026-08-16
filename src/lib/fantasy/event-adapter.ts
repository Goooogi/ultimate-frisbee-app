// Event-mode fantasy scoring — for competitions with only EVENT-TOTAL player
// stats (USAU Nationals: usau_player_event_stats has goals+assists only; WFDF:
// wfdf_rosters carries goals/assists/callahans as roster columns).
//
// Event contests have no weeks and no O/D roles: managers draft a flat flex
// roster before the event locks, and each player scores once from their event
// totals plus a bonus from how their TEAM finished.
//
//   Stat / outcome        Points
//   ─────────────────────────────
//   Goal                    3
//   Assist                  3
//   Callahan                5   (WFDF only — USAU doesn't track them)
//   Team wins the event    30
//   Runner-up              20
//   Semis (3rd–4th)        12
//   Quarters (5th–8th)      6
//
// Placement is passed in as the team's final placement (1 = champion) or null
// when unknown — a null placement simply contributes 0, so contests still score
// on G/A alone if placement data is missing for that event.
//
// ⚠️ MIRROR: like SCORING in scoring.ts, this matrix is duplicated in the
// score-fantasy Deno edge function (can't import src/). Change BOTH.

export interface EventStatLine {
  goals: number;
  assists: number;
  callahans: number;
}

/** Point values for event-mode contests. Single source of truth (TS side). */
export const EVENT_SCORING = {
  goal: 3,
  assist: 3,
  callahan: 5,
} as const;

/** Placement bonus by the player's team's final placement (1 = champion). */
export function placementBonus(placement: number | null | undefined): number {
  if (placement == null || placement < 1) return 0;
  if (placement === 1) return 30;
  if (placement === 2) return 20;
  if (placement <= 4) return 12;
  if (placement <= 8) return 6;
  return 0;
}

/** Score one player's whole event: stat totals + team-placement bonus. */
export function scoreEventLine(line: EventStatLine, placement: number | null | undefined): number {
  return (
    (line.goals ?? 0) * EVENT_SCORING.goal +
    (line.assists ?? 0) * EVENT_SCORING.assist +
    (line.callahans ?? 0) * EVENT_SCORING.callahan +
    placementBonus(placement)
  );
}
