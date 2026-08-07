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
  // UT is the LARGEST state in Big Sky by team count (58 distinct teams vs
  // Montana's 50), not a minor member — it was missing here, which silently
  // dropped the whole UFA career of every Salt Lake player whose USAU history
  // runs through this section (Jordan Kerr / Salt Lake Shred).
  'big sky': ['UT', 'MT', 'ID', 'WY'],
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
  // Utah plays UP into the Northwest region from Big Sky — 66 distinct UT teams
  // in Northwest regionals, third only to WA and OR. Same omission as 'big sky'.
  northwest: ['WA', 'OR', 'UT', 'AK', 'MT', 'ID'],
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
  // Historical / inactive — audited 2026-08-06 against the games API's
  // historical city field; several were wrong (Riptide = Vancouver, Cannons =
  // Jacksonville/Tampa Bay, Outlaws = Ottawa, …). Keep in sync with mobile's
  // UFA_TEAM_STATE in src/lib/ufa/teams.ts.
  aviators: 'CA',
  mechanix: 'MI',
  legion: 'TX',
  cannons: 'FL', // Jacksonville → Tampa Bay; both Florida
  outlaws: 'ON', // Ottawa — province, never matches a US section (fine)
  flamethrowers: 'CA', // San Francisco
  nightwatch: 'TN', // Nashville
  riptide: 'BC', // Vancouver — province, never matches a US section (fine)
  express: 'NC', // Charlotte
  revolution: 'OH', // Cincinnati
  dragons: 'NY', // Rochester
  lions: 'UT', // Salt Lake
  cranes: 'OH', // Columbus
  constitution: 'CT',
  spinners: 'PA',
  rampage: 'RI',
  hammerheads: 'NJ',
};

/**
 * Does a UFA team's state belong to a region/section whose mapping we consider
 * COMPLETE enough to argue from?
 *
 * The attribution gate treats "no overlap" as proof of two different people and
 * drops an entire UFA career. That inference is only sound when the state-set
 * on both sides is complete. USAU_REGION_STATES is explicitly "not exhaustive
 * of every micro-section" (see its doc), so a state we simply never listed
 * looks identical to a genuine contradiction — that's how every Salt Lake
 * player lost their Shred career when 'big sky' omitted UT.
 *
 * This is the safety valve: a UFA state that appears NOWHERE in the map cannot
 * be contradicted by it, so the gate must abstain rather than drop. Adding a
 * state to a region above automatically makes it "coverable" here.
 */
export function isStateCoveredByRegionMap(state: string): boolean {
  const s = state.trim().toUpperCase();
  for (const states of Object.values(USAU_REGION_STATES)) {
    if (states.includes(s)) return true;
  }
  return false;
}

/** UFA team's home state (postal code), or null if unknown/non-US. */
export function ufaTeamState(slug: string): string | null {
  return UFA_TEAM_STATE[slug] ?? null;
}

/**
 * Canadian province codes appearing in UFA_TEAM_STATE (Montreal, Toronto).
 *
 * Deliberately a province DENY-list rather than a US-state allow-list: the
 * allow-list would have to be USAU_REGION_STATES, which omits real states no
 * section phrase happens to name (UT among them), and excluding those would
 * silently disable the geography gate for their teams.
 */
const NON_US_STATE_CODES: ReadonlySet<string> = new Set(['QC', 'ON', 'BC', 'AB', 'MB', 'NS', 'NB', 'SK', 'NL', 'PE']);

/**
 * True when a state code is one USAU home-state derivation could ever emit.
 *
 * Canadian franchises (royal→QC, rush/lions→ON) map to PROVINCES, which can
 * never appear in homeStates (US codes only). Callers comparing a UFA team's
 * state against USAU home states must treat a non-US code as NO SIGNAL rather
 * than as a contradiction — otherwise the comparison can only ever fail and the
 * geography gate drops the entire real UFA career.
 */
export function isUsStateCode(code: string): boolean {
  return !NON_US_STATE_CODES.has(code);
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
