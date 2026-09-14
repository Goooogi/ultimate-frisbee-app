// Date windows shared by the home page and the league data readers. Kept a
// leaf module (no imports) so a data reader can use it without pulling in the
// home-page phase logic — usau/data.ts is imported by client components.

/** How far ahead the home page previews an upcoming game, event or season
 *  (hero slides, Up next) — Hunter, 2026-09-13: "60 days in advance of an
 *  event/season starting". Deliberately wider than season-phase's in-season
 *  horizon: previewing is not being in-season, so a preview 15–60 days out can
 *  sit beside a league that is still `complete` (its champion card) or
 *  `dormant`. */
export const SEASON_PREVIEW_DAYS = 60;
