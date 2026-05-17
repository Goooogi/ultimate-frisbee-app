// Theme-aware port of public/the-layout-hero.svg.
// We render inline (not <img>) so the LAYOUT text inherits the theme's ink color
// and the disc + "THE" eyebrow pick up the theme accent. The SVG file in /public
// stays as the design source and is what's served as the favicon.

interface HeroWordmarkProps {
  /** Width in px on mobile; desktop scales up via the surrounding wrapper. */
  width?: number;
  className?: string;
}

export function HeroWordmark({ width = 320, className = '' }: HeroWordmarkProps) {
  // Native viewBox is 500×150; preserve aspect ratio.
  const height = (width * 150) / 500;
  return (
    <svg
      role="img"
      aria-label="The Layout"
      width={width}
      height={height}
      viewBox="0 0 500 150"
      className={className}
    >
      <text
        x="8"
        y="36"
        fontFamily="var(--font-display), Antonio, Impact, sans-serif"
        fontStyle="italic"
        fontWeight="600"
        fontSize="26"
        letterSpacing="4.7"
        fill="rgb(var(--accent))"
      >
        THE
      </text>
      <text
        x="0"
        y="128"
        fontFamily="var(--font-display), Antonio, Impact, sans-serif"
        fontStyle="italic"
        fontWeight="700"
        fontSize="108"
        letterSpacing="-0.5"
        fill="rgb(var(--ink))"
      >
        LAYOUT
      </text>
      <g transform="translate(345 38)">
        <g transform="rotate(-12 60 42)">
          <path
            d="M -10 56 Q 30 50 60 48"
            stroke="rgb(var(--accent))"
            strokeOpacity="0.35"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M -2 50 Q 28 46 56 44"
            stroke="rgb(var(--accent))"
            strokeOpacity="0.6"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <ellipse cx="74" cy="42" rx="40" ry="18" fill="rgb(var(--accent))" />
          <ellipse
            cx="74"
            cy="42"
            rx="30"
            ry="12"
            fill="none"
            stroke="rgb(var(--bg))"
            strokeOpacity="0.55"
            strokeWidth="1.8"
          />
          <ellipse
            cx="74"
            cy="42"
            rx="20"
            ry="7"
            fill="none"
            stroke="rgb(var(--bg))"
            strokeOpacity="0.4"
            strokeWidth="1.4"
          />
        </g>
      </g>
    </svg>
  );
}
