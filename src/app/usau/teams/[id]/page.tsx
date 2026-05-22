// /usau/teams/[id] — single USAU team page.
//
// Renders the team's full history: one accordion section per season, with
// that year's tournaments + roster. We deliberately union across the
// 5+ usau_teams rows that the scraper creates per franchise (one per
// season) so /usau/teams/{anyOfThemId} shows the same full history. See
// getTeam() in src/lib/usau/data.ts for the clustering logic.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { getTeam, type UsauTeamSummary } from '@/lib/usau/data';

export const revalidate = 60;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const team = await getTeam(params.id).catch(() => null);
  if (!team) return { title: 'Team not found · The Layout' };
  return { title: `${team.name} · USAU · The Layout` };
}

export default async function UsauTeamPage({ params }: Props) {
  const team = await getTeam(params.id);
  if (!team) notFound();

  const eyebrowParts = [team.competitionLevel, team.genderDivision, team.state]
    .filter(Boolean)
    .join(' · ');

  const totalEvents = team.seasons.reduce((s, y) => s + y.events.length, 0);
  const yearsCount = team.seasons.length;

  return (
    <PageShell title={team.name} eyebrow={`USAU${eyebrowParts ? ` · ${eyebrowParts}` : ''}`}>
      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-hairline">
        <SummaryChip label="Seasons" value={yearsCount} />
        <SummaryChip label="Events" value={totalEvents} />
      </div>

      {/* Season history */}
      <section aria-labelledby="history-heading">
        <h2
          id="history-heading"
          className="flex items-baseline justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-3 font-tight"
        >
          <span>History</span>
          <span className="text-faint normal-case tracking-[0.1em] text-[10px] font-semibold">
            {yearsCount} {yearsCount === 1 ? 'season' : 'seasons'}
          </span>
        </h2>

        {team.seasons.length === 0 ? (
          <div className="text-[12px] text-faint font-tight">No history recorded yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {team.seasons.map((s, idx) => (
              <SeasonCard key={s.season} season={s} defaultOpen={idx === 0} />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function SeasonCard({
  season,
  defaultOpen,
}: {
  season: UsauTeamSummary['seasons'][number];
  defaultOpen: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group bg-surface border border-border [&[open]]:border-ink transition-colors rounded-sm"
    >
      <summary
        className={[
          'list-none cursor-pointer select-none px-4 py-3.5 flex items-center gap-3',
          'hover:bg-surface-hi transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
        ].join(' ')}
      >
        <Caret />
        <span className="tabular text-[15px] font-bold font-tight text-ink w-[60px] flex-shrink-0">
          {season.season}
        </span>
        <span className="flex items-center gap-4 flex-1 text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
          <span>
            {season.events.length} {season.events.length === 1 ? 'event' : 'events'}
          </span>
          <span>
            {season.roster.length} {season.roster.length === 1 ? 'player' : 'players'}
          </span>
        </span>
      </summary>

      <div className="px-4 pt-2 pb-5 border-t border-hairline flex flex-col gap-5">
        {/* Events for this season */}
        {season.events.length > 0 && (
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-2 mt-1">
              Tournaments
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {season.events.map((event) => (
                <EventCard key={event.slug} event={event} />
              ))}
            </ul>
          </div>
        )}

        {/* Roster for this season */}
        {season.roster.length > 0 && (
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-2">
              Roster
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
              {season.roster.map((p) => (
                <li key={p.playerId} className="bg-surface">
                  <Link
                    href={`/players/${p.playerId}`}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hi transition-colors no-underline"
                  >
                    <span
                      aria-hidden="true"
                      className="tabular text-[12px] font-bold text-faint font-tight w-7 text-right"
                    >
                      {p.jerseyNumber ?? '—'}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px] font-semibold text-ink font-tight truncate">
                      {p.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {season.events.length === 0 && season.roster.length === 0 && (
          <div className="text-[12px] text-faint font-tight py-2">
            No tournaments or roster recorded for {season.season}.
          </div>
        )}
      </div>
    </details>
  );
}

function EventCard({
  event,
}: {
  event: UsauTeamSummary['seasons'][number]['events'][number];
}) {
  const date = event.startDate
    ? new Date(event.startDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  return (
    <li>
      <Link
        href={`/usau/events/${event.slug}`}
        className="block bg-bg border border-border rounded-md p-3.5 hover:border-ink transition-colors no-underline"
      >
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight truncate">
            {date ?? '—'}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {event.seed != null && (
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight">
                Seed {event.seed}
              </span>
            )}
            {event.finalPlacement != null && (
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-accent font-tight">
                #{event.finalPlacement}
              </span>
            )}
          </div>
        </div>
        <div className="font-display italic font-bold text-[17px] leading-tight tracking-[-0.02em] text-ink">
          {event.name}
        </div>
        {event.pool && (
          <div className="mt-1 text-[11px] text-muted font-tight">{event.pool}</div>
        )}
      </Link>
    </li>
  );
}

function SummaryChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inline-flex items-baseline gap-2 px-3 py-2 rounded-md bg-surface border border-border">
      <span className="tabular text-[18px] font-bold font-tight leading-none tracking-[-0.02em] text-ink">
        {value}
      </span>
      <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
        {label}
      </span>
    </div>
  );
}

function Caret() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted flex-shrink-0 transition-transform duration-150 group-open:rotate-90"
      aria-hidden="true"
    >
      <path d="M3 2l4 3-4 3" />
    </svg>
  );
}
