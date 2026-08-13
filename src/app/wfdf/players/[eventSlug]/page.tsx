// /wfdf/players/[eventSlug] — participating players for a single WFDF event.
// The Players hub's event cards land here (not the event overview), grouped
// by team, each name linking to the by-name resolver.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getEventPlayers } from '@/lib/wfdf/data';
import { WfdfEventPlayers } from '@/components/wfdf/wfdf-event-players';

export const revalidate = 300;

// SSG mode with on-demand paths — see /wfdf/events/[slug]. Without this
// export the revalidate above never engages and every hit is request-rendered.
export function generateStaticParams(): { eventSlug: string }[] {
  return [];
}

interface Props {
  params: { eventSlug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ev = await getEventPlayers(params.eventSlug).catch(() => null);
  if (!ev) return { title: 'Event not found · The Layout' };
  return { title: `${ev.name} Players · WFDF · The Layout` };
}

export default async function WfdfEventPlayersPage({ params }: Props) {
  const ev = await getEventPlayers(params.eventSlug);
  if (!ev) notFound();

  return (
    <PageShell
      title={`${ev.name} Players`}
      eyebrow="WFDF · Rosters"
      subtitle={`${ev.totalPlayers} named roster players.`}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'WFDF', href: '/wfdf/events' },
        { label: 'Players', href: '/wfdf/players' },
        { label: ev.name },
      ]}
    >
      <WfdfEventPlayers event={ev} />
    </PageShell>
  );
}
