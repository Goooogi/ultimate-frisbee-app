// Avatar-icon reference model + resolver.
//
// A user's profile icon can be a picked TEAM LOGO / COUNTRY FLAG instead of an
// uploaded photo. It's stored on profiles.avatar_icon as a compact reference
// string "<league>:<teamId>" (e.g. 'ufa:empire', 'wfdf:USA') — NOT an image URL
// — because team logos come from three incompatible sources:
//   - static /public paths (UFA, USAU, WUL)
//   - the PUL R2 CDN (remote URL)
//   - WFDF: a country FLAG EMOJI derived from a code, not an image at all
//
// This module owns:
//   1. parse/format of the reference (parseAvatarIcon / formatAvatarIcon)
//   2. resolving a reference to something renderable (resolveAvatarIcon) — a
//      logo image src, or a WFDF country code for a flag emoji
//   3. enumerating teams per league for the picker grids (listIconTeams /
//      listPulIconTeams) — every entry is guaranteed to carry an icon
//
// Rendering lives in <AvatarIconView> (components/profile/avatar-icon-view.tsx),
// which consumes resolveAvatarIcon so the nav chip, settings preview, and the
// picker all render an icon identically.

import { TEAM_META, activeTeams, teamMeta } from '@/lib/ufa/teams';
import { WUL_TEAMS, allWulTeams } from '@/lib/wul/teams';
import usauLogoManifest from '@/lib/usau/team-logos.json';
import { countryCodeToFlagEmoji } from '@/lib/wfdf/country-flags';
import { WFDF_COUNTRY_NAMES } from '@/lib/wfdf/country-names';

// ─── League set (mirrors favorites' five, same order) ─────────────────────────

export type IconLeague = 'ufa' | 'usau' | 'pul' | 'wul' | 'wfdf';

export const ICON_LEAGUES: readonly IconLeague[] = [
  'ufa', 'usau', 'pul', 'wul', 'wfdf',
] as const;

const LEAGUE_SET = new Set<string>(ICON_LEAGUES);

// ─── Reference parse / format ─────────────────────────────────────────────────

export interface AvatarIconRef {
  league: IconLeague;
  teamId: string;
}

/** Parse a stored "league:teamId" reference. Returns null when malformed or the
 *  league isn't one we support (defensive — the column has a CHECK too). */
export function parseAvatarIcon(value: string | null | undefined): AvatarIconRef | null {
  if (!value) return null;
  const idx = value.indexOf(':');
  if (idx <= 0) return null;
  const league = value.slice(0, idx);
  const teamId = value.slice(idx + 1);
  if (!LEAGUE_SET.has(league) || !teamId) return null;
  return { league: league as IconLeague, teamId };
}

/** Build the stored reference string from a league + team id. */
export function formatAvatarIcon(league: IconLeague, teamId: string): string {
  return `${league}:${teamId}`;
}

// ─── Resolve a reference to something renderable ──────────────────────────────

export type ResolvedIcon =
  | { kind: 'logo'; src: string; name: string }
  | { kind: 'flag'; countryCode: string; name: string }
  | null;

/**
 * Resolve a stored reference to a renderable icon:
 *   - { kind: 'logo', src } for UFA/USAU/PUL/WUL (an <img> source)
 *   - { kind: 'flag', countryCode } for WFDF (render via <WfdfFlag>)
 *   - null when the reference can't be resolved (unknown id / missing logo) —
 *     callers fall back to the initials monogram.
 *
 * PUL is intentionally NOT resolvable here (its logo is a remote URL only known
 * after a DB fetch): resolvePulIcon handles it separately. For the common nav
 * render path we resolve PUL by looking it up in a caller-provided map instead
 * (see resolveAvatarIcon's `pulLogos` arg).
 */
export function resolveAvatarIcon(
  value: string | null | undefined,
  pulLogos?: Map<string, { name: string; logoUrl: string | null }>,
): ResolvedIcon {
  const ref = parseAvatarIcon(value);
  if (!ref) return null;

  switch (ref.league) {
    case 'ufa': {
      const meta = TEAM_META[ref.teamId];
      if (!meta?.logo) return null;
      return { kind: 'logo', src: meta.logo, name: meta.name ?? meta.id };
    }
    case 'wul': {
      const meta = WUL_TEAMS[ref.teamId];
      if (!meta?.logo) return null;
      return { kind: 'logo', src: meta.logo, name: meta.name };
    }
    case 'usau': {
      // teamId IS the manifest key (e.g. "Men/chicago-machine" with '/'
      // preserved). The value is the logo path.
      const src = (usauLogoManifest as Record<string, string>)[ref.teamId];
      if (!src) return null;
      return { kind: 'logo', src, name: usauLabelFromKey(ref.teamId) };
    }
    case 'wfdf': {
      // teamId is an IOC country code. Only resolvable to a real flag.
      if (!countryCodeToFlagEmoji(ref.teamId)) return null;
      return {
        kind: 'flag',
        countryCode: ref.teamId,
        name: WFDF_COUNTRY_NAMES[ref.teamId] ?? ref.teamId,
      };
    }
    case 'pul': {
      const hit = pulLogos?.get(ref.teamId);
      if (!hit?.logoUrl) return null;
      return { kind: 'logo', src: hit.logoUrl, name: hit.name };
    }
  }
}

// ─── Enumeration for the picker grids ─────────────────────────────────────────

export interface IconTeam {
  /** The teamId stored in the reference (formatAvatarIcon(league, id)). */
  id: string;
  name: string;
  /** Logo <img> src for UFA/USAU/PUL/WUL. Null for WFDF (flag from code). */
  logoUrl: string | null;
  /** IOC country code for WFDF only (drives the flag emoji). */
  countryCode?: string;
}

/**
 * All teams (with a logo) for a league, for the picker grid. Synchronous for
 * UFA/USAU/WUL/WFDF; PUL is a DB read handled by listPulIconTeams() and returns
 * [] here (the picker calls the async variant for PUL's tab).
 */
export function listIconTeams(league: IconLeague): IconTeam[] {
  switch (league) {
    case 'ufa':
      // Active franchises only, and only those with a real logo asset.
      return activeTeams()
        .filter((t) => !!t.logo)
        .map((t) => ({ id: t.id, name: t.name ?? t.city ?? t.id, logoUrl: t.logo! }))
        .sort((a, b) => a.name.localeCompare(b.name));
    case 'wul':
      return allWulTeams()
        .filter((t) => !!t.logo)
        .map((t) => ({ id: t.id, name: t.name, logoUrl: t.logo! }))
        .sort((a, b) => a.name.localeCompare(b.name));
    case 'usau':
      return usauIconTeams();
    case 'wfdf':
      return wfdfIconTeams();
    case 'pul':
      return []; // async — see listPulIconTeams
  }
}

/** PUL teams (DB-backed). Kept separate because it needs an async fetch. */
export async function listPulIconTeams(): Promise<IconTeam[]> {
  const { listPulTeams } = await import('@/lib/pul/data');
  const teams = await listPulTeams();
  return teams
    .filter((t) => !!t.logoUrl)
    .map((t) => ({ id: t.id, name: t.name, logoUrl: t.logoUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── USAU: derive a browsable team list straight from the logo manifest ───────
//
// USAU has thousands of teams and no clean "all teams" enumeration, but only
// ~445 have curated logos — and those live in the manifest. The manifest IS the
// set of USAU teams a user can pick. Keys are "[College/]<Gender>/<slug>"; we
// keep the full key as the teamId (it's what resolveAvatarIcon looks up) and
// derive a readable label from the slug + division.

function usauIconTeams(): IconTeam[] {
  const manifest = usauLogoManifest as Record<string, string>;
  return Object.entries(manifest)
    .map(([key, src]) => ({ id: key, name: usauLabelFromKey(key), logoUrl: src }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "College/Men/cal-poly-slo" → "Cal Poly SLO (College · Men)". */
function usauLabelFromKey(key: string): string {
  const parts = key.split('/');
  const slug = parts[parts.length - 1] ?? key;
  const isCollege = parts[0] === 'College';
  const gender = isCollege ? parts[1] : parts[0];
  const name = titleCaseSlug(slug);
  const scope = isCollege ? `College · ${gender}` : gender;
  return `${name} (${scope})`;
}

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    // keep common all-caps tokens (slo, dc) short-uppercased only when already so;
    // otherwise title-case each word.
    .map((w) => (['Slo', 'D1', 'D3', 'Dc'].includes(w) ? w.toUpperCase() : w))
    .join(' ');
}

// ─── WFDF: countries that resolve to a real flag ──────────────────────────────

function wfdfIconTeams(): IconTeam[] {
  return Object.keys(WFDF_COUNTRY_NAMES)
    .filter((code) => !!countryCodeToFlagEmoji(code))
    .map((code) => ({
      id: code,
      name: WFDF_COUNTRY_NAMES[code],
      logoUrl: null,
      countryCode: code,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Re-export a UFA lookup so the settings preview can name a chosen team without
// re-deriving. (Small convenience; keeps imports centralized.)
export { teamMeta as ufaTeamMeta };
