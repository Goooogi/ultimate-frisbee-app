// A compact country badge for WFDF teams. WFDF is nation-oriented (even club
// events tag a country), so this shows the 3-letter country code in a tinted
// chip — self-contained (no external flag-image dependency, which would be
// blocked by CSP / vary by event origin). Falls back to a neutral dot when the
// country is unknown.

export function WfdfFlag({
  countryCode,
  size = 16,
}: {
  /** Present for API symmetry with the source's flagfile; not used (we render
   *  the country code, not an image). */
  flagFile?: string | null;
  countryCode: string | null;
  size?: number;
}) {
  if (!countryCode) {
    return (
      <span
        aria-hidden="true"
        className="inline-block rounded-full bg-[rgb(var(--ink)/0.12)] flex-shrink-0"
        style={{ width: size * 0.5, height: size * 0.5 }}
      />
    );
  }
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
