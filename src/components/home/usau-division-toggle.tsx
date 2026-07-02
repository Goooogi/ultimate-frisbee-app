'use client';

// USAU division toggle — interactive tab strip + ranked list.
// Receives all 5 divisions' pre-fetched data from the server component parent;
// no data fetching here. Only populated divisions are passed in.

import { useState } from 'react';
import Link from 'next/link';
import type { UsauDivisionData } from '@/components/home/league-standings-sections';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';

interface UsauDivisionToggleProps {
  divisions: UsauDivisionData[];
}

export function UsauDivisionToggle({ divisions }: UsauDivisionToggleProps) {
  const [activeDivKey, setActiveDivKey] = useState(divisions[0]?.key ?? '');

  const active = divisions.find((d) => d.key === activeDivKey) ?? divisions[0];

  if (!active) return null;

  return (
    <div className="flex flex-col">
      {/* Tab strip — all divisions on one line. Each tab flexes to an equal
          share of the width so five short labels fit without wrapping; the
          overflow-x-auto is a safety net for extreme narrow viewports. */}
      <div
        className="flex gap-px border-b border-border bg-border overflow-x-auto"
        role="tablist"
        aria-label="USAU divisions"
      >
        {divisions.map((div) => {
          const isActive = div.key === activeDivKey;
          return (
            <button
              key={div.key}
              role="tab"
              aria-selected={isActive}
              aria-controls={`usau-panel-${div.key}`}
              onClick={() => setActiveDivKey(div.key)}
              className={[
                'relative flex-1 min-w-0 px-1.5 py-2 font-tight text-[10px] font-bold tracking-[0.06em] uppercase whitespace-nowrap text-center transition-colors cursor-pointer',
                isActive
                  ? 'bg-surface text-ink'
                  : 'bg-surface-hi text-muted hover:text-ink hover:bg-surface',
              ].join(' ')}
            >
              {div.shortLabel}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-[2px] bg-accent"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Ranked list for the active division */}
      <div
        id={`usau-panel-${active.key}`}
        role="tabpanel"
        aria-label={active.label}
        className="flex flex-col px-5 py-3 lg:px-6"
      >
        {active.teams.length === 0 ? (
          <span className="font-mono text-[11px] text-faint py-4">No rankings available.</span>
        ) : (
          active.teams.map((team) => {
            const record =
              team.wins != null && team.losses != null
                ? `${team.wins}-${team.losses}`
                : null;
            const rating =
              team.rating != null ? team.rating.toFixed(0) : null;
            const meta = [team.state, team.region].filter(Boolean).join(' · ');

            return (
              <Link
                key={team.id}
                href={`/usau/teams/${team.id}`}
                className="flex items-center gap-3 py-2 border-b border-hairline last:border-b-0 hover:opacity-80 transition-opacity"
              >
                <span className="font-mono text-[11px] text-faint w-[18px] flex-shrink-0 tabular">
                  {String(team.rank).padStart(2, '0')}
                </span>
                <UsauTeamLogo
                  name={team.name}
                  genderDivision={active.genderDivision}
                  competitionLevel={active.competitionLevel}
                  size={24}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-display italic font-bold text-[13px] lg:text-[14px] leading-none text-ink truncate">
                    {team.name}
                  </div>
                  {(record || meta) && (
                    <div className="font-mono text-[10px] text-muted mt-0.5 tabular truncate">
                      {[record, meta].filter(Boolean).join('  ·  ')}
                    </div>
                  )}
                </div>
                {rating && (
                  <span className="font-mono text-[10.5px] text-faint flex-shrink-0 tabular">
                    {rating}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
