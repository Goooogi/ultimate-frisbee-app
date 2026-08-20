// Outbound links to WFDF's OWN results site — the source of truth when our
// scrape lags live play (Hunter, 2026-08-20). Pure href-building from columns
// we already fetch; no extra queries.
//
// Two source eras (see vault WFDF Worlds Integration.md):
//  - MODERN (static_base set): the "Live! by BULA" SPA. Deep links reverse-
//    engineered from its route table + link builders (BrowserRouter paths,
//    server 200-falls-back to the app shell so they work as direct links):
//      event: {base}/live/
//      team:  {base}/live/team/{slug(division)}/{slug(teamName)}-{teamId}
//      game:  {base}/live/game/{slug(division)}/{slug(home)}-{slug(away)}-{gameId}
//    {base} = source_origin + static_base minus the trailing "live/data/".
//  - LEGACY (static_base null): Ultiorganizer server-rendered pages:
//      event: {source_origin}/
//      team:  {origin}/?view=teamcard&team={wfdf_team_id}  (real ids only —
//             ingest gives game-only teams synthetic NEGATIVE ids)
//      game:  none — our legacy wfdf_game_ids are synthetic, they don't
//             exist on the WFDF side.

export interface WfdfSourceEvent {
  sourceOrigin: string | null;
  staticBase: string | null;
}

// The SPA's own slugifier, verbatim (spaces/slashes → '-', strip the rest,
// lowercase) — links must match how the app builds them internally.
function spaSlug(s: string): string {
  return encodeURIComponent(
    s.replace(/(\s+|\/)/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase(),
  );
}

/** Event site base, no trailing slash — "https://results.wfdf.sport/wucc-2026". */
export function wfdfEventUrl(ev: WfdfSourceEvent): string | null {
  if (!ev.sourceOrigin) return null;
  if (ev.staticBase == null) return ev.sourceOrigin; // legacy origin includes the path
  const prefix = ev.staticBase.replace(/live\/data\/?$/, '').replace(/\/$/, '');
  return `${ev.sourceOrigin}${prefix}`;
}

export function wfdfTeamUrl(
  ev: WfdfSourceEvent,
  team: { wfdfTeamId: number | null; name: string; divisionName: string | null },
): string | null {
  const base = wfdfEventUrl(ev);
  if (!base || team.wfdfTeamId == null) return null;
  if (ev.staticBase != null) {
    if (!team.divisionName) return null;
    return `${base}/live/team/${spaSlug(team.divisionName)}/${spaSlug(team.name)}-${team.wfdfTeamId}`;
  }
  return team.wfdfTeamId > 0 ? `${base}/?view=teamcard&team=${team.wfdfTeamId}` : null;
}

export function wfdfGameUrl(
  ev: WfdfSourceEvent,
  game: {
    wfdfGameId: number | null;
    divisionName: string | null;
    homeTeam: string | null;
    awayTeam: string | null;
  },
): string | null {
  const base = wfdfEventUrl(ev);
  if (!base || ev.staticBase == null) return null; // legacy game ids are synthetic
  if (game.wfdfGameId == null || !game.divisionName) return null;
  const home = spaSlug(game.homeTeam ?? 'tbd');
  const away = spaSlug(game.awayTeam ?? 'tbd');
  return `${base}/live/game/${spaSlug(game.divisionName)}/${home}-${away}-${game.wfdfGameId}`;
}
