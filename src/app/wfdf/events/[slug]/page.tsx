// /wfdf/events/[slug] — a single WFDF Worlds event.
// Server-fetches the event (divisions, teams, games) and hands it to the
// client WfdfEventDetail, which tabs by division and shows standings + games.

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getEvent } from '@/lib/wfdf/data';
import { WfdfEventDetail } from '@/components/wfdf/wfdf-event-detail';
import { WfdfEventLogo } from '@/components/wfdf/wfdf-event-logo';

export const revalidate = 120;

// SSG mode with on-demand paths — see /players/[id]. Without this export the
// revalidate above never engages and every hit is request-rendered.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

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

  const dates = fmtDates(ev.startDate, ev.endDate);

  return (
    <>
      {/* Preload the header mark so it lands with the HTML instead of after
          hydration (same hint the events grid uses for its logo batch). */}
      {ev.logoUrl && <link rel="preload" as="image" href={ev.logoUrl} />}
      <PageShell
      title={ev.name}
      eyebrow={`WFDF · ${ev.isNationalTeams ? 'National Teams' : 'Club'}`}
      // Logo sits left of the big title; dates over location right-align on the
      // same row (mirrors the mobile app header — replaces the old sticky
      // event bar, which floated over content on scroll).
      titleLeft={<WfdfEventLogo logoUrl={ev.logoUrl} year={ev.year} variant="hero" />}
      controls={
        (dates || ev.location) && (
          <div className="flex flex-col items-end text-right font-tight leading-tight">
            {dates && <span className="text-[12px] lg:text-[14px] font-semibold text-ink">{dates}</span>}
            {ev.location && (
              <span className="text-[11px] lg:text-[13px] text-muted">{ev.location}</span>
            )}
          </div>
        )
      }
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'WFDF', href: '/wfdf/events' },
        { label: ev.name },
      ]}
    >
      {/* Suspense is load-bearing: the detail reads useSearchParams (?div/?tab
          view state), which otherwise bails the whole static render to CSR. */}
      <Suspense fallback={null}>
        <WfdfEventDetail event={ev} />
      </Suspense>
      </PageShell>
    </>
  );
}
