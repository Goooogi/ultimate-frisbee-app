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
