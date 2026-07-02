// Build a USAU event link that preserves the viewing division.
//
// The event page (/usau/events/[slug]) reads ?div=men|women|mixed to pick which
// gender's pools/bracket to show, defaulting to Men. So a link reached from a
// Mixed team or a Mixed player's stint must carry ?div=mixed, or it'd wrongly
// open the Men's bracket. Default (Men) is omitted to keep URLs clean.

const VALID = new Set(['Men', 'Women', 'Mixed']);

export function usauEventHref(slug: string, genderDivision: string | null | undefined): string {
  const base = `/usau/events/${slug}`;
  if (!genderDivision || !VALID.has(genderDivision) || genderDivision === 'Men') return base;
  return `${base}?div=${genderDivision.toLowerCase()}`;
}
