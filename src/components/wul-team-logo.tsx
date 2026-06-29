// WUL team logo component — mirrors pul-team-logo.tsx.
// Accepts a WulTeam (from wul/data.ts) and renders a real <img> when
// logoUrl is present; otherwise a colored monogram tile using the team's
// accentColor. WUL logos live at /teams/wul/<id>.png (committed assets,
// same-origin — no CDN domain assertion needed unlike PUL).

import type { WulTeam } from '@/lib/wul/data';

interface WulTeamLogoProps {
  team: Pick<WulTeam, 'id' | 'abbr' | 'logoUrl' | 'accentColor'>;
  size?: number;
}

/**
 * Renders the WUL team logo at the requested pixel size.
 * - If `team.logoUrl` is set: white tile + object-contain <img>.
 * - If `team.logoUrl` is null: colored square with team abbr as monogram.
 */
export function WulTeamLogo({ team, size = 40 }: WulTeamLogoProps) {
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

  const bg = team.accentColor ?? '#1d2535';
  const initials = (team.abbr ?? team.id)
    .toUpperCase()
    .slice(0, 3);

  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 relative overflow-hidden rounded-md"
      style={{ width: size, height: size, background: bg }}
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
