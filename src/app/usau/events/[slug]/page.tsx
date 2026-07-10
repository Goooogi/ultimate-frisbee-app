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
      controls={event.url ? <UsauLink url={event.url} name={event.name} /> : undefined}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'The Games', href: '/scores?league=usau' },
        { label: event.name },
      ]}
    >
      <UsauEventDetail event={event} />
    </PageShell>
  );
}

/** External link back to the canonical USAU event page. */
function UsauLink({ url, name }: { url: string; name: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${name} on USA Ultimate`}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold tracking-[0.14em] uppercase font-tight bg-ink/5 text-ink hover:bg-ink/10 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent no-underline"
    >
      View on USAU
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 1.5h5.5V7" />
        <path d="M8.5 1.5L3.5 6.5" />
        <path d="M7 8.5H1.5V3" />
      </svg>
    </a>
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
