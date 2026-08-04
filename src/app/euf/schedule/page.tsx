// /euf/schedule — EUCS Schedule: one event's games, grouped by day.
//
// This surface only became possible once the dates were backfilled (all 1,632
// games now carry scheduled_at; see the vault's "EUF EUCS Pipeline" note). It
// completes the Scores/Schedule/Teams/Players set that USAU has.
//
// Note it reads as a date-grouped RESULTS archive more than a fixture list —
// almost every EUCS game in the DB has already been played. That's the source's
// state, not a gap here: the same view will show fixtures whenever an
// in-progress 2026 event is re-ingested ahead of play.

import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getEventSchedule, listScheduleEvents } from '@/lib/euf/data';
import { eufDateRange } from '@/lib/euf/format-date';
import { EufSchedule } from '@/components/euf/euf-schedule';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'EUCS Schedule · European Ultimate · The Layout',
  description:
    'Day-by-day schedule and results for every European Ultimate Club Season event.',
};

interface Props {
  searchParams: { event?: string };
}

export default async function EufSchedulePage({ searchParams }: Props) {
  const events = await listScheduleEvents().catch(() => []);

  if (events.length === 0) {
    return (
      <PageShell
        title="EUCS Schedule"
        eyebrow="EUF · Club Season"
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'EUCS', href: '/euf/events' },
          { label: 'Schedule' },
        ]}
      >
        <div className="rounded-card-lg bg-surface shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">No scheduled events available yet.</p>
        </div>
      </PageShell>
    );
  }

  // listScheduleEvents() is newest-first, so the default is the most recent
  // dated event. An unknown ?event= falls back to it rather than 404ing.
  const active = events.find((e) => e.slug === searchParams.event) ?? events[0];
  const days = await getEventSchedule(active.slug).catch(() => []);
  const range = eufDateRange(active.startDate, active.endDate);

  return (
    <PageShell
      title="EUCS Schedule"
      eyebrow="EUF · Club Season"
      subtitle={`${active.name}${range ? ` · ${range}` : ''}`}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'EUCS', href: '/euf/events' },
        { label: 'Schedule' },
      ]}
    >
      <EufSchedule events={events} activeSlug={active.slug} days={days} />
    </PageShell>
  );
}
