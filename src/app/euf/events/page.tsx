// /euf/events — EUCS event browser (the league's landing page).
//
// EUF is event-centric like WFDF: each EUCS stop (EUCF, E2CF, Elite Invite,
// Spring/Summer Tour) is its own tournament. Pick one for standings and games.
//
// Header shape matches the USAU results feed (UsauFeed): eyebrow, big display
// title, controls row — built from PageShell's own eyebrow/title/controls
// slots rather than a second header, so there's exactly one h1 on the page.
// The season eyebrow text can't live here (it depends on client-only
// ?season=), so it stays static ("EUCS · Club Season") and the season itself
// reads off the EufSeasonSelect pill in `controls` instead of duplicated text.
//
// `controls` is a Client Component (reads ?season=) wrapped in its own
// Suspense boundary — this Server Component never touches searchParams
// itself, keeping the route ISR-cacheable (App Health Rule 3: no per-request
// work on a heavily-crawled public route).

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { listEvents } from '@/lib/euf/data';
import { EufEventsBody } from '@/components/euf/euf-events-body';
import { EufSeasonSelect } from '@/components/euf/euf-season-select';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'EUCS · European Ultimate · The Layout',
  description:
    'European Ultimate Club Season — EUCF, Elite Invite, and Tour results, standings, and rosters.',
};

export default async function EufEventsPage() {
  const events = await listEvents().catch(() => []);
  // Newest first — listEvents() already orders year DESC.
  const years = [...new Set(events.map((e) => e.year))];

  return (
    <PageShell
      eyebrow="EUF · Club Season"
      title="Events"
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'EUCS' }]}
      controls={
        years.length > 0 ? (
          <Suspense fallback={null}>
            <EufSeasonSelect years={years} />
          </Suspense>
        ) : undefined
      }
    >
      <Suspense fallback={null}>
        <EufEventsBody events={events} years={years} />
      </Suspense>
    </PageShell>
  );
}
