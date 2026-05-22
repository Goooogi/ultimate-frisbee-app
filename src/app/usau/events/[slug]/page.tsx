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
  const eyebrowParts = [event.competitionLevel, event.season]
    .filter(Boolean)
    .join(' · ');

  return (
    <PageShell title={event.name} eyebrow={`USAU${eyebrowParts ? ` · ${eyebrowParts}` : ''}`} subtitle={subtitle ?? undefined}>
      {/* Quick stats */}
      <div className="flex flex-wrap items-center gap-2 mb-8 pb-6 border-b border-hairline">
        <Chip label="Teams" value={event.teams.length} />
        <Chip label="Games" value={event.games.length} />
        {event.state && <Chip label="State" value={event.state} />}
      </div>

      <UsauEventDetail event={event} />
    </PageShell>
  );
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inline-flex items-baseline gap-2 px-3 py-2 rounded-md bg-surface border border-border">
      <span className="tabular text-[18px] font-bold font-tight leading-none tracking-[-0.02em] text-ink">
        {value}
      </span>
      <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
        {label}
      </span>
    </div>
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
