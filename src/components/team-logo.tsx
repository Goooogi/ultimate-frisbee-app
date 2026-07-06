// Small shared component for a team's logo or abbr-block fallback.
// Used in the Teams page, game-detail roster CTAs, anywhere we need
// a square team mark.

/**
 * Structural subset of team metadata needed to render a team mark. `TeamMeta`
 * (ufa/teams) and `TwelveOhTeamDisplay` (twelve-oh/team-display) both satisfy
 * this shape, so this component works for any league without importing
 * league-specific types.
 */
export interface TeamMark {
  abbr: string;
  primary: string;
  accent: string;
  logo?: string | null;
}

interface TeamLogoProps {
  team: TeamMark;
  /** Size in px (square). */
  size?: number;
  /** When true, render the abbr fallback even if a logo exists (e.g., tiny sizes). */
  forceAbbr?: boolean;
  className?: string;
}

export function TeamLogo({ team, size = 32, forceAbbr = false, className = '' }: TeamLogoProps) {
  const useLogo = forceAbbr ? null : team.logo;

  return (
    <span
      className={[
        'inline-flex items-center justify-center flex-shrink-0 relative overflow-hidden',
        className,
      ].join(' ')}
      style={{
        width: size,
        height: size,
        background: useLogo ? '#ffffff' : team.primary,
      }}
      aria-hidden="true"
    >
      {useLogo ? (
        <img
          src={useLogo}
          alt=""
          className="object-contain"
          style={{ width: size * 0.84, height: size * 0.84 }}
        />
      ) : (
        <>
          <span className="absolute inset-0" style={{ background: team.accent, opacity: 0.15 }} />
          <span
            className="relative z-10 font-display font-bold"
            style={{ color: '#fff', fontSize: Math.max(9, size * 0.33), letterSpacing: '0.04em' }}
          >
            {team.abbr}
          </span>
        </>
      )}
    </span>
  );
}
