// Mini SVG of a horizontal Ultimate field with two endzones, players, and a
// throw arc. Used as the Playbook tile's preview graphic on the home page.
// Ported from the design's FieldDiagram component (home-pages.jsx).

interface FieldDiagramProps {
  width?: number;
  height?: number;
  dark?: boolean;
  accent?: string;
}

export function FieldDiagram({
  width = 380,
  height = 170,
  dark = false,
  accent = '#FF3D00',
}: FieldDiagramProps) {
  const lineCol = dark ? 'rgba(244,242,235,0.35)' : 'rgba(14,14,12,0.35)';
  const grassFill = dark ? 'transparent' : '#FAFAF6';
  const grassStroke = dark ? 'rgba(244,242,235,0.15)' : 'rgba(14,14,12,0.10)';
  const ezFill = dark ? 'rgba(244,242,235,0.04)' : 'rgba(14,14,12,0.04)';
  const labelCol = dark ? 'rgba(244,242,235,0.45)' : '#A6A29A';
  const playerInk = dark ? '#F4F2EB' : '#0E0E0C';
  const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

  return (
    <svg width={width} height={height} viewBox="0 0 380 170" aria-hidden="true">
      <rect x="0" y="0" width="380" height="170" fill={grassFill} stroke={grassStroke} />
      <rect x="0" y="0" width="60" height="170" fill={ezFill} />
      <rect x="320" y="0" width="60" height="170" fill={ezFill} />
      <line x1="60" y1="0" x2="60" y2="170" stroke={lineCol} strokeDasharray="3 4" />
      <line x1="320" y1="0" x2="320" y2="170" stroke={lineCol} strokeDasharray="3 4" />
      {/* offense (filled) */}
      {[[100, 40], [140, 140], [180, 90], [220, 30], [260, 130], [300, 80]].map(([x, y], i) => (
        <circle key={`o${i}`} cx={x} cy={y} r="6" fill={playerInk} />
      ))}
      {/* defense (outline) */}
      {[[120, 55], [160, 120], [200, 75], [240, 50], [280, 110]].map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r="6" fill="none" stroke={playerInk} strokeWidth="2" />
      ))}
      {/* throw arc */}
      <path d="M 100 40 Q 200 -10 300 80" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="100" cy="40" r="3" fill={accent} />
      <polygon points="300,80 293,72 296,82 289,82" fill={accent} />
      <text x="14" y="92" fontFamily={MONO} fontSize="9" fill={labelCol} transform="rotate(-90 14 92)">
        END ZONE
      </text>
      <text x="356" y="92" fontFamily={MONO} fontSize="9" fill={labelCol} transform="rotate(-90 356 92)">
        END ZONE
      </text>
    </svg>
  );
}

/** Decorative chalk/field-line background for the hero game card. */
export function HeroFieldLines({ color, accent }: { color: string; accent: string }) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 800 480"
      preserveAspectRatio="none"
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    >
      <line x1="60" y1="0" x2="60" y2="480" stroke={color} strokeDasharray="3 6" />
      <line x1="740" y1="0" x2="740" y2="480" stroke={color} strokeDasharray="3 6" />
      {/* Center line — dashed + at half the sideline opacity so it blends into
          the card instead of reading as a hard seam splitting it down the
          middle (was a solid full-height stroke). */}
      <line x1="400" y1="0" x2="400" y2="480" stroke={color} strokeDasharray="3 6" opacity="0.5" />
      <ellipse
        cx="700"
        cy="-30"
        rx="160"
        ry="50"
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        opacity="0.35"
        transform="rotate(-18 700 -30)"
      />
      <ellipse
        cx="700"
        cy="-30"
        rx="120"
        ry="36"
        fill="none"
        stroke={accent}
        strokeWidth="1"
        opacity="0.25"
        transform="rotate(-18 700 -30)"
      />
      <path
        d="M 80 360 Q 400 80 720 320"
        fill="none"
        stroke={accent}
        strokeWidth="1"
        strokeDasharray="3 6"
        opacity="0.4"
      />
    </svg>
  );
}

// Hero glows — same geometry as mobile's hero-shared.tsx (react-native-svg
// RadialGradient with rx/ry). SVG ellipses sized in card fractions, so the
// falloff scales with the card at every breakpoint instead of a CSS circle
// in an offset box that sat mid-card on phones. Browsers ignore rx/ry on
// <radialGradient>, so the ellipse is a unit circle + gradientTransform.

/** Gradient ids are document-global and slide ids can carry slashes (WUL). */
function glowId(id: string, suffix: string): string {
  return `${id.replace(/[^A-Za-z0-9_-]/g, '-')}-${suffix}`;
}

/** Single league-color glow off the top-right corner — tournament slides. */
export function HeroCornerGlow({ id, color }: { id: string; color: string }) {
  const gid = glowId(id, 'corner-glow');
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gid} cx="0" cy="0" r="1" gradientTransform="translate(0.82 0.08) scale(0.65 0.8)">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="62%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gid})`} />
    </svg>
  );
}

/** Team-color glow per side — wide ellipses that overlap through the center
 *  so the two colors cross-blend instead of leaving a dark seam. */
export function HeroGlows({ id, awayColor, homeColor }: { id: string; awayColor: string; homeColor: string }) {
  const left = glowId(id, 'glow-l');
  const right = glowId(id, 'glow-r');
  const stops = (color: string) => (
    <>
      <stop offset="0%" stopColor={color} stopOpacity={0.53} />
      <stop offset="45%" stopColor={color} stopOpacity={0.24} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </>
  );
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={left} cx="0" cy="0" r="1" gradientTransform="translate(0.18 0.5) scale(0.62 0.85)">
          {stops(awayColor)}
        </radialGradient>
        <radialGradient id={right} cx="0" cy="0" r="1" gradientTransform="translate(0.82 0.5) scale(0.62 0.85)">
          {stops(homeColor)}
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${left})`} />
      <rect width="100" height="100" fill={`url(#${right})`} />
    </svg>
  );
}
