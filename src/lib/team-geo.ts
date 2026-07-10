// Team geographic metadata helpers — pro-league (PUL/WUL) home-state maps and a
// small country resolver, for surfacing "City, ST · Country" on team pages.
//
// Why curated maps: PUL/WUL teams store only city (state was never captured),
// but there are only ~23 of them and they're stable, so an explicit slug→state
// map is simpler + more reliable than parsing. UFA has its own map in
// usau/regions.ts (UFA_TEAM_STATE); USAU team state is DB-backfilled from event
// venues (usau_teams.state). WFDF is international → country, not state.

/** PUL team slug → US state postal code (or country code for non-US). */
export const PUL_TEAM_STATE: Record<string, string> = {
  atlanta: 'GA',
  austin: 'TX',
  columbus: 'OH',
  dc: 'DC',
  indy: 'IN',
  la: 'CA',
  medellin: 'CO-ANT', // Medellín, Colombia (Antioquia) — non-US, see PUL_TEAM_COUNTRY
  milwaukee: 'WI',
  minnesota: 'MN',
  nashville: 'TN',
  newyork: 'NY',
  philadelphia: 'PA',
  portland: 'OR',
  raleigh: 'NC',
};

/** WUL team slug → US state postal code. All WUL teams are US. */
export const WUL_TEAM_STATE: Record<string, string> = {
  alpenglow: 'CO',
  astra: 'CA',
  falcons: 'CA', // Bay Area
  onyx: 'OR',
  sidewinders: 'AZ',
  soar: 'OR',
  superbloom: 'CA', // San Diego
  tempest: 'WA',
  wild: 'UT',
};

/** Non-US pro teams → ISO country name (US assumed otherwise). */
const NON_US_TEAM_COUNTRY: Record<string, string> = {
  medellin: 'Colombia', // PUL
};

export function pulTeamState(slug: string): string | null {
  const s = PUL_TEAM_STATE[slug];
  return s && !s.includes('-') ? s : null; // hide the non-US composite code
}

export function wulTeamState(slug: string): string | null {
  return WUL_TEAM_STATE[slug] ?? null;
}

/** Country label for a pro team, or 'USA' by default. */
export function proTeamCountry(slug: string): string {
  return NON_US_TEAM_COUNTRY[slug] ?? 'USA';
}

/**
 * Compose a display location line from parts. Drops empty pieces and avoids
 * "City, City" style dupes. Country shown only when NOT USA (US is the default,
 * so labeling it adds noise).
 *   ("Boston", "MA", "USA")   → "Boston, MA"
 *   ("Medellín", null, "Colombia") → "Medellín · Colombia"
 *   ("Seattle", "WA", "USA")  → "Seattle, WA"
 */
export function locationLine(
  city: string | null | undefined,
  state: string | null | undefined,
  country?: string | null,
): string {
  const cityState = [city?.trim(), state?.trim()].filter(Boolean).join(', ');
  const showCountry = country && country.toUpperCase() !== 'USA' && country.toUpperCase() !== 'US';
  return [cityState, showCountry ? country : null].filter(Boolean).join(' · ');
}
