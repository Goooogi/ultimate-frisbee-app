// USAU player profile.
//
// Renders inside the standard PageShell. Shows:
//   - Eyebrow "USAU · Career" + the player's name
//   - Career totals across all (USAU) events where stats were recorded
//   - Team history grouped by team-season, with a sub-list of every event
//     played at that team. Goals/assists shown per event when present.
//
// One thing worth noting: the v1 identity scheme matches across teams by
// lowercased display name. That means "John Smith" on Revolver and "John
// Smith" on PoNY both appear here as a single profile. Future: an explicit
// merge layer that lets us link/unlink player rows.

import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import type { UsauPlayerSummary } from '@/lib/usau/data';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';

interface Props {
  profile: UsauPlayerSummary;
  topNavSlot?: React.ReactNode;
}

export function UsauPlayerProfile({ profile, topNavSlot }: Props) {
  const career = aggregateCareer(profile);
  const totalEvents = profile.teamHistory.reduce((s, t) => s + t.events.length, 0);
  const teamCount = new Set(profile.teamHistory.map((t) => t.teamName.toLowerCase())).size;

  return (
    <PageShell title={profile.displayName} eyebrow="USAU · Career" topNavSlot={topNavSlot}>
      {/* Championship banner — only if they've won at least one Club Nationals. */}
      {profile.championYears.length > 0 && (
        <ChampionBanner years={profile.championYears} label="USAU National Champion" />
      )}

      {/* Hero summary chips */}
      <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-hairline">
        <SummaryChip label="Events" value={totalEvents} />
        <SummaryChip label="Teams" value={teamCount} />
        {career.eventsWithStats > 0 && (
          <>
            <SummaryChip label="Goals" value={career.goals} accent />
            <SummaryChip label="Assists" value={career.assists} accent />
          </>
        )}
      </div>

      {/* Career totals — only if any event had stats */}
      {career.eventsWithStats > 0 && (
        <section className="mb-10" aria-labelledby="career-heading">
          <h2
            id="career-heading"
            className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-4 font-tight"
          >
            Career totals
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-border border border-border">
            <CareerStat label="Events scored" value={career.eventsWithStats} />
            <CareerStat label="Goals" value={career.goals} />
            <CareerStat label="Assists" value={career.assists} />
            <CareerStat label="Scores" value={career.goals + career.assists} />
            <CareerStat
              label="G/event"
              value={
                career.eventsWithStats > 0
                  ? (career.goals / career.eventsWithStats).toFixed(1)
                  : '—'
              }
            />
          </div>
          <p className="mt-2 text-[10px] font-medium text-faint font-tight">
            USAU only collects goals + assists at flagship events (Pro Champs,
            Nationals). Regional + sectional stats are not recorded.
          </p>
        </section>
      )}

      {/* Team history */}
      <section aria-labelledby="teams-heading">
        <h2
          id="teams-heading"
          className="flex items-baseline justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-3 font-tight"
        >
          <span>Team history</span>
          <span className="text-faint normal-case tracking-[0.1em] text-[10px] font-semibold">
            {profile.teamHistory.length} {profile.teamHistory.length === 1 ? 'team-season' : 'team-seasons'}
          </span>
        </h2>

        {profile.teamHistory.length === 0 ? (
          <div className="text-[12px] text-faint font-tight">No rostered events yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {profile.teamHistory.map((stint) => (
              <TeamStintCard key={`${stint.teamId}-${stint.season}`} stint={stint} />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function TeamStintCard({ stint }: { stint: UsauPlayerSummary['teamHistory'][number] }) {
  const totalGoals = stint.events.reduce((s, e) => s + (e.goals ?? 0), 0);
  const totalAssists = stint.events.reduce((s, e) => s + (e.assists ?? 0), 0);
  const hasStats = stint.events.some((e) => e.goals != null || e.assists != null);

  return (
    <details className="group bg-surface border border-border [&[open]]:border-ink transition-colors rounded-sm">
      <summary
        className={[
          'list-none cursor-pointer select-none px-4 py-3.5 flex items-center gap-3',
          'hover:bg-surface-hi transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
        ].join(' ')}
      >
        <Caret />
        <span className="tabular text-[14px] font-bold font-tight text-ink w-[60px] flex-shrink-0">
          {stint.season}
        </span>
        <span className="flex-1 min-w-0">
          {/* Use min-w-0 + flex-1 on the Link so truncate respects the
              container width. pr-1.5 reserves space for the italic
              glyph's right-edge slant so "Bravo" doesn't appear clipped. */}
          <span className="flex items-center gap-2 min-w-0">
            <UsauTeamLogo name={stint.teamName} genderDivision={stint.genderDivision} size={24} />
            <Link
              href={`/usau/teams/${stint.teamId}`}
              className="flex-1 min-w-0 block font-display italic font-bold text-[18px] leading-tight tracking-[-0.02em] text-ink truncate pr-1.5 hover:text-accent transition-colors"
            >
              {stint.teamName}
            </Link>
            {stint.isChampion && <TrophyBadge title="USAU National Champion" />}
          </span>
          <span className="block text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight mt-0.5">
            {stint.events.length} {stint.events.length === 1 ? 'event' : 'events'}
            {stint.jerseyNumber && ` · #${stint.jerseyNumber}`}
            {stint.isChampion && ' · Champion'}
          </span>
        </span>
        {hasStats && (
          <span className="hidden sm:flex items-center gap-4 flex-shrink-0">
            <SummaryStat label="G" value={totalGoals} />
            <SummaryStat label="A" value={totalAssists} />
          </span>
        )}
      </summary>

      <div className="px-4 pt-2 pb-4 border-t border-hairline">
        {stint.events.length === 0 ? (
          <div className="py-4 text-[12px] text-faint font-tight">No events recorded.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {stint.events.map((event) => (
              <EventRow key={`${stint.teamId}-${event.slug}`} event={event} />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function EventRow({
  event,
}: {
  event: UsauPlayerSummary['teamHistory'][number]['events'][number];
}) {
  const date = event.startDate
    ? new Date(event.startDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  return (
    <li className="flex items-center gap-3 px-2 py-1.5 hover:bg-surface transition-colors rounded">
      <Link
        href={`/usau/events/${event.slug}`}
        className="flex-1 min-w-0 text-[13px] text-ink font-tight hover:text-accent transition-colors truncate"
      >
        {event.name}
      </Link>
      {date && (
        <span className="hidden sm:block text-[11px] text-faint font-tight tabular whitespace-nowrap">
          {date}
        </span>
      )}
      {event.seed != null && (
        <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight whitespace-nowrap">
          Seed {event.seed}
        </span>
      )}
      {(event.goals != null || event.assists != null) && (
        <span className="flex items-center gap-2 flex-shrink-0">
          {event.goals != null && (
            <span className="tabular text-[12px] font-bold text-ink font-tight">
              {event.goals}G
            </span>
          )}
          {event.assists != null && (
            <span className="tabular text-[12px] font-bold text-ink font-tight">
              {event.assists}A
            </span>
          )}
        </span>
      )}
    </li>
  );
}

function SummaryChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        'inline-flex items-baseline gap-2 px-3 py-2 rounded-md',
        accent ? 'bg-accent text-accent-ink' : 'bg-surface border border-border',
      ].join(' ')}
    >
      <span className="tabular text-[18px] font-bold font-tight leading-none tracking-[-0.02em]">
        {value}
      </span>
      <span className="text-[9px] font-bold tracking-[0.18em] uppercase font-tight opacity-80">
        {label}
      </span>
    </div>
  );
}

function CareerStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface flex flex-col items-center justify-center px-3 py-5 gap-1">
      <div className="tabular text-[24px] md:text-[28px] font-bold font-tight leading-none text-ink tracking-[-0.03em]">
        {value ?? '—'}
      </div>
      <div className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted font-tight text-center">
        {label}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="tabular text-[14px] font-bold font-tight text-ink leading-none">
        {value}
      </span>
      <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
        {label}
      </span>
    </span>
  );
}

/**
 * Big championship banner at the top of the profile. Lists all the years
 * this player won the title — single-source-of-truth for the achievement,
 * the per-stint trophy icon is just a quick scan cue further down.
 */
export function ChampionBanner({ years, label }: { years: number[]; label: string }) {
  const sorted = [...years].sort((a, b) => b - a);
  return (
    <div
      role="note"
      className={[
        'flex items-center gap-3 mb-6 px-4 py-3 rounded-md',
        'bg-accent/10 border border-accent/40 text-ink',
      ].join(' ')}
    >
      <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-accent text-accent-ink">
        <TrophyGlyph size={18} />
      </span>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
          {label}
        </span>
        <span className="text-[14px] font-bold font-tight text-ink truncate">
          {sorted.length === 1 ? `${sorted[0]} title` : `${sorted.length}× champion · ${sorted.join(', ')}`}
        </span>
      </div>
    </div>
  );
}

function TrophyBadge({ title }: { title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-ink flex-shrink-0"
    >
      <TrophyGlyph size={11} />
    </span>
  );
}

function TrophyGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M6 3h10v5a5 5 0 0 1-10 0V3Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 5H3v2a2 2 0 0 0 2 2M16 5h3v2a2 2 0 0 1-2 2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 13v3M8 19h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
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

function aggregateCareer(profile: UsauPlayerSummary): {
  goals: number;
  assists: number;
  eventsWithStats: number;
} {
  let goals = 0;
  let assists = 0;
  let eventsWithStats = 0;
  for (const stint of profile.teamHistory) {
    for (const e of stint.events) {
      if (e.goals != null || e.assists != null) eventsWithStats++;
      goals += e.goals ?? 0;
      assists += e.assists ?? 0;
    }
  }
  return { goals, assists, eventsWithStats };
}
