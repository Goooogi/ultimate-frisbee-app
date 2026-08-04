// /euf/scores — EUCS Scores hub. Like WFDF, EUCS has no season-long rolling
// feed: each stop (EUCF, E2CF, Elite Invite, Tour) is a self-contained
// tournament, so this lists every event with its game/team counts and each card
// opens that event's standings and games.
//
// There is deliberately no /euf/schedule — the source publishes a time-of-day
// with no date (euf_games.scheduled_at is entirely NULL, euf_events has no
// start_date), and every game already has a result.

import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { listEventScoreSummaries } from '@/lib/euf/data';

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((e) => (
            <Link
              key={e.slug}
              href={`/euf/events/${e.slug}`}
              className={[
                'group flex flex-col gap-3 bg-surface rounded-card shadow-card p-4',
                'no-underline transition-shadow hover:shadow-lift cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink/[0.06] text-[10px] font-bold text-ink font-tight flex-shrink-0">
                  {e.year}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
                    {KIND_LABEL[e.kind] ?? 'Event'}
                  </div>
                  <div className="text-[15px] font-semibold text-ink font-tight truncate">
                    {e.name}
                  </div>
                  {e.location && (
                    <div className="text-[12px] text-muted font-tight truncate">{e.location}</div>
                  )}
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
          ))}
        </div>
      )}
    </PageShell>
  );
}
