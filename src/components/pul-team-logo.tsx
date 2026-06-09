// PUL team logo component — shared across /pul/teams, /pul/teams/[id], /pul/players.
// Renders a real <img> from R2 when logoUrl is present; otherwise a colored
// monogram tile derived from the mascot name. Plain <img> (not Next/Image) to
// avoid domain config requirements for the R2 CDN.

import type { PulTeam } from '@/lib/pul/data';

// Deterministic bg-colors for teams without a logo (currently NY Gridlock).
// Keyed by team id slug. Fallback: a dark neutral.
const MONOGRAM_COLORS: Record<string, string> = {
  'new-york': '#1a1a2e',
  'new-york-gridlock': '#1a1a2e',
  'gridlock': '#1a1a2e',
};

function getMonogramColor(teamId: string): string {
  return MONOGRAM_COLORS[teamId] ?? '#1d2535';
}

interface PulTeamLogoProps {
  team: PulTeam;
  size?: number;
}

/**
 * Renders the PUL team logo at the requested pixel size.
 * - If `team.logoUrl` is set: white tile + object-contain <img> so the logo
 *   reads cleanly on both field and broadcast themes.
 * - If `team.logoUrl` is null: colored square with mascot initials (monogram).
 */
export function PulTeamLogo({ team, size = 40 }: PulTeamLogoProps) {
  if (team.logoUrl) {
    return (
      <span
        className="inline-flex items-center justify-center flex-shrink-0 overflow-hidden rounded-md bg-white border border-[rgb(var(--ink)/0.08)]"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={team.logoUrl}
          alt=""
          className="object-contain"
          style={{ width: size * 0.84, height: size * 0.84 }}
        />
      </span>
    );
  }

  // Monogram: first letter of each word in the mascot name, capped at 3 chars.
  const initials = team.mascot
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 3)
    .toUpperCase();

  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 relative overflow-hidden rounded-md"
      style={{ width: size, height: size, background: getMonogramColor(team.id) }}
      aria-hidden="true"
    >
      {/* Subtle top-light overlay for depth */}
      <span
        className="absolute inset-0"
        style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.12) 0%, transparent 60%)' }}
      />
      <span
        className="relative z-10 font-display font-bold"
        style={{
          color: '#fff',
          fontSize: Math.max(9, size * 0.3),
          letterSpacing: '0.04em',
        }}
      >
        {initials}
      </span>
    </span>
  );
}
