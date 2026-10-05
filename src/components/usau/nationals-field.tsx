// NationalsField — the projected USA Ultimate Club Nationals field for one
// division: each region's bids and the Regionals finishers holding them
// (getNationalsField / src/lib/usau/nationals-field.ts). The event page shows
// it as the FIELD tab while Club Nationals has no teams posted, one division
// per DivisionPager page. Web port of mobile src/components/usau/NationalsField.tsx.
//
// It is a projection, not USA Ultimate's announcement — the note under the
// meta says so. Cards follow UsauSeriesStageList's event cards (elevation card,
// header + rows) with the same no-nested-anchors structure: the region header
// is its own link (to that Regional, when one exists), a SIBLING to each team
// row's link. Bids still undecided render as inert placeholder rows.
//
// No hooks: rendered by the client event detail from server-fetched data.

import Link from 'next/link';
import { ordinal } from '@/lib/bracket-tree';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';
import type {
  NationalsDivision,
  NationalsField,
  NationalsFieldRegion,
  NationalsQualifier,
} from '@/lib/usau/nationals-field';

/** What the event page hands the FIELD tab: the field, or a failed read. */
export type NationalsFieldState = { status: 'ready'; field: NationalsField } | { status: 'error' };

export function NationalsFieldPanel({
  state,
  division,
  season,
}: {
  state: NationalsFieldState;
  division: string;
  season: number;
}) {
  // Generic copy only — never the read's own error message.
  if (state.status === 'error') return <FieldMessage text="Couldn't load the projected field." />;
  const field = state.field.divisions.find((d) => d.division === division) ?? null;
  if (!field) return <FieldMessage text="No projected field for this division yet." />;

  const meta = [
    field.qualifiedCount === field.fieldSize
      ? `${field.fieldSize} teams`
      : `${field.qualifiedCount} of ${field.fieldSize} teams`,
    `${field.regions.length} region${field.regions.length === 1 ? '' : 's'}`,
  ].join(' · ');

  return (
    <section aria-labelledby="field-heading" className="flex flex-col gap-3">
      <h2 id="field-heading" className="sr-only">
        Projected Nationals field
      </h2>
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[11px] font-medium uppercase tracking-[0.06em] text-muted font-sans">{meta}</p>
        <p className="m-0 text-[13px] leading-[19px] text-muted font-sans">
          Projected from Regionals results and USA Ultimate&apos;s bid allocation. Seeding and pools to be
          announced.
        </p>
      </div>
      <ul className="m-0 p-0 list-none grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
        {field.regions.map((region) => (
          <li key={region.region} className="h-full">
            <RegionCard region={region} division={field.division} season={season} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RegionCard({
  region,
  division,
  season,
}: {
  region: NationalsFieldRegion;
  division: NationalsDivision;
  season: number;
}) {
  const bids = `${region.bids} bid${region.bids === 1 ? '' : 's'}`;
  // Bids whose holder isn't known yet (Regional unfinished or undecided).
  const pending = Math.max(0, region.bids - region.qualifiers.length);
  const headerClass = 'flex items-center justify-between gap-3 min-h-[44px] px-4 py-2.5';
  const header = (
    <>
      <span className="min-w-0 truncate font-tight text-[14px] font-bold text-ink">{region.region}</span>
      <span className="flex-shrink-0 tabular font-tight text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
        {bids}
      </span>
    </>
  );

  return (
    <div className="h-full bg-surface rounded-card shadow-card overflow-hidden py-1">
      {region.eventSlug ? (
        // Always ?div=, so the Regional opens on this division rather than
        // whichever one was last viewed there (mobile regionalHref).
        <Link
          href={`/usau/events/${region.eventSlug}?div=${division.toLowerCase()}`}
          aria-label={`${region.region} Regional, ${bids}`}
          className={`${headerClass} no-underline hover:bg-ink/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent`}
        >
          {header}
        </Link>
      ) : (
        <div className={headerClass}>{header}</div>
      )}
      <ul className="m-0 list-none flex flex-col gap-0.5 px-3 pb-2">
        {region.qualifiers.map((q) => (
          <li key={q.teamId}>
            <QualifierRow qualifier={q} division={division} season={season} />
          </li>
        ))}
        {Array.from({ length: pending }, (_, i) => (
          <li key={`pending-${i}`} className="flex items-center gap-2 min-h-[44px] px-1">
            {/* Empty crest-sized ring: an open slot, aligned with the crests above. */}
            <span aria-hidden="true" className="w-[22px] h-[22px] flex-shrink-0 rounded-full border border-faint" />
            <span className="font-sans text-[13px] font-medium text-muted">To be decided</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QualifierRow({
  qualifier,
  division,
  season,
}: {
  qualifier: NationalsQualifier;
  division: NationalsDivision;
  season: number;
}) {
  const champion = qualifier.regionalPlace === 1;
  // Tied teams share a place, so two "2nd place" rows can both be right.
  const how = champion ? 'Regional champion' : `${ordinal(qualifier.regionalPlace)} place`;
  return (
    <Link
      href={`/usau/teams/${qualifier.teamId}?season=${season}`}
      aria-label={`${qualifier.teamName}, ${how}${qualifier.rank != null ? `, national rank ${qualifier.rank}` : ''}`}
      className="flex items-center gap-2 min-h-[44px] px-1 rounded-card-sm no-underline hover:bg-ink/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="inline-flex flex-shrink-0 rounded-full overflow-hidden">
        <UsauTeamLogo name={qualifier.teamName} genderDivision={division} competitionLevel="CLUB" size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-tight text-[13px] font-bold text-ink">{qualifier.teamName}</span>
        <span className="flex items-center gap-1 font-tight text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
          {champion && (
            <span className="text-accent flex-shrink-0">
              <TrophyIcon />
            </span>
          )}
          {how}
        </span>
      </span>
      {qualifier.rank != null && (
        <span className="flex-shrink-0 min-w-[30px] text-right tabular font-tight text-[11px] font-bold text-muted">
          #{qualifier.rank}
        </span>
      )}
    </Link>
  );
}

function FieldMessage({ text }: { text: string }) {
  return <p className="m-0 py-12 px-8 text-center text-[13px] leading-[19px] text-muted font-sans">{text}</p>;
}

function TrophyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 4h12v3a6 6 0 0 1-12 0V4Z M6 5H3v2a3 3 0 0 0 3 3 M18 5h3v2a3 3 0 0 1-3 3 M9 14.5h6 M10 18h4 M9 18h6v2H9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
