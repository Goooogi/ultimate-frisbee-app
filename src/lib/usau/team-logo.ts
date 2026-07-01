// USAU team logo resolver.
//
// Club keys are composed as `${genderDivision}/${slug}` (e.g. "Men/chicago-machine").
// Division is required because the same slug can exist in multiple divisions with
// different logos (e.g. "phoenix" appears in both Men and Women).
//
// COLLEGE teams share names with each other AND with club teams (a college "Colorado"
// men's team is distinct from any club team, and from the women's college "Colorado").
// USAU does not serve reliable college crests (the "logo" slot is often a generic patch
// or a random screenshot upload), so college logos are curated + scraped-with-a-junk-gate
// into their own namespace: `College/${genderDivision}/${slug}`
// (e.g. "College/Men/colorado" → CU Mamabird's crest). Keying on level + gender keeps
// college separate from club and men's-college separate from women's-college.

import manifest from './team-logos.json';

type LogoManifest = Record<string, string>;
const logos: LogoManifest = manifest as LogoManifest;

/** USAU competition levels that mean "college" (as stored in usau_teams). */
const COLLEGE_LEVELS = new Set(['COLLEGE_D1', 'COLLEGE_D3']);

/** True when a competition_level value denotes a college team. */
export function isCollegeLevel(level: string | null | undefined): boolean {
  return !!level && COLLEGE_LEVELS.has(level);
}

/**
 * Converts a team name to the slug format used in the manifest:
 * lowercase, non-alphanumeric runs replaced with a single hyphen, leading/trailing hyphens stripped.
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Returns the public path for a USAU team logo, or null if not found.
 *
 * @param name - Team name (e.g. "Chicago Machine")
 * @param genderDivision - One of "Men" | "Women" | "Mixed" (null → returns null immediately)
 * @param competitionLevel - USAU competition_level; when it's a college level the
 *   lookup uses the `College/<gender>/<slug>` namespace instead of the club one.
 */
export function usauTeamLogo(
  name: string,
  genderDivision: string | null,
  competitionLevel?: string | null,
): string | null {
  if (!genderDivision || !name) return null;
  const slug = toSlug(name);
  const key = isCollegeLevel(competitionLevel)
    ? `College/${genderDivision}/${slug}`
    : `${genderDivision}/${slug}`;
  return logos[key] ?? null;
}
