// /euf/events — EUCS event browser (the league's landing page).
//
// EUF is event-centric like WFDF: each EUCS stop (EUCF, E2CF, Elite Invite,
// Spring/Summer Tour) is its own tournament. Pick one for standings and games.

import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { listEvents, type EufEventCard } from '@/lib/euf/data';
import { eufDateRange } from '@/lib/euf/format-date';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'EUCS · European Ultimate · The Layout',
  description:
    'European Ultimate Club Season — EUCF, Elite Invite, and Tour results, standings, and rosters.',
};

const KIND_LABEL: Record<string, string> = {
  eucf: 'European Championship Finals',
  e2cf: 'Second-Tier Finals',
  elite_invite: 'Elite Invite',
  spring_tour: 'Spring Tour',
  summer_tour: 'Summer Tour',
  regional: 'Regional',
  other: 'Event',
};

/** Season sections, newest year first; within a year the newest event first.
 *  listEvents() is already ordered year DESC, so insertion order carries. */
function groupByYear(events: EufEventCard[]): Array<[number, EufEventCard[]]> {
  const byYear = new Map<number, EufEventCard[]>();
  for (const e of events) {
    if (!byYear.has(e.year)) byYear.set(e.year, []);
    byYear.get(e.year)!.push(e);
  }
  for (const list of byYear.values()) {
    list.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }
  return [...byYear.entries()];
}

export default async function EufEventsPage() {
  const events = await listEvents().catch(() => []);

  return (
    <PageShell
      title="European Ultimate"
      eyebrow="EUF · Club Season"
      subtitle="European Ultimate Club Season — pick an event for standings, games, and rosters."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'EUCS' }]}
    >
      {events.length === 0 ? (
        <div className="rounded-card-lg bg-surface shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">No EUCS events available yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groupByYear(events).map(([year, list]) => (
            <section key={year}>
              <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-ink font-tight pb-2 mb-3 border-b border-hairline">
                {year}
                <span className="ml-2 text-muted">
                  {list.length} {list.length === 1 ? 'event' : 'events'}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((e) => (
                  <Link
                    key={e.id}
                    href={`/euf/events/${e.slug}`}
                    className={[
                      'group flex flex-col gap-3 bg-surface rounded-card shadow-card p-4',
                      'transition-shadow hover:shadow-lift cursor-pointer no-underline',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
                        {KIND_LABEL[e.kind] ?? 'Event'}
                      </div>
                      <div className="text-[15px] font-semibold text-ink font-tight truncate">
                        {e.name}
                      </div>
                      {/* Dates lead — the fastest way to tell two same-named
                          tour stops apart. */}
                      <div className="text-[12px] text-muted font-tight truncate">
                        {[eufDateRange(e.startDate, e.endDate) || null, e.location]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-muted font-tight">
                        {e.teamCount} {e.teamCount === 1 ? 'team' : 'teams'}
                      </span>
                      {e.divisions.map((d) => (
                        <span
                          key={d}
                          className="text-[9px] font-bold tracking-[0.1em] uppercase text-muted font-tight px-1.5 py-0.5 rounded-full border border-hairline"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
