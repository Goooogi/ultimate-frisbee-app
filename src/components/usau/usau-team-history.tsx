'use client';

// Client-side year filter for the team history. The server fetches the
// full clustered team summary (every season we have data for); this
// component renders a year-selector dropdown and only displays the
// selected year's tournaments + roster.

import Link from 'next/link';
import { useState } from 'react';
import type { UsauTeamSummary } from '@/lib/usau/data';
import { usauEventHref } from '@/lib/usau/event-href';
import { PillSelect } from '@/components/pill-select';

interface Props {
  seasons: UsauTeamSummary['seasons'];
  /** The team's gender division — carried onto event links so a Mixed team's
   *  Nationals link opens the Mixed bracket, not the default Men's. */
  genderDivision?: string | null;
}

export function UsauTeamHistory({ seasons, genderDivision = null }: Props) {
  const [selected, setSelected] = useState<number | null>(() => seasons[0]?.season ?? null);

  if (seasons.length === 0) {
    return <div className="text-[12px] text-faint font-tight">No history recorded yet.</div>;
  }

  const active = seasons.find((s) => s.season === selected) ?? seasons[0];

  return (
    <section aria-labelledby="history-heading">
      <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b border-hairline">
        <h2
          id="history-heading"
          className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight"
        >
          Season history
        </h2>
        <YearDropdown
          seasons={seasons}
          value={active.season}
          onChange={setSelected}
        />
      </div>

      <div className="flex flex-col gap-6">
        {/* Quick stats for the selected season */}
        <div className="flex items-center gap-4 text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
          <span>
            <span className="tabular text-ink">{active.events.length}</span>{' '}
            {active.events.length === 1 ? 'event' : 'events'}
          </span>
          <span>
            <span className="tabular text-ink">{active.roster.length}</span>{' '}
            {active.roster.length === 1 ? 'player' : 'players'}
          </span>
        </div>

        {active.events.length > 0 && (
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-2">
              Tournaments
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {active.events.map((event) => (
                <EventCard key={event.slug} event={event} genderDivision={genderDivision} />
              ))}
            </ul>
          </div>
        )}

        {active.roster.length > 0 && (
          <div className="bg-surface rounded-card-lg shadow-card p-4 lg:p-5">
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-2 px-1">
              Roster
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {active.roster.map((p) => (
                <li key={p.playerId}>
                  <Link
                    href={`/players/${p.playerId}?from=usau`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-card-sm hover:bg-ink/[0.04] transition-colors no-underline"
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

        {active.events.length === 0 && active.roster.length === 0 && (
          <div className="text-[12px] text-faint font-tight py-2">
            No tournaments or roster recorded for {active.season}.
          </div>
        )}
      </div>
    </section>
  );
}

function YearDropdown({
  seasons,
  value,
  onChange,
}: {
  seasons: UsauTeamSummary['seasons'];
  value: number;
  onChange: (year: number) => void;
}) {
  return (
    <PillSelect
      value={value}
      onChange={onChange}
      ariaLabel="Select season"
      options={seasons.map((s) => ({ value: s.season, label: `${s.season} Season` }))}
    />
  );
}

/** "1st" / "2nd" / "3rd" / "4th" … */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** The team's finish at a tournament. Podium places (1–3) get a medal-tinted
 *  chip; everything else is a clean "Nth place" label. */
function PlacementBadge({ place }: { place: number }) {
  const podium =
    place === 1
      ? { ring: 'bg-[#E8B923]/15 text-[#9A7B0A]', label: 'Champions' }
      : place === 2
        ? { ring: 'bg-[#9AA3AD]/20 text-[#5C6672]', label: `${ordinal(place)} place` }
        : place === 3
          ? { ring: 'bg-[#C77B3B]/15 text-[#8A5222]', label: `${ordinal(place)} place` }
          : null;

  if (podium) {
    return (
      <span
        className={[
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
          'text-[11px] font-bold tracking-[0.06em] uppercase font-tight',
          podium.ring,
        ].join(' ')}
      >
        <MedalGlyph />
        {podium.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-ink/[0.05] px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase text-muted font-tight">
      {ordinal(place)} place
    </span>
  );
}

function MedalGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="15" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M8 4l4 6 4-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EventCard({
  event,
  genderDivision,
}: {
  event: UsauTeamSummary['seasons'][number]['events'][number];
  genderDivision: string | null;
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
        href={usauEventHref(event.slug, genderDivision)}
        className="group block bg-surface rounded-card shadow-card p-3.5 transition-shadow hover:shadow-lift cursor-pointer no-underline"
      >
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight truncate">
            {date ?? '—'}
          </span>
          {event.seed != null && (
            <span className="flex-shrink-0 text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight">
              Seed {event.seed}
            </span>
          )}
        </div>
        <div className="font-display italic font-bold text-[17px] leading-tight tracking-[-0.02em] text-ink group-hover:text-accent transition-colors">
          {event.name}
        </div>
        {/* Result: the place the team finished at this tournament (the headline
            of the card per backlog #12). Podium finishes get a medal chip. */}
        {event.finalPlacement != null && (
          <div className="mt-2">
            <PlacementBadge place={event.finalPlacement} />
          </div>
        )}
        {event.pool && (
          <div className="mt-1 text-[11px] text-muted font-tight">{event.pool}</div>
        )}
      </Link>
    </li>
  );
}
