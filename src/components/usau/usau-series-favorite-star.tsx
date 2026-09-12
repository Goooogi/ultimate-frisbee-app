'use client';

// Star for a merged USAU series event. The star is stored on the member row of
// the division being viewed (?div=) — the same row a fan starred before the
// merge, so push milestones still follow the division they chose. It shows
// filled when ANY member is starred and unstarring clears them all. Reads
// useDivision, so render inside <Suspense> (the event route stays ISR).

import { EventFavoriteStar } from '@/components/favorites/event-favorite-star';
import { useDivision } from '@/lib/use-division';
import type { FavoriteEvent } from '@/lib/favorites/data';
import type { UsauEventMember } from '@/lib/usau/data';

export function UsauSeriesFavoriteStar({
  event,
  members,
}: {
  event: FavoriteEvent;
  members: UsauEventMember[];
}) {
  const [division] = useDivision();
  // Same fallback as the division tabs: the requested division, else the first.
  const member = members.find((m) => m.division === division) ?? members[0];
  return (
    <EventFavoriteStar
      event={{ ...event, eventId: member?.id ?? event.eventId }}
      memberIds={members.map((m) => m.id)}
    />
  );
}
