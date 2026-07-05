// Country flag for WFDF teams — WFDF is nation-oriented (even club events tag a
// country), so a team's "logo" is its country flag, matching the official
// wfdf.sport site.
//
// We render an EMOJI flag derived from the team's IOC country code (mapped to
// ISO-2 in country-flags.ts). Emoji flags are self-contained (no image assets,
// no CSP/origin concerns) and render the real flag on every modern OS. Codes
// that aren't a single real country (WRD/REP/UNI), or unknown codes, fall back
// to a compact text chip (the previous behaviour) so nothing renders blank.

import { countryCodeToFlagEmoji } from '@/lib/wfdf/country-flags';

export function WfdfFlag({
  countryCode,
  size = 16,
}: {
  /** Present for API symmetry with the source's flagfile; not used (emoji flag
   *  is derived from the country code, not an image). */
  flagFile?: string | null;
  countryCode: string | null;
  size?: number;
}) {
  const emoji = countryCodeToFlagEmoji(countryCode);

  // Real flag — render the emoji sized to `size`. line-height:1 + block keeps
  // it vertically centered; the emoji glyph itself carries the rounded corners.
  if (emoji) {
    return (
      <span
        role="img"
        aria-label={countryCode ?? 'flag'}
        title={countryCode ?? undefined}
        className="inline-flex items-center justify-center flex-shrink-0 leading-none select-none"
        // Emoji flags render slightly small for their box; 1.15× nudges them to
        // visually match the requested pixel size.
        style={{ fontSize: size * 1.15, width: size * 1.4, height: size }}
      >
        {emoji}
      </span>
    );
  }

  // No real flag for this code — neutral dot when there's no code at all…
  if (!countryCode) {
    return (
      <span
        aria-hidden="true"
        className="inline-block rounded-full bg-[rgb(var(--ink)/0.12)] flex-shrink-0"
        style={{ width: size * 0.5, height: size * 0.5 }}
      />
    );
  }

  // …or a text chip for non-country / unmapped codes (WRD, REP, UNI, …).
  return (
    <span
      aria-label={countryCode}
      title={countryCode}
      className="inline-flex items-center justify-center rounded-sm bg-[rgb(var(--ink)/0.07)] border border-[rgb(var(--ink)/0.10)] text-[8px] font-bold tracking-[0.04em] text-muted font-tight flex-shrink-0 px-1"
      style={{ height: size, minWidth: size * 1.4 }}
    >
      {countryCode}
    </span>
  );
}
