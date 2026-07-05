// IOC / WFDF 3-letter country code → ISO-3166-1 alpha-2, for rendering emoji
// flags on WFDF teams.
//
// WFDF tags teams with Olympic-style (IOC) codes, NOT ISO — e.g. GER (not DEU),
// SUI (not CHE), NED (not NLD), RSA (not ZAF). Emoji flags are built from the
// ISO-2 code's two regional-indicator characters, so we map here first. Codes
// with no real country (WRD=World, REP/UNI=placeholders) map to null → the
// caller falls back to a text chip.
//
// The map covers every distinct country_code currently in wfdf_teams (69 as of
// 2026-07). Add new codes here as more events are ingested.

const IOC_TO_ISO2: Record<string, string> = {
  ARG: 'AR', AUS: 'AU', AUT: 'AT', BEL: 'BE', BRU: 'BN', CAN: 'CA',
  CHI: 'CL', // IOC CHI = Chile
  CHN: 'CN', COD: 'CD', COL: 'CO',
  COS: 'CR', // Costa Rica
  CZE: 'CZ', DEN: 'DK', DOM: 'DO', EGY: 'EG', ESP: 'ES', EST: 'EE',
  FIN: 'FI', FRA: 'FR', GBR: 'GB', GER: 'DE', GUA: 'GT', GUM: 'GU',
  HKG: 'HK', HON: 'HN', HUN: 'HU',
  INA: 'ID', // Indonesia
  IND: 'IN', IRL: 'IE', ISR: 'IL', ITA: 'IT', JPN: 'JP', KEN: 'KE',
  KOR: 'KR', KUW: 'KW', LAT: 'LV', LBN: 'LB', LTU: 'LT',
  MAL: 'ML', // Mali
  MAS: 'MY', // Malaysia
  MEX: 'MX', NED: 'NL', NGR: 'NG', NZL: 'NZ', PAN: 'PA',
  PEO: 'PE', // Peru (WFDF variant)
  PHI: 'PH', POL: 'PL', POR: 'PT', QAT: 'QA',
  RSA: 'ZA', // South Africa
  SGP: 'SG', SUI: 'CH', SVK: 'SK', SWE: 'SE', TAN: 'TZ', THA: 'TH',
  TPE: 'TW', // Chinese Taipei → Taiwan flag
  TUR: 'TR', UAE: 'AE', UGA: 'UG', UKR: 'UA', URU: 'UY', USA: 'US',
  VEN: 'VE', VIR: 'VI',
  // Non-country / placeholder codes → null (text-chip fallback):
  // WRD (World), REP, UNI
};

/**
 * Convert a WFDF/IOC 3-letter country code to an emoji flag, or null when the
 * code isn't a real single country (caller should fall back to a text chip).
 */
export function countryCodeToFlagEmoji(code: string | null | undefined): string | null {
  if (!code) return null;
  const iso2 = IOC_TO_ISO2[code.toUpperCase()];
  if (!iso2) return null;
  // Each ISO-2 letter maps to a Regional Indicator Symbol (U+1F1E6 = 'A').
  const A = 0x1f1e6;
  const chars = [...iso2].map((c) => String.fromCodePoint(A + (c.charCodeAt(0) - 65)));
  return chars.join('');
}
