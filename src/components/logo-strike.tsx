// LogoStrikeInline — compact single-line header logo.
// Ported from design-reference/logo-marks.jsx (LogoStrikeInline + DiscFlight).
// No inline styles for colors — uses theme tokens via Tailwind / currentColor.

interface DiscFlightProps {
  size: number;
  color: string;
  ring: string;
  tilt?: number;
}

function DiscFlight({ size, color, ring, tilt = -12 }: DiscFlightProps) {
  return (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 120 84"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <g transform={`rotate(${tilt} 60 42)`}>
        {/* motion trails */}
        <path
          d="M -10 56 Q 30 50 60 48"
          fill="none"
          stroke={color}
          strokeOpacity="0.35"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M -2 50 Q 28 46 56 44"
          fill="none"
          stroke={color}
          strokeOpacity="0.6"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* disc body */}
        <ellipse cx="74" cy="42" rx="40" ry="18" fill={color} />
        <ellipse cx="74" cy="42" rx="30" ry="12" fill="none" stroke={ring} strokeWidth="1.8" />
        <ellipse
          cx="74"
          cy="42"
          rx="20"
          ry="7"
          fill="none"
          stroke={ring}
          strokeWidth="1.4"
          opacity="0.6"
        />
      </g>
    </svg>
  );
}

interface LogoStrikeInlineProps {
  size?: number;
  /** Pass the current accent hex color — #FF3D00 in field, #D9FF3A in broadcast */
  accentColor: string;
  /** Controls ink + ring colors for disc */
  theme: 'light' | 'dark';
  className?: string;
}

export function LogoStrikeInline({
  size = 1,
  accentColor,
  theme,
  className = '',
}: LogoStrikeInlineProps) {
  const ring =
    theme === 'light' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.35)';

  return (
    <div
      className={`inline-flex items-center font-display ${className}`}
      style={{ gap: 8 * size, lineHeight: 1 }}
      aria-label="The Layout"
    >
      <span
        className="font-semibold italic uppercase"
        style={{
          fontSize: 12 * size,
          letterSpacing: '0.2em',
          color: accentColor,
          transform: 'translateY(-1px)',
        }}
      >
        The
      </span>
      <span
        className="font-bold italic uppercase text-ink"
        style={{ fontSize: 28 * size, letterSpacing: '-0.005em' }}
      >
        Layout
      </span>
      <DiscFlight size={24 * size} color={accentColor} ring={ring} tilt={-12} />
    </div>
  );
}
