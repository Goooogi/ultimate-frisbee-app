// USAU Teams view: list ranked by their finish at the most recent
// completed Nationals (or, if they didn't make Nationals, their best
// Regionals placement).
//
// Server Component — pre-renders the entire list using lib/usau/data
// query helpers. Re-renders every minute via the page's revalidate.

import Link from 'next/link';
import { listRankedTeams } from '@/lib/usau/data';

export async function UsauTeamsRanked({
  genderDivision,
}: {
  genderDivision?: 'Men' | 'Women' | 'Mixed';
}) {
  const { season, teams } = await listRankedTeams({ genderDivision });

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border rounded-md">
        <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
          No ranked teams
        </div>
        <div className="text-[13px] text-faint max-w-sm">
          We don&rsquo;t have a Nationals event ingested yet. Run the
          scraper for {season} to populate this list.
        </div>
      </div>
    );
  }

  // Split into "made Nationals" and "everyone else" so we can show a
  // visual divider between the two tiers.
  const madeNats = teams.filter(
    (t) => t.nationalsPlacement != null || t.rankedFromSlug?.includes('Nationals'),
  );
  const others = teams.filter(
    (t) => t.nationalsPlacement == null && !t.rankedFromSlug?.includes('Nationals'),
  );

  return (
    <div className="flex flex-col gap-7">
      {/* Honest framing — we don't have computed final placements yet
          (USAU's schedule pages don't expose them, and we haven't
          derived them from bracket games). What we DO have is each
          team's entry seed at each event. Re-orderable to true finish
          once we add a placement-derivation pass. */}
      <div className="text-[11px] font-medium text-faint font-tight bg-surface border border-border rounded px-3 py-2">
        <span className="font-bold text-muted uppercase tracking-[0.16em] text-[10px]">
          Note ·
        </span>{' '}
        Currently ordered by entry seed at the {season} {madeNats.length > 0 ? 'Nationals' : 'Regionals'}.
        Real finish-order (champion → last place) lands when we add bracket
        derivation.
      </div>

      {madeNats.length > 0 && (
        <section aria-labelledby="ranked-heading">
          <h2
            id="ranked-heading"
            className="flex items-baseline justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-3 pb-2 border-b border-hairline font-tight"
          >
            <span>{season} Nationals · by seed</span>
            <span className="text-faint normal-case tracking-[0.1em]">
              {madeNats.length} teams
            </span>
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
            {madeNats.map((t, idx) => (
              <RankedRow
                key={t.id}
                rank={t.nationalsPlacement ?? idx + 1}
                name={t.name}
                state={t.state}
                competitionLevel={t.competitionLevel}
                href={`/usau/teams/${t.id}`}
                isTop
              />
            ))}
          </ol>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="others-heading">
          <h2
            id="others-heading"
            className="flex items-baseline justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-3 pb-2 border-b border-hairline font-tight"
          >
            <span>Other teams · {season} Regionals</span>
            <span className="text-faint normal-case tracking-[0.1em]">
              {others.length}
            </span>
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
            {others.map((t, idx) => (
              <RankedRow
                key={t.id}
                rank={t.bestRegionalsPlacement ?? idx + 1}
                name={t.name}
                state={t.state}
                competitionLevel={t.competitionLevel}
                href={`/usau/teams/${t.id}`}
                isTop={false}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function RankedRow({
  rank,
  name,
  state,
  competitionLevel,
  href,
  isTop,
}: {
  rank: number | null;
  name: string;
  state: string | null;
  competitionLevel: string | null;
  href: string;
  isTop: boolean;
}) {
  // Top 3 get the accent ring; champion + 2nd + 3rd get a medal-style
  // tinted background so the podium reads at a glance.
  const podium = isTop && rank != null && rank <= 3;
  return (
    <li className="bg-surface">
      <Link
        href={href}
        className={[
          'flex items-center gap-3 px-4 py-3 hover:bg-surface-hi transition-colors no-underline',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0',
            'tabular text-[13px] font-bold font-tight',
            podium
              ? rank === 1
                ? 'bg-accent text-accent-ink'
                : 'bg-ink text-bg'
              : 'bg-bg border border-border text-muted',
          ].join(' ')}
        >
          {rank ?? '—'}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-bold text-ink font-tight truncate">
            {name}
          </span>
          <span className="block text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight mt-0.5">
            {[state, competitionLevel?.replace('_', ' ')].filter(Boolean).join(' · ') || '—'}
          </span>
        </span>
      </Link>
    </li>
  );
}
