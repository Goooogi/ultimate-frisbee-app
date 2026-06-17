// USAU Triple Crown Tour "flight" classification for tournaments.
//
// IMPORTANT — what "flight" actually is on USAU's side:
// USAU defines flights (Pro/Elite/Select/Classic) as a season-long TEAM tier
// based on the prior year's Nationals placement, NOT as a property of a
// tournament. USAU does not publish a scrapeable "this tournament = Pro Flight"
// field anywhere. So this classification is curated by us.
//
// WHY NAME-BASED, NOT SLUG-BASED:
// Slugs change year to year (e.g. "tct-pro-championships-2021" →
// "2025-usau-pro-championships" → "2026-Pro-Championships"). The *names*, by
// contrast, keep the meaningful keywords stable even as surrounding text drifts
// ("TCT Pro Championships 2021", "2025 USAU Pro Championships", "2026 Pro
// Championships" all contain "pro championship"). So we classify by matching
// normalized keywords in the event NAME via ordered rules — this auto-tags both
// historical and future events with no per-year maintenance.
//
// To adjust: edit FLIGHT_RULES below. Rules are evaluated top-to-bottom; the
// FIRST match wins, so order matters (e.g. "U.S. Open" must be checked before
// the generic "Club Championships" rule, since the US Open is also titled
// "Club Championships").

export const FLIGHTS = [
  'triple-crown',
  'pro',
  'elite',
  'select',
  'classic',
] as const;

export type Flight = (typeof FLIGHTS)[number];

export const FLIGHT_LABELS: Record<Flight, string> = {
  'triple-crown': 'Triple Crown',
  pro: 'Pro Flight',
  elite: 'Elite Flight',
  select: 'Select Flight',
  classic: 'Classic Flight',
};

/** Lowercase + strip punctuation so "U.S. Open", "US Open", "U. S. Open" all
 *  collapse to the same token stream ("us open"). */
function normalizeEventName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,()\-/&]/g, ' ') // punctuation → space (handles "U.S.", "Pro-Elite", "(ICC)")
    .replace(/\s+/g, ' ')
    .trim();
}

interface FlightRule {
  flight: Flight;
  /** All of these normalized substrings must be present (AND). */
  all?: string[];
  /** At least one of these normalized substrings must be present (OR). */
  any?: string[];
  /** None of these may be present (NOT) — used to disambiguate look-alikes. */
  none?: string[];
}

// Ordered: first match wins. Keywords are matched against the NORMALIZED name
// (lowercased, punctuation→spaces), so write them that way.
//
// Triple Crown Tour (the three crown jewels) per Hunter:
//   US Open, Pro Championships, Club Nationals.
const FLIGHT_RULES: FlightRule[] = [
  // ── Triple Crown (the three marquee championships) ──
  // US Open — titled "...Club Championships" historically, so it MUST come
  // before the generic Nationals rule. "open" is the stable distinguishing word.
  { flight: 'triple-crown', any: ['us open', 'u s open'] },
  // Club Nationals — renamed from "Club Championships" → "Club Nationals" in
  // 2025. Match either, but exclude US Open (already handled above) and the
  // separate WORLD club championship (WUCC) which is not a TCT event.
  {
    flight: 'triple-crown',
    all: ['club'],
    any: ['nationals', 'championship'],
    none: ['open', 'world', 'wucc', 'regional', 'sectional', 'college'],
  },
  // Pro Championships (the season-ending TCT pro event).
  { flight: 'triple-crown', all: ['pro', 'championship'] },

  // ── Regular-season flight events ──
  // Pro-Elite Challenge → counts as a Pro Flight event.
  { flight: 'pro', any: ['pro elite challenge', 'pro elite plus'] },
  // Elite-Select Challenge → Elite Flight event.
  { flight: 'elite', any: ['elite select challenge'] },
  // Select Flight Invite (a.k.a. "Select Flight East/West").
  { flight: 'select', any: ['select flight'] },
];

/** Classify a tournament by its NAME using the ordered keyword rules.
 *  Returns null when no rule matches (unclassified → excluded by a flight filter). */
export function flightForName(name: string | null | undefined): Flight | null {
  if (!name) return null;
  const n = normalizeEventName(name);
  for (const rule of FLIGHT_RULES) {
    if (rule.all && !rule.all.every((kw) => n.includes(kw))) continue;
    if (rule.any && !rule.any.some((kw) => n.includes(kw))) continue;
    if (rule.none && rule.none.some((kw) => n.includes(kw))) continue;
    return rule.flight;
  }
  return null;
}

/** Parse a raw ?flight= value into a known Flight, or null if absent/invalid. */
export function parseFlightParam(raw: string | null | undefined): Flight | null {
  if (!raw) return null;
  const norm = raw.toLowerCase();
  return (FLIGHTS as readonly string[]).includes(norm) ? (norm as Flight) : null;
}
