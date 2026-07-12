// /usau/events/[slug] — single event page.
//
// Shows two views of the event's games:
//   - Pools section: teams grouped by pool, sorted by seed within pool.
//   - Bracket section: games grouped by round + bracket name.
//
// Both lists ultimately surface the same data we ingested from USAU's
// schedule page. We don't have W-L records aggregated yet — that's a
// future enhancement (compute from usau_games rows).

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getEvent, type UsauEventSummary } from '@/lib/usau/data';
import { UsauEventDetail } from '@/components/usau/usau-event-detail';
import { FLIGHT_LABELS } from '@/lib/usau/flights';

export const revalidate = 60;

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEvent(params.slug).catch(() => null);
  if (!event) return { title: 'Event not found · The Layout' };
  return { title: `${event.name} · USAU · The Layout` };
}

export default async function UsauEventPage({ params }: Props) {
  const event = await getEvent(params.slug);
  if (!event) notFound();

  const subtitle = formatSubtitle(event);
  const eyebrowParts = [
    event.competitionLevel,
    event.season,
    event.flight ? FLIGHT_LABELS[event.flight] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PageShell
      title={event.name}
      eyebrow={`USAU${eyebrowParts ? ` · ${eyebrowParts}` : ''}`}
      subtitle={subtitle ?? undefined}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'The Games', href: '/scores?league=usau' },
        { label: event.name },
      ]}
    >
      {/* The "View on USAU" link renders inside UsauEventDetail, sharing a
          row with the Level/Division selects (right-aligned) so mobile gets
          one compact header row instead of stacked controls. */}
      <UsauEventDetail event={event} />
    </PageShell>
  );
}

function formatSubtitle(event: UsauEventSummary): string | null {
  const parts: string[] = [];
  if (event.startDate) {
    const start = new Date(event.startDate + 'T00:00:00');
    const sl = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (event.endDate && event.endDate !== event.startDate) {
      const end = new Date(event.endDate + 'T00:00:00');
      const el = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      parts.push(`${sl} – ${el}`);
    } else {
      parts.push(sl);
    }
  }
  const place = [event.city, event.state].filter(Boolean).join(', ');
  if (place) parts.push(place);
  return parts.length > 0 ? parts.join(' · ') : null;
}
