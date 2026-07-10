// USAU series region/section → US state mapping, and UFA team → state.
//
// Used for cross-league attribution: when a same-named player SPLITS into
// multiple USAU profiles (two different people), we attach a UFA/pro career to
// the USAU cluster whose SERIES play is in the same geography as the UFA team.
//
// Why regions/sections (not usau_teams.city/state): those columns are 0%
// populated. But USAU series EVENT names always carry the region/section
// ("Rocky Mountain Sectional", "South Central Regional"), which is intrinsic to
// how USAU organizes play. We derive a cluster's home state-set from the
// section/region words in its Sectional/Regional event names.
//
// Matching is at STATE granularity: a UFA team (known state) attaches to the
// USAU cluster whose region/section state-set contains that state.

/**
 * USAU club sections + regions → the US state postal codes they cover.
 * Sections (finer) are preferred signal; regions (coarser) are the fallback.
 * Keys are lowercased region/section phrases as they appear before
 * "Men's/Women's/Mixed" in event names. Not exhaustive of every micro-section,
 * but covers the ones that matter for UFA-city disambiguation.
 */
export const USAU_REGION_STATES: Record<string, string[]> = {
  // ── Sections (granular) ──
  'rocky mountain': ['CO', 'WY', 'MT'],
  'big sky': ['MT', 'ID', 'WY'],
  'east plains': ['OH', 'MI', 'IN', 'KY'],
  'west plains': ['IL', 'WI', 'MN', 'IA'],
  'northwest plains': ['MN', 'ND', 'SD'],
  'central plains': ['MO', 'KS', 'NE'],
  ozarks: ['MO', 'AR', 'KS'],
  texas: ['TX'],
  'south texas': ['TX'],
  'gulf coast': ['LA', 'MS', 'AL'],
  'nor cal': ['CA'],
  'norcal': ['CA'],
  'so cal': ['CA'],
  socal: ['CA'],
  'west bay': ['CA'],
  oregon: ['OR'],
  washington: ['WA'],
  alaska: ['AK'],
  'metro new york': ['NY'],
  'metro ny': ['NY'],
  'upstate new york': ['NY'],
  'east new england': ['MA', 'ME', 'NH', 'RI'],
  'west new england': ['MA', 'CT', 'VT'],
  'south new england': ['CT', 'RI'],
  'east coast': ['NJ', 'DE', 'MD'],
  capital: ['DC', 'MD', 'VA'],
  founders: ['PA', 'NJ'],
  'north carolina': ['NC'],
  'central appalachia': ['WV', 'VA', 'KY'],
  florida: ['FL'],

  // ── Regions (coarse fallback) ──
  'rocky mountain region': ['CO', 'WY', 'MT', 'ID'],
  northwest: ['WA', 'OR', 'AK', 'MT', 'ID'],
  southwest: ['CA', 'NV', 'AZ', 'HI'],
  'north central': ['MN', 'WI', 'IA', 'ND', 'SD', 'NE'],
  'south central': ['TX', 'CO', 'OK', 'AR', 'LA', 'NM', 'KS', 'MO'],
  'great lakes': ['OH', 'MI', 'IN', 'IL', 'WI', 'KY'],
  southeast: ['FL', 'GA', 'AL', 'TN', 'SC', 'NC', 'MS'],
  northeast: ['NY', 'MA', 'CT', 'VT', 'NH', 'ME', 'RI'],
  'mid-atlantic': ['PA', 'NJ', 'MD', 'DC', 'VA', 'DE', 'WV'],
};

/**
 * UFA team slug → US state. UFA teams are few and stable; TEAM_META.city is
 * sometimes a city and sometimes a state-name, so we map states explicitly.
 * Covers current + historical franchises so older UFA careers resolve.
 */
export const UFA_TEAM_STATE: Record<string, string> = {
  // East
  empire: 'NY',
  glory: 'MA',
  breeze: 'DC',
  phoenix: 'PA',
  royal: 'QC', // Montreal — no US state; won't match US sections (fine)
  rush: 'ON', // Toronto
  // Central
  alleycats: 'IN',
  radicals: 'WI',
  thunderbirds: 'PA',
  union: 'IL',
  windchill: 'MN',
  // South
  bighorns: 'NV',
  flyers: 'NC',
  growlers: 'CA',
  havoc: 'TX',
  hustle: 'GA',
  sol: 'TX',
  // West
  apex: 'CO',
  cascades: 'WA',
  shred: 'UT',
  spiders: 'CA',
  steel: 'OR',
  // Historical / inactive
  aviators: 'CA',
  mechanix: 'MI',
  legion: 'TX',
  cannons: 'OH',
  outlaws: 'TN',
  flamethrowers: 'PA',
  nightwatch: 'NC',
  riptide: 'FL',
  express: 'NY',
  revolution: 'NY',
  dragons: 'CA',
  lions: 'ON',
  cranes: 'MD',
  constitution: 'PA',
  spinners: 'PA',
  rampage: 'MA',
  hammerheads: 'NJ',
};

/** UFA team's home state (postal code), or null if unknown/non-US. */
export function ufaTeamState(slug: string): string | null {
  return UFA_TEAM_STATE[slug] ?? null;
}

/**
 * Curated USAU team home-state overrides — the source of truth for corrections
 * to the venue-modal-derived usau_teams.state (which mislabels teams in
 * multi-state sections whose sectionals rotate venues, e.g. PoNY→MA instead of
 * NY, and a couple of Canadian teams). Keyed "Name|GenderDivision".
 *
 * These are ALREADY applied to the DB (migration curate_usau_team_state_overrides);
 * this constant is the durable record so a future re-derivation of state can
 * re-apply them. Team home locations are effectively static, so this list rarely
 * changes — add an entry when a known-team's displayed state is wrong.
 */
// NOTE (2026-07-09): USAU COLLEGE team state is backfilled from the school name
// (the name IS the school → unambiguous state), NOT the venue-modal derivation
// (college event venue data was too sparse). The authoritative ~145-school
// name→state map lives in the migration `override_usau_college_team_state_authoritative`
// (canonical source; overwrites even wrong venue-derived college states). Handles
// " (B)"/"(C)" second-team suffixes → same school. To fix/add a college team's
// state: edit that map + re-run. After this, ALL ranked top-100 teams across all
// 5 divisions (Club M/W/Mx + College M/W) have 100% state coverage.
export const USAU_TEAM_STATE_OVERRIDES: Record<string, string> = {
  'PoNY|Men': 'NY',
  'Chicago Machine|Men': 'IL',
  'Truck Stop|Men': 'DC',
  'GOAT|Men': 'ON',
  'Philadelphia Pacmen|Men': 'PA',
  'Florida Untied|Men': 'FL',
  'Garden State Ultimate|Men': 'NJ',
  'AMP|Mixed': 'PA',
  'Pittsburgh Port Authority|Mixed': 'PA',
  'Chicago Parlay|Mixed': 'IL',
  'Scandal|Women': 'DC',
  '6ixers|Women': 'ON',
  'Indy Rogue|Women': 'IN',
};

/**
 * Given a USAU series EVENT name, return the set of states its region/section
 * covers (empty if unrecognized). Matches the LONGEST region/section phrase
 * present so "south central" wins over a bare token collision.
 */
export function statesForEventName(name: string): string[] {
  const n = name.toLowerCase();
  let best: { key: string; states: string[] } | null = null;
  for (const [key, states] of Object.entries(USAU_REGION_STATES)) {
    if (n.includes(key) && (!best || key.length > best.key.length)) {
      best = { key, states };
    }
  }
  return best?.states ?? [];
}
