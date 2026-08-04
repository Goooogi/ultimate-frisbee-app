// /euf/events/[slug] — a single EUCS event: standings + games, tabbed by division.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getEvent, getStandings, listEventGames, type EufEventCard } from '@/lib/euf/data';
import { eufDateRange } from '@/lib/euf/format-date';
import { EufEventDetail } from '@/components/euf/euf-event-detail';

export const revalidate = 120;

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ev = await getEvent(params.slug).catch(() => null);
  if (!ev) return { title: 'Event not found · The Layout' };
  return { title: `${ev.name} · EUCS · The Layout` };
}

export default async function EufEventPage({ params }: Props) {
  const ev = await getEvent(params.slug);
  if (!ev) notFound();

  const [standings, games] = await Promise.all([
    getStandings(ev.slug).catch(() => []),
    listEventGames(ev.id).catch(() => []),
  ]);

  return (
    <PageShell
      title={ev.name}
      eyebrow="EUF · EUCS"
      subtitle={formatSubtitle(ev) ?? undefined}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'EUCS', href: '/euf/events' },
        { label: ev.name },
      ]}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={`/euf/events/${ev.slug}/leaders`}
          className="text-[11px] font-bold tracking-[0.06em] uppercase font-tight text-accent no-underline hover:underline"
        >
          Scoring leaders →
        </Link>
        <Link
          href={`/euf/schedule?event=${ev.slug}`}
          className="text-[11px] font-bold tracking-[0.06em] uppercase font-tight text-accent no-underline hover:underline"
        >
          Full schedule →
        </Link>
      </div>
      <EufEventDetail
        divisions={ev.divisions}
        standings={standings}
        games={games}
        sourceUrl={eufSourceUrl(ev)}
      />
    </PageShell>
  );
}

/** "Sep 19 – 21, 2025 · Wroclaw, Poland" — dates lead, same as the USAU event
 *  page. Falls back to location alone for the one dateless event (2026 Summer
 *  Tour Bordeaux: registered, not yet played). */
function formatSubtitle(ev: EufEventCard): string | null {
  const parts = [eufDateRange(ev.startDate, ev.endDate), ev.location].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Outbound link back to the Ultiorganizer schedule site for this event —
 *  mirrors USAU's "View on USAU". Null when either column is missing. */
function eufSourceUrl(ev: EufEventCard): string | null {
  if (!ev.sourceOrigin || !ev.seasonId) return null;
  return `${ev.sourceOrigin}/?view=games&season=${ev.seasonId}&filter=tournaments&group=all`;
}
