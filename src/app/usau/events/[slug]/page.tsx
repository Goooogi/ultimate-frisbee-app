// /usau/events/[slug] — single event page.
//
// Shows two views of the event's games:
//   - Pools section: teams grouped by pool, sorted by seed within pool.
//   - Bracket section: games grouped by round + bracket name.
//
// Both lists ultimately surface the same data we ingested from USAU's
// schedule page. We don't have W-L records aggregated yet — that's a
// future enhancement (compute from usau_games rows).

import { cache, Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { SourceLink } from '@/components/source-link';
import { loadUsauEvent, resolveUsauEvent, type UsauEventSummary } from '@/lib/usau/data';
import { usauEventHref } from '@/lib/usau/event-href';
import { usauToday } from '@/lib/today';
import { UsauMemberSourceLink } from '@/components/usau/usau-member-source-link';
import { UsauSeriesFavoriteStar } from '@/components/usau/usau-series-favorite-star';
import { findWorldsTwinSlug } from '@/lib/wfdf/data';
import { UsauEventDetail } from '@/components/usau/usau-event-detail';
import { EventFavoriteStar } from '@/components/favorites/event-favorite-star';
import { FLIGHT_LABELS } from '@/lib/usau/flights';
import { USAU_LEVELS, buildLeagueQs, type UsauLevel } from '@/lib/league';

// Stars only render for events that haven't fully wrapped — a star on a past
// event can never produce a notification (Push Notifications.md plan rule).
function isUpcomingOrLive(event: UsauEventSummary): boolean {
  const cutoff = event.endDate ?? event.startDate;
  if (!cutoff) return false;
  return cutoff >= usauToday();
}

export const revalidate = 60;

// SSG mode with on-demand paths — see /players/[id]. Without this export the
// revalidate above never engages and every hit is request-rendered (3,742
// crawlable event URLs, the largest event surface).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

interface Props {
  params: { slug: string };
}

// generateMetadata and the page share one resolve + one load per request
// (React cache), so a merged series event costs 3 PostgREST calls per render.
const resolveEventCached = cache(resolveUsauEvent);
const loadEventCached = cache(async (slug: string) => {
  const resolved = await resolveEventCached(slug);
  return resolved ? loadUsauEvent(resolved) : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolveEventCached(params.slug).catch(() => null);
  if (!resolved) return { title: 'Event not found · The Layout' };
  const row = resolved.kind === 'group' ? resolved.rows[0] : resolved.row;
  const name = resolved.kind === 'event' ? row.name : row.series_group_name ?? row.name;
  const canonical = resolved.kind === 'event' ? row.usau_slug : (row.series_group_key as string);
  return {
    title: `${name} · USAU · The Layout`,
    // One URL per tournament: collapses ?div= variants, mixed-case slugs, and
    // the per-division member URLs that redirect here.
    alternates: { canonical: `/usau/events/${canonical}` },
  };
}

export default async function UsauEventPage({ params }: Props) {
  const resolved = await resolveEventCached(params.slug);
  if (!resolved) notFound();

  // One division's row of a series event (USAU publishes Sectionals/Regionals
  // per division) → the merged event, preselecting that division. Decided from
  // the member row itself, never from searchParams, so the route stays ISR.
  // 307 for now: switch to permanentRedirect once the group keys have held for
  // a season (a browser caches a 308 forever).
  if (resolved.kind === 'member') {
    redirect(usauEventHref(resolved.row.series_group_key as string, resolved.row.series_division));
  }

  const event = await loadEventCached(params.slug);
  if (!event) notFound();

  // WFDF-hosted events (WUCC/WJUC/WMUCC) leak into usau_events as stubs that
  // never grow games — the real data comes from the WFDF pipeline. When we've
  // ingested the WFDF twin, every USAU-side link lands there instead.
  const worldsTwin = await findWorldsTwinSlug(event.name, Number(event.season));
  if (worldsTwin) redirect(`/wfdf/events/${worldsTwin}`);

  const subtitle = formatSubtitle(event);
  const eyebrowParts = [
    event.competitionLevel,
    event.season,
    event.flight ? FLIGHT_LABELS[event.flight] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // "The Games" back-link carries the event's competition level so you land on
  // the games tab filtered to the SAME level (e.g. a Masters event → Masters
  // games), not always Club. Only for real UsauLevel values — HS/BEACH/OTHER
  // aren't level-filter options, so they fall back to the plain games tab.
  const eventLevel = USAU_LEVELS.includes(event.competitionLevel as UsauLevel)
    ? (event.competitionLevel as UsauLevel)
    : null;
  const gamesHref = `/scores${buildLeagueQs('usau', null, eventLevel)}`;

  return (
    <PageShell
      title={event.name}
      eyebrow={`USAU${eyebrowParts ? ` · ${eyebrowParts}` : ''}`}
      subtitle={subtitle ?? undefined}
      // Source link sits beside the title in the header's controls slot, same
      // as the WFDF event page — a quiet accent link, not a pill on its own row
      // (Hunter, 2026-08-22).
      controls={
        event.url || event.members.some((m) => m.url) || isUpcomingOrLive(event) ? (
          <div className="flex items-center gap-2">
            {event.members.length > 0 ? (
              // A merged event links the USAU page of the division being viewed.
              <Suspense
                fallback={
                  <SourceLink
                    href={event.members.find((m) => m.url)?.url ?? null}
                    label="USAU site"
                    ariaLabel={`View ${event.name} on USA Ultimate`}
                  />
                }
              >
                <UsauMemberSourceLink members={event.members} eventName={event.name} />
              </Suspense>
            ) : (
              event.url && (
                <SourceLink
                  href={event.url}
                  label="USAU site"
                  ariaLabel={`View ${event.name} on USA Ultimate`}
                />
              )
            )}
            {isUpcomingOrLive(event) &&
              (event.members.length > 0 ? (
                // Merged event: the star is stored on the division being viewed
                // (pushes follow that division, as before the merge) and shows
                // filled when any division is starred.
                <Suspense
                  fallback={
                    <EventFavoriteStar
                      event={{ league: 'usau', eventId: event.id, name: event.name, startDate: event.startDate, endDate: event.endDate }}
                      memberIds={event.members.map((m) => m.id)}
                    />
                  }
                >
                  <UsauSeriesFavoriteStar
                    event={{ league: 'usau', eventId: event.id, name: event.name, startDate: event.startDate, endDate: event.endDate }}
                    members={event.members}
                  />
                </Suspense>
              ) : (
                <EventFavoriteStar
                  event={{
                    league: 'usau',
                    eventId: event.id,
                    name: event.name,
                    startDate: event.startDate,
                    endDate: event.endDate,
                  }}
                />
              ))}
          </div>
        ) : undefined
      }
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'The Games', href: gamesHref },
        { label: event.name },
      ]}
    >
      {/* The "View on USAU" link renders inside UsauEventDetail, sharing a
          row with the Level/Division selects (right-aligned) so mobile gets
          one compact header row instead of stacked controls. */}
      {/* Suspense is load-bearing: UsauEventDetail reads useSearchParams()
          (useDivision/useLevel), which throws missing-suspense-with-csr-bailout
          during the static render this route opted into — every event page
          500'd (FUNCTION_INVOCATION_FAILED) until this boundary. Same pattern
          as page-shell.tsx and usau-team-history.tsx. */}
      <Suspense>
        <UsauEventDetail event={event} />
      </Suspense>
    </PageShell>
  );
}

function formatSubtitle(event: UsauEventSummary): string | null {
  const parts: string[] = [];
  if (event.startDate) {
    const start = new Date(event.startDate + 'T00:00:00');
    const sl = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (event.endDate && event.endDate !== event.startDate) {
      const end = new Date(event.endDate + 'T00:00:00');
      const el = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      parts.push(`${sl} – ${el}`);
    } else {
      parts.push(sl);
    }
  }
  const place = [event.city, event.state].filter(Boolean).join(', ');
  if (place) parts.push(place);
  return parts.length > 0 ? parts.join(' · ') : null;
}
