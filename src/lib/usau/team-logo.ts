// USAU team logo resolver.
//
// Keys are composed as `${genderDivision}/${slug}` (e.g. "Men/chicago-machine").
// Division is required in the key because the same slug can exist in multiple
// divisions with different logos (e.g. "phoenix" appears in both Men and Women).
// Resolving by (division, name) together guarantees the correct asset.

import manifest from './team-logos.json';

type LogoManifest = Record<string, string>;
const logos: LogoManifest = manifest as LogoManifest;

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
 */
export function usauTeamLogo(name: string, genderDivision: string | null): string | null {
  if (!genderDivision || !name) return null;
  const key = `${genderDivision}/${toSlug(name)}`;
  return logos[key] ?? null;
}
