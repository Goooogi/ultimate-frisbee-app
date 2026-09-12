'use client';

// "USAU site" link for a merged series event. A merged Sectional/Regional has
// no single USAU page — each division is its own USAU event — so the link
// follows the division being viewed (?div=). Client-side only so the event
// route never reads searchParams and stays ISR; render inside <Suspense>.

import { SourceLink } from '@/components/source-link';
import { useDivision } from '@/lib/use-division';
import type { UsauEventMember } from '@/lib/usau/data';

export function UsauMemberSourceLink({
  members,
  eventName,
}: {
  members: UsauEventMember[];
  eventName: string;
}) {
  const [division] = useDivision();
  // Same fallback as the page's division tabs: the requested division, else
  // the first one that exists (members arrive in Men/Women/Mixed order).
  const member =
    members.find((m) => m.division === division && m.url) ?? members.find((m) => m.url) ?? null;
  return (
    <SourceLink
      href={member?.url ?? null}
      label="USAU site"
      ariaLabel={`View ${eventName}${member?.division ? ` (${member.division})` : ''} on USA Ultimate`}
    />
  );
}
