// /euf/scores — EUCS Scores hub. Like WFDF, EUCS has no season-long rolling
// feed: each stop (EUCF, E2CF, Elite Invite, Tour) is a self-contained
// tournament, so this lists every event with its dates and game/team counts,
// and each card opens that event's standings and games.
//
// Grouped by YEAR (newest first) so the 32 events read as four seasons rather
// than one undifferentiated grid — the same shape the USAU scores tab uses.
// Day-by-day games live on /euf/schedule.

import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { listEventScoreSummaries, type EufEventScoreSummary } from '@/lib/euf/data';
import { eufDateRange } from '@/lib/euf/format-date';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'EUCS Scores · European Ultimate · The Layout',
  description: 'Results from every European Ultimate Club Season event.',
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

export default async function EufScoresPage() {
  const events = await listEventScoreSummaries().catch(() => []);

  // Group by year, newest first. listEventScoreSummaries() is already ordered
  // year DESC, so insertion order carries through.
  const byYear = new Map<number, EufEventScoreSummary[]>();
  for (const e of events) {
    if (!byYear.has(e.year)) byYear.set(e.year, []);
    byYear.get(e.year)!.push(e);
  }
  // Within a year, run the events in date order (newest first) so a season
  // reads finals-back. Undated stops sort last.
  for (const list of byYear.values()) {
    list.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  return (
    <PageShell
      title="EUCS Scores"
      eyebrow="EUF · Results"
      subtitle="Pick an event for full standings and every game. Each EUCS stop is a self-contained tournament."
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'EUCS', href: '/euf/events' },
        { label: 'Scores' },
      ]}
    >
      {events.length === 0 ? (
        <div className="rounded-card-lg bg-surface shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">No results available yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {[...byYear.entries()].map(([year, list]) => (
            <section key={year}>
              <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-ink font-tight pb-2 mb-3 border-b border-hairline">
                {year}
                <span className="ml-2 text-muted">
                  {list.length} {list.length === 1 ? 'event' : 'events'}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((e) => (
                  <EventCard key={e.slug} event={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function EventCard({ event: e }: { event: EufEventScoreSummary }) {
  const dates = eufDateRange(e.startDate, e.endDate);
  return (
    <Link
      href={`/euf/events/${e.slug}`}
      className={[
        'group flex flex-col gap-3 bg-surface rounded-card shadow-card p-4',
        'no-underline transition-shadow hover:shadow-lift cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
          {KIND_LABEL[e.kind] ?? 'Event'}
        </div>
        <div className="text-[15px] font-semibold text-ink font-tight truncate">{e.name}</div>
        {/* Dates lead the meta line — they're the fastest way to tell two
            same-named tour stops apart. */}
        <div className="text-[12px] text-muted font-tight truncate">
          {[dates || null, e.location].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted font-tight tabular-nums">
          {e.gameCount} {e.gameCount === 1 ? 'game' : 'games'} · {e.teamCount} teams
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
  );
}
