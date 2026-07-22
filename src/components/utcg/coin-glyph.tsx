// CoinGlyph — small SVG coin icon shared across UTCG (header pill, pack
// prices, sell-duplicates CTA). No emoji, matching this codebase's SVG-icon
// convention (see LiveDot in src/components/live-dot.tsx).

interface CoinGlyphProps {
  size?: number;
  className?: string;
}

export function CoinGlyph({ size = 16, className = '' }: CoinGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`flex-shrink-0 ${className}`}
    >
      <circle cx="10" cy="10" r="8" fill="currentColor" opacity="0.16" />
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6.5v7M8 8.2c0-.9.9-1.6 2-1.6s2 .7 2 1.6c0 2-4 1.4-4 3.4 0 .9.9 1.6 2 1.6s2-.7 2-1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
