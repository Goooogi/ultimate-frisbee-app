'use client';

// EUCS schedule body — an event picker + that event's games grouped by day.
//
// Event-scoped rather than a league-wide date feed: EUCS runs up to six tour
// stops on the SAME weekend, so a flat "all games on Sep 20" list interleaves
// unrelated tournaments. Picking the event first is how the schedule is
// actually read — you follow one tournament.
//
// The picker writes ?event= and navigates, so a schedule is linkable (the event
// page's "Full schedule →" deep-links straight to it) and the server does the
// query. Division filtering stays client-side — the day groups are already in
// the payload.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PillSelect } from '@/components/pill-select';
import { EufFlag } from '@/components/euf/euf-flag';
import { eufGameDate, eufGameTime } from '@/lib/euf/format-date';
import type { EufDivision, EufScheduleDay, EufScheduleEventOption } from '@/lib/euf/data';

interface Props {
  events: EufScheduleEventOption[];
  activeSlug: string;
  days: EufScheduleDay[];
}

export function EufSchedule({ events, activeSlug, days }: Props) {
  const router = useRouter();
  const [division, setDivision] = useState<string>('all');

  // 31 dated events — well past the 5-option threshold, so a dropdown, not pills.
  const eventOptions = useMemo(
    () =>
      events.map((e) => ({
        value: e.slug,
        label: e.name,
        hint: e.startDate ? String(e.year) : undefined,
      })),
    [events],
  );

  const divisionOptions = useMemo(() => {
    const present = new Set<string>();
    for (const d of days) for (const g of d.games) present.add(g.division);
    return [
      { value: 'all', label: 'All divisions' },
      ...(['Open', "Women's", 'Mixed'] as EufDivision[])
        .filter((d) => present.has(d))
        .map((d) => ({ value: d as string, label: d as string })),
    ];
  }, [days]);

  const shown = useMemo(
    () =>
      days
        .map((d) => ({
          ...d,
          games: division === 'all' ? d.games : d.games.filter((g) => g.division === division),
        }))
        .filter((d) => d.games.length > 0),
    [days, division],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
            Event
          </span>
          <PillSelect
            value={activeSlug}
            options={eventOptions}
            onChange={(slug) => router.push(`/euf/schedule?event=${slug}`)}
            ariaLabel="Choose an event"
            className="max-w-[240px] sm:max-w-none"
          />
        </div>
        {divisionOptions.length > 2 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
              Division
            </span>
            <PillSelect
              value={division}
              options={divisionOptions}
              onChange={setDivision}
              ariaLabel="Filter by division"
            />
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-card-lg bg-surface shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">
            No games scheduled for this selection.
          </p>
        </div>
      ) : (
        shown.map((day) => (
          <section key={day.date}>
            {/* Sticky day header so the date stays visible while scrolling a
                60-game Saturday. */}
            <h2 className="sticky top-0 z-10 bg-bg py-2 text-[11px] font-bold tracking-[0.18em] uppercase text-ink font-tight border-b border-hairline">
              {day.date === 'undated'
                ? 'Date TBD'
                : eufGameDate(day.games[0].scheduledAt, true)}
              <span className="ml-2 text-muted">
                {day.games.length} {day.games.length === 1 ? 'game' : 'games'}
              </span>
            </h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 list-none p-0 m-0 mt-3">
              {day.games.map((g) => {
                const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
                const awayWon = (g.awayScore ?? 0) > (g.homeScore ?? 0);
                const time = eufGameTime(g.scheduledAt);
                const fieldLabel = g.field
                  ? /^\d+[A-Za-z]?$/.test(g.field.trim())
                    ? `Field ${g.field.trim()}`
                    : g.field.trim()
                  : null;
                const meta = [time || null, g.roundName, fieldLabel]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={g.id} className="bg-surface rounded-card-sm shadow-soft p-3">
                    <div className="flex items-center justify-between gap-2 mb-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight">
                      <span className="text-muted truncate">{meta || '—'}</span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-faint">{g.division}</span>
                        <Link
                          href={`/euf/g/${g.id}`}
                          aria-label={`Box score: ${g.homeName} vs ${g.awayName}`}
                          className="text-muted no-underline hover:text-accent transition-colors"
                        >
                          Box
                        </Link>
                      </span>
                    </div>
                    <Side
                      id={g.homeTeamId}
                      name={g.homeName}
                      country={g.homeCountry}
                      score={g.homeScore}
                      won={homeWon}
                    />
                    <Side
                      id={g.awayTeamId}
                      name={g.awayName}
                      country={g.awayCountry}
                      score={g.awayScore}
                      won={awayWon}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Side({
  id,
  name,
  country,
  score,
  won,
}: {
  id: string | null;
  name: string;
  country: string | null;
  score: number | null;
  won: boolean;
}) {
  const inner = (
    <>
      <EufFlag countryName={country} size={13} />
      <span className={['truncate', won ? 'text-ink font-semibold' : 'text-muted'].join(' ')}>
        {name}
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-2 text-[13px] font-tight">
      {id ? (
        <Link
          href={`/euf/teams/${id}`}
          className="flex items-center gap-2 min-w-0 flex-1 no-underline hover:underline"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex items-center gap-2 min-w-0 flex-1">{inner}</span>
      )}
      <span
        className={['tabular-nums flex-shrink-0', won ? 'text-ink font-bold' : 'text-muted'].join(
          ' ',
        )}
      >
        {score ?? '–'}
      </span>
    </div>
  );
}
