// USAU team logo component — used in /usau/teams ranked list and team detail pages.
// Renders a white tile with a next/image when a logo is found in the local manifest;
// otherwise renders a colored monogram tile from the team name initials.
// Local public paths need no domain config in next.config — next/image handles them natively.

import Image from 'next/image';
import { usauTeamLogo } from '@/lib/usau/team-logo';

// Deterministic fallback background for monogram tiles (dark neutral matching PulTeamLogo).
const MONOGRAM_BG = '#1d2535';

interface UsauTeamLogoProps {
  name: string;
  genderDivision: string | null;
  size?: number;
}

/**
 * Renders the USAU team logo at the requested pixel size.
 * - If a logo path resolves: white tile + object-contain next/image.
 * - If no logo: dark square with team name initials (up to 2 words).
 * Always aria-hidden — the visible team name is the accessible label.
 */
export function UsauTeamLogo({ name, genderDivision, size = 40 }: UsauTeamLogoProps) {
  const logoPath = usauTeamLogo(name, genderDivision);

  if (logoPath) {
    return (
      <span
        className="inline-flex items-center justify-center flex-shrink-0 overflow-hidden rounded-md bg-white border border-[rgb(var(--ink)/0.08)]"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Image
          src={logoPath}
          alt=""
          width={Math.round(size * 0.84)}
          height={Math.round(size * 0.84)}
          className="object-contain"
        />
      </span>
    );
  }

  // Monogram: first letter of each word, capped at 2 chars.
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 relative overflow-hidden rounded-md"
      style={{ width: size, height: size, background: MONOGRAM_BG }}
      aria-hidden="true"
    >
      {/* Subtle top-light overlay for depth — matches PulTeamLogo */}
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
