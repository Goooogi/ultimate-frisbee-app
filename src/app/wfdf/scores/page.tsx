// /wfdf/scores — WFDF Scores hub. WFDF has no season-long feed, so this lists
// every event with its game counts + divisions; each card opens the event's
// full standings and games. Serves as both the "Scores" and "Schedule" surface
// (a Worlds event is a fixed bracket, not a rolling fixture list).

import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { listEventScoreSummaries } from '@/lib/wfdf/data';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'WFDF Scores · The Layout',
  description: 'Results from every WFDF World Championship event.',
};

function fmtDates(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const startStr = s.toLocaleDateString('en-US', opts);
  if (!end || end === start) return `${startStr}, ${s.getUTCFullYear()}`;
  const e = new Date(end + 'T00:00:00Z');
  return `${startStr} – ${e.toLocaleDateString('en-US', opts)}, ${e.getUTCFullYear()}`;
}

export default async function WfdfScoresPage() {
  const events = await listEventScoreSummaries().catch(() => []);

  return (
    <PageShell
      title="WFDF Scores"
      eyebrow="WFDF · Results"
      subtitle="Pick an event for full standings and every game. Each World Championship is a self-contained bracket."
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'WFDF', href: '/wfdf/events' },
        { label: 'Scores' },
      ]}
    >
      {events.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="text-muted font-tight text-[14px]">No results available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {events.map((e) => {
            const dates = fmtDates(e.startDate, e.endDate);
            const upcoming = e.completedCount === 0 && e.gameCount > 0;
            return (
              <Link
                key={e.eventSlug}
                href={`/wfdf/events/${e.eventSlug}`}
                className={[
                  'group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4',
                  'no-underline hover:border-ink transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-ink font-tight tracking-[-0.02em] leading-tight truncate">
                      {e.eventName}
                    </div>
                    {dates && (
                      <div className="text-[11px] text-muted font-tight mt-0.5">{dates}</div>
                    )}
                  </div>
                  <span
                    className={[
                      'text-[9px] font-bold tracking-[0.14em] uppercase font-tight px-2 py-1 rounded flex-shrink-0',
                      upcoming
                        ? 'text-accent bg-[rgb(var(--accent)/0.12)]'
                        : 'text-faint bg-[rgb(var(--ink)/0.05)]',
                    ].join(' ')}
                  >
                    {upcoming ? 'Upcoming' : 'Final'}
                  </span>
                </div>

                {e.divisions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {e.divisions.map((d) => (
                      <span
                        key={d}
                        className="text-[10px] font-tight text-muted px-2 py-0.5 rounded bg-[rgb(var(--ink)/0.04)] border border-hairline"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] font-tight text-faint mt-auto pt-2 border-t border-hairline">
                  <span className="tabular">
                    {upcoming
                      ? `${e.gameCount} games scheduled`
                      : `${e.completedCount} of ${e.gameCount} games played`}
                  </span>
                  <span className="text-ink group-hover:text-accent transition-colors">View →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
