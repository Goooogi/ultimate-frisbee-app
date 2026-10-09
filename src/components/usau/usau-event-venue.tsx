'use client';

// Venue pill for the USAU event header — sits in the controls row beside the
// "USAU site" link and star (Hunter, 2026-10-07: one row up from the body).
// A merged series event's divisions can play at different sites, so it follows
// the division being viewed (?div=), like UsauMemberSourceLink. Client-side so
// the event route never reads searchParams and stays ISR; render inside
// <Suspense>.

import { useDivision } from '@/lib/use-division';

/** Venue name, derived from the field names on the event's games. Non-interactive
 *  (it's a fact, not a link). Only renders when we resolved a venue; roughly
 *  half of events record only a bare field number, and the header subtitle
 *  already carries the city/state. */
export function EventVenue({ venue }: { venue: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold tracking-[0.14em] uppercase font-tight bg-ink/5 text-muted">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 9s3-2.9 3-5.1A3 3 0 0 0 2 3.9C2 6.1 5 9 5 9Z" />
        <circle cx="5" cy="3.9" r="1.05" />
      </svg>
      {venue}
    </span>
  );
}

export function UsauEventVenue({
  venue,
  members,
}: {
  venue: string | null;
  members: { division: string | null; venue: string | null }[];
}) {
  const [division] = useDivision();
  // Never borrow a sibling division's venue: a merged event's event-level venue
  // is only set when every member with a venue agrees. Same fallback as the
  // division tabs: the requested division, else the first one.
  const merged = members.length > 0 && members.every((m) => m.division != null);
  const shown = merged ? ((members.find((m) => m.division === division) ?? members[0])?.venue ?? null) : venue;
  return shown ? <EventVenue venue={shown} /> : null;
}
