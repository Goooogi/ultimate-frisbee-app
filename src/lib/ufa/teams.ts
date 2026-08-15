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
  logo?: string;       // path under /public, e.g. '/teams/ufa/empire.png'
}

export const TEAM_META: Record<string, TeamMeta> = {
  // ── East (current) ──
  empire:       { id: 'empire',       internalID: 14, abbr: 'NY',  primary: '#69BD45', accent: '#0E0E0C', city: 'New York',     name: 'Empire',       division: 'East',    active: true, logo: '/teams/ufa/empire.png' },
  glory:        { id: 'glory',        internalID: 37, abbr: 'BOS', primary: '#000000', accent: '#E1B87F', city: 'Boston',       name: 'Glory',        division: 'East',    active: true, logo: '/teams/ufa/glory.png' },
  breeze:       { id: 'breeze',       internalID:  5, abbr: 'DC',  primary: '#0A3751', accent: '#BF0A30', city: 'DC',           name: 'Breeze',       division: 'East',    active: true, logo: '/teams/ufa/breeze.png' },
  phoenix:      { id: 'phoenix',      internalID: 16, abbr: 'PHI', primary: '#F04E23', accent: '#0E0E0C', city: 'Philadelphia', name: 'Phoenix',      division: 'East',    active: true, logo: '/teams/ufa/phoenix.png' },
  royal:        { id: 'royal',        internalID: 13, abbr: 'MTL', primary: '#00305E', accent: '#C8102E', city: 'Montreal',     name: 'Royal',        division: 'East',    active: true, logo: '/teams/ufa/royal.png' },
  rush:         { id: 'rush',         internalID: 23, abbr: 'TOR', primary: '#C52033', accent: '#0E0E0C', city: 'Toronto',      name: 'Rush',         division: 'East',    active: true, logo: '/teams/ufa/rush.png' },

  // ── Central (current) ──
  alleycats:    { id: 'alleycats',    internalID:  7, abbr: 'IND', primary: '#00703C', accent: '#FFFFFF', city: 'Indianapolis', name: 'AlleyCats',    division: 'Central', active: true, logo: '/teams/ufa/alleycats.png' },
  radicals:     { id: 'radicals',     internalID: 11, abbr: 'MAD', primary: '#003A5C', accent: '#F4D03F', city: 'Madison',      name: 'Radicals',     division: 'Central', active: true, logo: '/teams/ufa/radicals.png' },
  thunderbirds: { id: 'thunderbirds', internalID: 17, abbr: 'PIT', primary: '#FDBC11', accent: '#0E0E0C', city: 'Pittsburgh',   name: 'Thunderbirds', division: 'Central', active: true, logo: '/teams/ufa/thunderbirds.png' },
  union:        { id: 'union',        internalID:  3, abbr: 'CHI', primary: '#002D72', accent: '#C8102E', city: 'Chicago',      name: 'Union',        division: 'Central', active: true, logo: '/teams/ufa/union.png' },
  windchill:    { id: 'windchill',    internalID: 12, abbr: 'MIN', primary: '#6F7F98', accent: '#0C2340', city: 'Minnesota',    name: 'Wind Chill',   division: 'Central', active: true, logo: '/teams/ufa/windchill.png' },

  // ── South (current) ──
  bighorns:     { id: 'bighorns',     internalID: 42, abbr: 'VEG', primary: '#A25F3F', accent: '#C9A24A', city: 'Vegas',        name: 'Bighorns',     division: 'South',   active: true, logo: '/teams/ufa/bighorns.png' },
  flyers:       { id: 'flyers',       internalID: 18, abbr: 'CAR', primary: '#003049', accent: '#7BAFD4', city: 'Carolina',     name: 'Flyers',       division: 'South',   active: true, logo: '/teams/ufa/flyers.png' },
  growlers:     { id: 'growlers',     internalID: 19, abbr: 'SD',  primary: '#000000', accent: '#FFB81C', city: 'San Diego',    name: 'Growlers',     division: 'South',   active: true, logo: '/teams/ufa/growlers.png' },
  havoc:        { id: 'havoc',        internalID: 41, abbr: 'HOU', primary: '#000000', accent: '#FF4B14', city: 'Houston',      name: 'Havoc',        division: 'South',   active: true, logo: '/teams/ufa/havoc.png' },
  hustle:       { id: 'hustle',       internalID:  1, abbr: 'ATL', primary: '#333366', accent: '#C8102E', city: 'Atlanta',      name: 'Hustle',       division: 'South',   active: true, logo: '/teams/ufa/hustle.png' },
  sol:          { id: 'sol',          internalID:  2, abbr: 'AUS', primary: '#2B3283', accent: '#FFC72C', city: 'Austin',       name: 'Sol',          division: 'South',   active: true, logo: '/teams/ufa/sol.png' },

  // ── West (current) ──
  apex:         { id: 'apex',         internalID: 39, abbr: 'COL', primary: '#191640', accent: '#E8DFCB', city: 'Colorado',     name: 'Apex',         division: 'West',    active: true, logo: '/teams/ufa/apex.png' },
  cascades:     { id: 'cascades',     internalID: 22, abbr: 'SEA', primary: '#08192D', accent: '#5DADEC', city: 'Seattle',      name: 'Cascades',     division: 'West',    active: true, logo: '/teams/ufa/cascades.png' },
  shred:        { id: 'shred',        internalID: 40, abbr: 'SLC', primary: '#00477B', accent: '#7C8C9E', city: 'Salt Lake',    name: 'Shred',        division: 'West',    active: true, logo: '/teams/ufa/shred.png' },
  spiders:      { id: 'spiders',      internalID: 21, abbr: 'OAK', primary: '#FEBD25', accent: '#0E0E0C', city: 'Oakland',      name: 'Spiders',      division: 'West',    active: true, logo: '/teams/ufa/spiders.png' },
  steel:        { id: 'steel',        internalID: 38, abbr: 'ORE', primary: '#05384F', accent: '#FF6F00', city: 'Oregon',       name: 'Steel',        division: 'West',    active: true, logo: '/teams/ufa/steel.png' },

  // ── Historical / inactive franchises (so older years still resolve) ──
  aviators:     { id: 'aviators',     internalID: 10, abbr: 'LA',  primary: '#1B365D', accent: '#FBB040', city: 'Los Angeles',  name: 'Aviators',     active: false, logo: '/teams/ufa/aviators.png' },
  mechanix:     { id: 'mechanix',     internalID:  6, abbr: 'DET', primary: '#1A1A1A', accent: '#C8102E', city: 'Detroit',      name: 'Mechanix',     active: false, logo: '/teams/ufa/mechanix.png' },
  legion:       { id: 'legion',       internalID:  4, abbr: 'DAL', primary: '#0E1B2E', accent: '#C8102E', city: 'Dallas',       name: 'Legion',       active: false, logo: '/teams/ufa/legion.png' },
  cannons:      { id: 'cannons',      internalID:  9, abbr: 'TB',  primary: '#1A1A1A', accent: '#A6A29A', city: 'Tampa Bay',    name: 'Cannons',      active: false, logo: '/teams/ufa/cannons.png' },
  outlaws:      { id: 'outlaws',      internalID: 15, abbr: 'OTT', primary: '#1A1A1A', accent: '#FFB81C', city: 'Ottawa',       name: 'Outlaws',      active: false, logo: '/teams/ufa/outlaws.png' },
  flamethrowers:{ id: 'flamethrowers',internalID: 20, abbr: 'SF',  primary: '#7A1A1A', accent: '#FF6F00', city: 'San Francisco',name: 'FlameThrowers',active: false, logo: '/teams/ufa/flamethrowers.png' },
  nightwatch:   { id: 'nightwatch',   internalID:  8, abbr: 'NSH', primary: '#0E0E0C', accent: '#5DADEC', city: 'Nashville',    name: 'Nightwatch',   active: false, logo: '/teams/ufa/nightwatch.png' },
  riptide:      { id: 'riptide',      internalID: 24, abbr: 'VAN', primary: '#003A5D', accent: '#5DADEC', city: 'Vancouver',    name: 'Riptide',      active: false, logo: '/teams/ufa/riptide.png' },
  express:      { id: 'express',      internalID: 25, abbr: 'CLT', primary: '#003A5D', accent: '#C8102E', city: 'Charlotte',    name: 'Express',      active: false },
  revolution:   { id: 'revolution',   internalID: 26, abbr: 'CIN', primary: '#0E1B2E', accent: '#FFB81C', city: 'Cincinnati',   name: 'Revolution',   active: false, logo: '/teams/ufa/revolution.png' },
  dragons:      { id: 'dragons',      internalID: 27, abbr: 'ROC', primary: '#3E2C1C', accent: '#FFC72C', city: 'Rochester',    name: 'Dragons',      active: false, logo: '/teams/ufa/dragons.png' },
  lions:        { id: 'lions',        internalID: 28, abbr: 'SL',  primary: '#1A1A1A', accent: '#C8102E', city: 'Salt Lake',    name: 'Lions',        active: false, logo: '/teams/ufa/lions.png' },
  cranes:       { id: 'cranes',       internalID: 30, abbr: 'CMH', primary: '#3E2C1C', accent: '#A6A29A', city: 'Columbus',     name: 'Cranes',       active: false },
  constitution: { id: 'constitution', internalID: 31, abbr: 'CT',  primary: '#0E1B2E', accent: '#FFB81C', city: 'Connecticut',  name: 'Constitution', active: false, logo: '/teams/ufa/constitution.png' },
  spinners:     { id: 'spinners',     internalID: 32, abbr: 'PHL', primary: '#1A1A1A', accent: '#FFB81C', city: 'Philadelphia', name: 'Spinners',     active: false, logo: '/teams/ufa/spinners.png' },
  rampage:      { id: 'rampage',      internalID: 33, abbr: 'RI',  primary: '#0E1B2E', accent: '#C8102E', city: 'Rhode Island', name: 'Rampage',      active: false },
  hammerheads:  { id: 'hammerheads',  internalID: 34, abbr: 'NJ',  primary: '#1A1A1A', accent: '#5DADEC', city: 'New Jersey',   name: 'Hammerheads',  active: false, logo: '/teams/ufa/hammerheads.png' },
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
// ── Franchise name history ───────────────────────────────────────────────────
// The API retroactively applies the CURRENT brand to every season (2016 games
// already say "Legion"), so year-aware surfaces need the name as it actually
// was. `through` = last season played under that name.
const NAME_HISTORY: Record<string, ReadonlyArray<{ through: number; name: string }>> = {
  legion: [{ through: 2021, name: 'Roughnecks' }], // rebranded to Legion for 2022
  union: [{ through: 2019, name: 'Wildfire' }], // rebranded to Union for 2021 (2020 cancelled)
  cascades: [{ through: 2014, name: 'Raptors' }], // one season as Seattle Raptors
};

// Relocations under one slug — the API's per-game city field is HISTORICAL
// (audited 2026-08-06), these mirror it so a 2016 season doesn't claim the
// franchise's later home. `through` = last season in that city.
const CITY_HISTORY: Record<string, ReadonlyArray<{ through: number; city: string }>> = {
  cannons: [{ through: 2017, city: 'Jacksonville' }], // → Tampa Bay 2018
  flyers: [{ through: 2021, city: 'Raleigh' }], // → Carolina 2022
  spiders: [{ through: 2021, city: 'San Jose' }], // → Oakland 2022
  steel: [{ through: 2022, city: 'Portland' }], // → Oregon 2023
};

/**
 * Display nickname for a franchise in a given season — "Roughnecks" for
 * Dallas 2016–2021, the TEAM_META name otherwise. Year-less surfaces (search,
 * favorites, nav) should keep using TEAM_META directly: the current brand is
 * the franchise's identity.
 */
export function teamNameForYear(teamID: string, year: number): string | undefined {
  const meta = TEAM_META[teamID.toLowerCase()];
  const hist = NAME_HISTORY[teamID.toLowerCase()];
  if (hist) {
    for (const h of hist) {
      if (year <= h.through) return h.name;
    }
  }
  return meta?.name;
}

/** City counterpart of teamNameForYear — "San Jose" for Spiders ≤2021, etc. */
export function teamCityForYear(teamID: string, year: number): string | undefined {
  const meta = TEAM_META[teamID.toLowerCase()];
  const hist = CITY_HISTORY[teamID.toLowerCase()];
  if (hist) {
    for (const h of hist) {
      if (year <= h.through) return h.city;
    }
  }
  return meta?.city;
}

// Era logos — rebranded franchises' own marks (recovered from watchufa's CMS
// and the Wayback Machine, 2026-08-06). Same `through` semantics as above.
const LOGO_HISTORY: Record<string, ReadonlyArray<{ through: number; logo: string }>> = {
  legion: [{ through: 2021, logo: '/teams/ufa/roughnecks.png' }],
  union: [{ through: 2019, logo: '/teams/ufa/wildfire.png' }],
  cascades: [{ through: 2014, logo: '/teams/ufa/raptors.png' }],
};

/** Logo path for a franchise in a given season — the era's own mark for
 *  rebranded years (Roughnecks ≤2021, Wildfire ≤2019), else TEAM_META.logo. */
export function teamLogoForYear(teamID: string, year: number): string | undefined {
  const slug = teamID.toLowerCase();
  for (const e of LOGO_HISTORY[slug] ?? []) {
    if (year <= e.through) return e.logo;
  }
  return TEAM_META[slug]?.logo;
}

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

/**
 * A franchise's former identity as its own searchable entity — "Dallas
 * Roughnecks" rather than the Legion row that currently absorbs it. Derived
 * from NAME_HISTORY/CITY_HISTORY/LOGO_HISTORY so there is one source of truth;
 * adding an era to those maps adds it here for free.
 *
 * `id` stays the franchise slug: an era is a display alias, not a separate
 * team, so it links to the same /teams/[id] page. That means era rows are NOT
 * safe to render in a React list keyed by `id` alongside their franchise —
 * use `eraKey` for keys.
 */
export interface TeamEra {
  /** Franchise slug — where this era links. Shared with the current-brand row. */
  id: string;
  /** Unique per era; safe as a React key. e.g. 'legion@2021'. */
  eraKey: string;
  city: string;
  name: string;
  logo?: string;
  /** Last season under this identity. */
  through: number;
  /** First season under it — the prior era's `through` + 1, or the UFA's first. */
  from: number;
  /** "2016–2021" — for search hints and index badges. */
  yearLabel: string;
}

// First season each rebranded franchise fielded a team — verified 2026-08-15
// against /web-v1/team-stats?year=N (first year the slug appears). Needed
// because franchises joined in different years, so there is no league-wide
// floor: Dallas played 2016–2021 as the Roughnecks, not 2012–2021.
const DEBUT_SEASON: Record<string, number> = {
  legion: 2016,
  union: 2013,
  cascades: 2014,
};

/**
 * Every historical (non-current) identity across all franchises, city-sorted.
 *
 * Only NAME_HISTORY drives this: a city-only move (San Jose → Oakland Spiders)
 * is the same brand in a new town, not a distinct team worth its own row. Those
 * still get the era's correct city here when a name change coincides.
 */
export function teamEras(): TeamEra[] {
  const eras: TeamEra[] = [];
  for (const [slug, hist] of Object.entries(NAME_HISTORY)) {
    // Ascending by `through` so each era's start is the previous era's end + 1.
    const ordered = [...hist].sort((a, b) => a.through - b.through);
    let from = DEBUT_SEASON[slug] ?? ordered[0].through;
    for (const h of ordered) {
      const city = teamCityForYear(slug, h.through) ?? TEAM_META[slug]?.city ?? '';
      eras.push({
        id: slug,
        eraKey: `${slug}@${h.through}`,
        city,
        name: h.name,
        logo: teamLogoForYear(slug, h.through),
        through: h.through,
        from,
        yearLabel: from === h.through ? `${from}` : `${from}–${h.through}`,
      });
      from = h.through + 1;
    }
  }
  return eras.sort((a, b) => `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`));
}

/** Sorted list of currently-active teams for dropdowns / nav menus. */
export function activeTeams(): TeamMeta[] {
  return Object.values(TEAM_META)
    .filter((t) => t.active)
    .sort((a, b) => `${a.city ?? ''} ${a.name ?? ''}`.localeCompare(`${b.city ?? ''} ${b.name ?? ''}`));
}

/** Every UFA team we know — active AND folded/historical — city-sorted. Used by
 *  search so a folded franchise is still findable. */
export function allUfaTeams(): TeamMeta[] {
  return Object.values(TEAM_META).sort((a, b) =>
    `${a.city ?? ''} ${a.name ?? ''}`.localeCompare(`${b.city ?? ''} ${b.name ?? ''}`),
  );
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
