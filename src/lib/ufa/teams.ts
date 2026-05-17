// Visual metadata for every UFA franchise — keyed by the API's `teamID` slug.
// Primary colors + logo PNGs scraped one-time from watchufa.com on 2026-05-14:
//   colors: from /sites/default/files/css/css_i2f7b0pP4rJxYNBQcwlFPF0DInbxBZWRsUO5glQDkak.css
//   logos:  /league/teams page → /sites/default/files/<filename>.png, saved to /public/teams/<slug>.png
//
// `internalID` is the integer the upstream API expects when filtering player-stats
// or games by team. Sourced from the team table embedded in the watchufa.com
// Svelte bundle.

export interface TeamMeta {
  id: string;          // API teamID slug, e.g. 'empire'
  internalID: number;  // integer expected by /web-v1/?teamID=N filters
  abbr: string;        // 2-3 letter display abbreviation
  primary: string;     // hex — official team primary, scraped from watchufa.com
  accent: string;      // hex — secondary/contrast color (curated; UFA CSS only exposes primary)
  city?: string;       // canonical city for nav lookups
  name?: string;       // canonical team nickname
  division?: 'East' | 'Central' | 'South' | 'West';
  active?: boolean;    // currently fielding a team in 2026
  logo?: string;       // path under /public, e.g. '/teams/empire.png'
}

export const TEAM_META: Record<string, TeamMeta> = {
  // ── East (current) ──
  empire:       { id: 'empire',       internalID: 14, abbr: 'NY',  primary: '#69BD45', accent: '#0E0E0C', city: 'New York',     name: 'Empire',       division: 'East',    active: true, logo: '/teams/empire.png' },
  glory:        { id: 'glory',        internalID: 37, abbr: 'BOS', primary: '#000000', accent: '#C8102E', city: 'Boston',       name: 'Glory',        division: 'East',    active: true, logo: '/teams/glory.png' },
  breeze:       { id: 'breeze',       internalID:  5, abbr: 'DC',  primary: '#0A3751', accent: '#BF0A30', city: 'DC',           name: 'Breeze',       division: 'East',    active: true, logo: '/teams/breeze.png' },
  phoenix:      { id: 'phoenix',      internalID: 16, abbr: 'PHI', primary: '#F04E23', accent: '#0E0E0C', city: 'Philadelphia', name: 'Phoenix',      division: 'East',    active: true, logo: '/teams/phoenix.png' },
  royal:        { id: 'royal',        internalID: 13, abbr: 'MTL', primary: '#00305E', accent: '#C8102E', city: 'Montreal',     name: 'Royal',        division: 'East',    active: true, logo: '/teams/royal.png' },
  rush:         { id: 'rush',         internalID: 23, abbr: 'TOR', primary: '#C52033', accent: '#0E0E0C', city: 'Toronto',      name: 'Rush',         division: 'East',    active: true, logo: '/teams/rush.png' },

  // ── Central (current) ──
  alleycats:    { id: 'alleycats',    internalID:  7, abbr: 'IND', primary: '#00703C', accent: '#FFFFFF', city: 'Indianapolis', name: 'AlleyCats',    division: 'Central', active: true, logo: '/teams/alleycats.png' },
  radicals:     { id: 'radicals',     internalID: 11, abbr: 'MAD', primary: '#003A5C', accent: '#F4D03F', city: 'Madison',      name: 'Radicals',     division: 'Central', active: true, logo: '/teams/radicals.png' },
  thunderbirds: { id: 'thunderbirds', internalID: 17, abbr: 'PIT', primary: '#FDBC11', accent: '#0E0E0C', city: 'Pittsburgh',   name: 'Thunderbirds', division: 'Central', active: true, logo: '/teams/thunderbirds.png' },
  union:        { id: 'union',        internalID:  3, abbr: 'CHI', primary: '#002D72', accent: '#C8102E', city: 'Chicago',      name: 'Union',        division: 'Central', active: true, logo: '/teams/union.png' },
  windchill:    { id: 'windchill',    internalID: 12, abbr: 'MIN', primary: '#6F7F98', accent: '#0C2340', city: 'Minnesota',    name: 'Wind Chill',   division: 'Central', active: true, logo: '/teams/windchill.png' },

  // ── South (current) ──
  bighorns:     { id: 'bighorns',     internalID: 42, abbr: 'VEG', primary: '#A25F3F', accent: '#C9A24A', city: 'Vegas',        name: 'Bighorns',     division: 'South',   active: true, logo: '/teams/bighorns.png' },
  flyers:       { id: 'flyers',       internalID: 18, abbr: 'CAR', primary: '#003049', accent: '#7BAFD4', city: 'Carolina',     name: 'Flyers',       division: 'South',   active: true, logo: '/teams/flyers.png' },
  growlers:     { id: 'growlers',     internalID: 19, abbr: 'SD',  primary: '#000000', accent: '#FFB81C', city: 'San Diego',    name: 'Growlers',     division: 'South',   active: true, logo: '/teams/growlers.png' },
  havoc:        { id: 'havoc',        internalID: 41, abbr: 'HOU', primary: '#000000', accent: '#FF4B14', city: 'Houston',      name: 'Havoc',        division: 'South',   active: true, logo: '/teams/havoc.png' },
  hustle:       { id: 'hustle',       internalID:  1, abbr: 'ATL', primary: '#333366', accent: '#C8102E', city: 'Atlanta',      name: 'Hustle',       division: 'South',   active: true, logo: '/teams/hustle.png' },
  sol:          { id: 'sol',          internalID:  2, abbr: 'AUS', primary: '#2B3283', accent: '#FFC72C', city: 'Austin',       name: 'Sol',          division: 'South',   active: true, logo: '/teams/sol.png' },

  // ── West (current) ──
  apex:         { id: 'apex',         internalID: 39, abbr: 'COL', primary: '#191640', accent: '#E8DFCB', city: 'Colorado',     name: 'Apex',         division: 'West',    active: true, logo: '/teams/apex.png' },
  cascades:     { id: 'cascades',     internalID: 22, abbr: 'SEA', primary: '#08192D', accent: '#5DADEC', city: 'Seattle',      name: 'Cascades',     division: 'West',    active: true, logo: '/teams/cascades.png' },
  shred:        { id: 'shred',        internalID: 40, abbr: 'SLC', primary: '#00477B', accent: '#7C8C9E', city: 'Salt Lake',    name: 'Shred',        division: 'West',    active: true, logo: '/teams/shred.png' },
  spiders:      { id: 'spiders',      internalID: 21, abbr: 'OAK', primary: '#FEBD25', accent: '#0E0E0C', city: 'Oakland',      name: 'Spiders',      division: 'West',    active: true, logo: '/teams/spiders.png' },
  steel:        { id: 'steel',        internalID: 38, abbr: 'ORE', primary: '#05384F', accent: '#FF6F00', city: 'Oregon',       name: 'Steel',        division: 'West',    active: true, logo: '/teams/steel.png' },

  // ── Historical / inactive franchises (so older years still resolve) ──
  aviators:     { id: 'aviators',     internalID: 10, abbr: 'LA',  primary: '#1B365D', accent: '#FBB040', city: 'Los Angeles',  name: 'Aviators',     active: false },
  mechanix:     { id: 'mechanix',     internalID:  6, abbr: 'DET', primary: '#1A1A1A', accent: '#C8102E', city: 'Detroit',      name: 'Mechanix',     active: false },
  legion:       { id: 'legion',       internalID:  4, abbr: 'DAL', primary: '#0E1B2E', accent: '#C8102E', city: 'Dallas',       name: 'Legion',       active: false },
  cannons:      { id: 'cannons',      internalID:  9, abbr: 'CIN', primary: '#1A1A1A', accent: '#A6A29A', city: 'Cincinnati',   name: 'Cannons',      active: false },
  outlaws:      { id: 'outlaws',      internalID: 15, abbr: 'NSH', primary: '#1A1A1A', accent: '#FFB81C', city: 'Nashville',    name: 'Outlaws',      active: false },
  flamethrowers:{ id: 'flamethrowers',internalID: 20, abbr: 'PHL', primary: '#7A1A1A', accent: '#FF6F00', city: 'Philadelphia', name: 'Flamethrowers',active: false },
  nightwatch:   { id: 'nightwatch',   internalID:  8, abbr: 'CLT', primary: '#0E0E0C', accent: '#5DADEC', city: 'Charlotte',    name: 'Nightwatch',   active: false },
  riptide:      { id: 'riptide',      internalID: 24, abbr: 'JAX', primary: '#003A5D', accent: '#5DADEC', city: 'Jacksonville', name: 'Riptide',      active: false },
  express:      { id: 'express',      internalID: 25, abbr: 'BUF', primary: '#003A5D', accent: '#C8102E', city: 'Buffalo',      name: 'Express',      active: false },
  revolution:   { id: 'revolution',   internalID: 26, abbr: 'ROC', primary: '#0E1B2E', accent: '#FFB81C', city: 'Rochester',    name: 'Revolution',   active: false },
  dragons:      { id: 'dragons',      internalID: 27, abbr: 'SF',  primary: '#3E2C1C', accent: '#FFC72C', city: 'San Francisco',name: 'Dragons',      active: false },
  lions:        { id: 'lions',        internalID: 28, abbr: 'OTT', primary: '#1A1A1A', accent: '#C8102E', city: 'Ottawa',       name: 'Lions',        active: false },
  cranes:       { id: 'cranes',       internalID: 30, abbr: 'BAL', primary: '#3E2C1C', accent: '#A6A29A', city: 'Baltimore',    name: 'Cranes',       active: false },
  constitution: { id: 'constitution', internalID: 31, abbr: 'PHL', primary: '#0E1B2E', accent: '#FFB81C', city: 'Philadelphia', name: 'Constitution', active: false },
  spinners:     { id: 'spinners',     internalID: 32, abbr: 'PHL', primary: '#1A1A1A', accent: '#FFB81C', city: 'Philadelphia', name: 'Spinners',     active: false },
  rampage:      { id: 'rampage',      internalID: 33, abbr: 'BOS', primary: '#0E1B2E', accent: '#C8102E', city: 'Boston',       name: 'Rampage',      active: false },
  hammerheads:  { id: 'hammerheads',  internalID: 34, abbr: 'NJ',  primary: '#1A1A1A', accent: '#5DADEC', city: 'New Jersey',   name: 'Hammerheads',  active: false },
};

const FALLBACK: Omit<TeamMeta, 'id' | 'abbr' | 'internalID'> = {
  primary: '#3A3A36',
  accent: '#A6A29A',
};

/**
 * Always returns a TeamMeta — generates a neutral fallback for unknown teamIDs
 * so the UI never crashes on a roster change we haven't mapped yet.
 */
export function teamMeta(id: string): TeamMeta {
  const known = TEAM_META[id];
  if (known) return known;
  return {
    id,
    internalID: 0,
    abbr: id.slice(0, 3).toUpperCase(),
    ...FALLBACK,
  };
}

/** Resolve a teamID to the integer the upstream API expects for ?teamID= filters. */
export function teamInternalID(slugOrInt: string | number): number | null {
  if (typeof slugOrInt === 'number') return slugOrInt;
  const meta = TEAM_META[slugOrInt];
  return meta ? meta.internalID : null;
}

/** Reverse lookup: 'NY' → 'empire', 'BOS' → 'glory'. Useful for endpoints
 *  that return teamAbbrev (uppercase 2-3 letter) instead of the slug. */
export function teamBySlugOrAbbr(slugOrAbbr: string): TeamMeta | null {
  const lower = slugOrAbbr.toLowerCase();
  if (TEAM_META[lower]) return TEAM_META[lower];
  const upper = slugOrAbbr.toUpperCase();
  for (const t of Object.values(TEAM_META)) {
    if (t.abbr === upper) return t;
  }
  return null;
}

/** Sorted list of currently-active teams for dropdowns / nav menus. */
export function activeTeams(): TeamMeta[] {
  return Object.values(TEAM_META)
    .filter((t) => t.active)
    .sort((a, b) => `${a.city ?? ''} ${a.name ?? ''}`.localeCompare(`${b.city ?? ''} ${b.name ?? ''}`));
}

/** Some gameID/abbr fields use different shorthand than the leaderboard (e.g.
 *  "ATX" for Austin where leaderboard uses "AUS", "RAL" for Raleigh→Carolina). */
const ABBR_ALIAS: Record<string, string> = {
  ATX: 'AUS',  // Austin Sol
  HTX: 'HOU',  // Houston Havoc
  ORG: 'ORE',  // Oregon Steel
  RAL: 'CAR',  // Raleigh → Carolina Flyers (rebrand)
  SJ:  'OAK',  // San Jose → Oakland Spiders (rebrand)
};

/** Look up a team by its 2-3 letter abbreviation (canonical or alias). */
export function teamMetaByAbbr(abbr: string): TeamMeta | null {
  if (!abbr) return null;
  const upper = abbr.toUpperCase();
  const canonical = ABBR_ALIAS[upper] ?? upper;
  for (const m of Object.values(TEAM_META)) {
    if (m.abbr === canonical) return m;
  }
  return null;
}
