// 12-0 team display metadata — one uniform shape across UFA / PUL / WUL.
//
// The game component renders a team mark + "City Name · Year" for whatever
// league the player selected, so it needs a league-agnostic display record.
// Sources differ per league:
//   UFA — static TEAM_META (src/lib/ufa/teams.ts)
//   WUL — static WUL_TEAMS (src/lib/wul/teams.ts) + a local entry for the
//         folded Oregon Onyx (2022–2023), which the static map doesn't carry
//   PUL — pul_teams in Supabase (logo_url / accent_color); fetched server-side
//         by the /12-0 page and converted here
//
// This module is client-safe: no I/O, no server-only imports (PulTeam is a
// type-only import — erased at compile time).

import { TEAM_META } from '@/lib/ufa/teams';
import { WUL_TEAMS } from '@/lib/wul/teams';
import type { PulTeam } from '@/lib/pul/data';
import type { TwelveOhLeague } from './leagues';

export interface TwelveOhTeamDisplay {
  slug: string;
  city: string;
  name: string;
  abbr: string;
  primary: string;   // hex — logo-block fallback background
  accent: string;    // hex — logo-block fallback overlay
  logo?: string | null;
}

export type TeamDisplayMap = Record<string, TwelveOhTeamDisplay>;
export type LeagueTeamDisplayMaps = Record<TwelveOhLeague, TeamDisplayMap>;

// PUL team abbreviations — mirrors ABBREV_TO_TEAM_ID in
// scripts/lib/pul-games-scrape.ts (that lib is script-side; this is the
// client-safe copy). New PUL franchises need an entry in both.
const PUL_ABBR: Record<string, string> = {
  atlanta: 'ATL', austin: 'ATX', columbus: 'COL', dc: 'DC', indy: 'IND',
  la: 'LA', medellin: 'MED', milwaukee: 'MKE', minnesota: 'MIN',
  nashville: 'NSH', newyork: 'NY', philadelphia: 'PHL', portland: 'POR',
  raleigh: 'RAL',
};

export function ufaTeamDisplayMap(): TeamDisplayMap {
  const map: TeamDisplayMap = {};
  for (const [slug, t] of Object.entries(TEAM_META)) {
    map[slug] = {
      slug,
      city: t.city ?? '',
      name: t.name ?? t.abbr,
      abbr: t.abbr,
      primary: t.primary,
      accent: t.accent,
      logo: t.logo ?? null,
    };
  }
  return map;
}

export function wulTeamDisplayMap(): TeamDisplayMap {
  const map: TeamDisplayMap = {};
  for (const [slug, t] of Object.entries(WUL_TEAMS)) {
    map[slug] = {
      slug,
      city: t.city,
      name: t.name,
      abbr: t.abbr,
      primary: t.primary,
      accent: t.accent,
      logo: t.logo ?? null,
    };
  }
  // Oregon Onyx — folded after 2023, absent from WUL_TEAMS but present in the
  // 2022/2023 spin pool. Colors from wul_teams.accent_color (#2A2A2E).
  map.onyx ??= {
    slug: 'onyx',
    city: 'Oregon',
    name: 'Onyx',
    abbr: 'ONY',
    primary: '#2A2A2E',
    accent: '#8A8A93',
    logo: null,
  };
  return map;
}

/** Convert server-fetched pul_teams rows into the display shape. */
export function pulTeamDisplayMap(teams: PulTeam[]): TeamDisplayMap {
  const map: TeamDisplayMap = {};
  for (const t of teams) {
    map[t.id] = {
      slug: t.id,
      city: t.city,
      name: t.mascot,
      abbr: PUL_ABBR[t.id] ?? t.id.slice(0, 3).toUpperCase(),
      primary: t.accentColor ?? '#3D3D46',
      accent: '#FFFFFF',
      logo: t.logoUrl,
    };
  }
  return map;
}
