// LiveDot — pulsing live indicator.
// Field theme: uses the `live` token (crimson red).
// Broadcast theme: uses the `accent` token (volt green).
// The outer ring expands + fades via animate-pulse-out keyframe defined in tailwind.config.ts.

interface LiveDotProps {
  /** Override size in px. Default 7px (field) or 9px (broadcast). */
  size?: number;
  className?: string;
}

export function LiveDot({ size = 7, className = '' }: LiveDotProps) {
  return (
    <span
      className={`relative inline-block flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* expanding pulse ring */}
      <span
        className="absolute inset-0 rounded-full bg-live animate-pulse-out"
        style={{ transformOrigin: 'center' }}
      />
      {/* solid core */}
      <span className="absolute inset-0 rounded-full bg-live" />
    </span>
  );
}

/** Broadcast variant — uses accent color instead of live */
export function LiveDotAccent({ size = 9, className = '' }: LiveDotProps) {
  return (
    <span
      className={`relative inline-block flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 rounded-full bg-accent animate-pulse-out"
        style={{ transformOrigin: 'center' }}
      />
      <span className="absolute inset-0 rounded-full bg-accent" />
    </span>
  );
}
