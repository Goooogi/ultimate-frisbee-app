// EUCS country NAME → ISO-3166-1 alpha-2, for rendering emoji flags on EUF teams.
//
// Unlike WFDF (which tags teams with IOC codes), Ultiorganizer publishes plain
// English country names — "Great Britain", "Czech Republic". We map the name
// directly; unknown names return null and the caller falls back to a text chip.
//
// Covers every distinct country_name currently in euf_teams. Add new names here
// as more events are ingested.

const NAME_TO_ISO2: Record<string, string> = {
  austria: 'AT',
  belgium: 'BE',
  'czech republic': 'CZ',
  czechia: 'CZ',
  denmark: 'DK',
  estonia: 'EE',
  finland: 'FI',
  france: 'FR',
  germany: 'DE',
  'great britain': 'GB',
  'united kingdom': 'GB',
  hungary: 'HU',
  ireland: 'IE',
  israel: 'IL',
  italy: 'IT',
  latvia: 'LV',
  lithuania: 'LT',
  luxembourg: 'LU',
  netherlands: 'NL',
  norway: 'NO',
  poland: 'PL',
  portugal: 'PT',
  romania: 'RO',
  russia: 'RU',
  serbia: 'RS',
  slovakia: 'SK',
  slovenia: 'SI',
  spain: 'ES',
  sweden: 'SE',
  switzerland: 'CH',
  turkey: 'TR',
  ukraine: 'UA',
};

/** Display-cased country names, derived from the map above so the two can't
 *  drift. Covers every country_name present in euf_teams (21 as of 2026-08-03)
 *  plus the rest of the European field we expect to see. Used by the avatar
 *  icon picker, which offers EUF clubs' country flags. */
export const EUF_COUNTRIES: readonly string[] = Object.keys(NAME_TO_ISO2)
  .map((k) => k.replace(/\b[a-z]/g, (c) => c.toUpperCase()))
  // "Czechia" and "United Kingdom" are aliases of names already in the list.
  .filter((n) => n !== 'Czechia' && n !== 'United Kingdom')
  .sort();

/** ISO-2 → regional-indicator emoji flag. */
export function flagEmoji(countryName: string | null | undefined): string | null {
  if (!countryName) return null;
  const iso = NAME_TO_ISO2[countryName.trim().toLowerCase()];
  if (!iso) return null;
  return String.fromCodePoint(
    ...[...iso].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65)),
  );
}

/** Short chip label when there's no flag (first 3 letters, uppercased). */
export function countryChip(countryName: string | null | undefined): string | null {
  if (!countryName) return null;
  return countryName.trim().slice(0, 3).toUpperCase();
}
