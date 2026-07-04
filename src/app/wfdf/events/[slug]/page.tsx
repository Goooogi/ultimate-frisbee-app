// /wfdf/events/[slug] — a single WFDF Worlds event.
// Server-fetches the event (divisions, teams, games) and hands it to the
// client WfdfEventDetail, which tabs by division and shows standings + games.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getEvent } from '@/lib/wfdf/data';
import { WfdfEventDetail } from '@/components/wfdf/wfdf-event-detail';

export const revalidate = 120;

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ev = await getEvent(params.slug).catch(() => null);
  if (!ev) return { title: 'Event not found · The Layout' };
  return { title: `${ev.name} · WFDF · The Layout` };
}

function fmtDates(start: string | null, end: string | null): string | undefined {
  if (!start) return undefined;
  const s = new Date(start + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const startStr = s.toLocaleDateString('en-US', opts);
  if (!end || end === start) return `${startStr}, ${s.getUTCFullYear()}`;
  const e = new Date(end + 'T00:00:00Z');
  return `${startStr} – ${e.toLocaleDateString('en-US', opts)}, ${e.getUTCFullYear()}`;
}

export default async function WfdfEventPage({ params }: Props) {
  const ev = await getEvent(params.slug);
  if (!ev) notFound();

  const subParts = [fmtDates(ev.startDate, ev.endDate), ev.location].filter(Boolean).join(' · ');

  return (
    <PageShell
      title={ev.name}
      eyebrow={`WFDF · ${ev.isNationalTeams ? 'National Teams' : 'Club'}`}
      subtitle={subParts || undefined}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'WFDF', href: '/wfdf/events' },
        { label: ev.name },
      ]}
    >
      <WfdfEventDetail event={ev} />
    </PageShell>
  );
}
