// Country flag for EUF/EUCS teams. EUCS is a CLUB league, but Ultiorganizer
// tags every club with its country, and European club ultimate is strongly
// nation-identified — so the country flag is the natural team mark.
//
// Mirrors WfdfFlag, but EUCS publishes country NAMES ("Great Britain") rather
// than IOC codes, so the mapping lives in lib/euf/country-flags.ts. Unknown
// names fall back to a compact text chip so nothing renders blank.

import { flagEmoji, countryChip } from '@/lib/euf/country-flags';

export function EufFlag({
  countryName,
  size = 16,
}: {
  countryName: string | null;
  size?: number;
}) {
  const emoji = flagEmoji(countryName);

  if (emoji) {
    return (
      <span
        role="img"
        aria-label={countryName ?? 'flag'}
        title={countryName ?? undefined}
        className="inline-flex items-center justify-center flex-shrink-0 leading-none select-none"
        style={{ fontSize: size * 1.15, width: size * 1.4, height: size }}
      >
        {emoji}
      </span>
    );
  }

  if (!countryName) {
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
      aria-label={countryName}
      title={countryName}
      className="inline-flex items-center justify-center rounded-sm bg-[rgb(var(--ink)/0.07)] border border-[rgb(var(--ink)/0.10)] text-[8px] font-bold tracking-[0.04em] text-muted font-tight flex-shrink-0 px-1"
      style={{ height: size, minWidth: size * 1.4 }}
    >
      {countryChip(countryName)}
    </span>
  );
}
