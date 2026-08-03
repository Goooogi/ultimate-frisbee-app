// /euf/events/[slug] — a single EUCS event: standings + games, tabbed by division.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getEvent, getStandings, listEventGames } from '@/lib/euf/data';
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
      subtitle={ev.location ?? undefined}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'EUCS', href: '/euf/events' },
        { label: ev.name },
      ]}
    >
      <div className="mb-4">
        <Link
          href={`/euf/events/${ev.slug}/leaders`}
          className="text-[11px] font-bold tracking-[0.06em] uppercase font-tight text-accent no-underline hover:underline"
        >
          Scoring leaders →
        </Link>
      </div>
      <EufEventDetail divisions={ev.divisions} standings={standings} games={games} />
    </PageShell>
  );
}
