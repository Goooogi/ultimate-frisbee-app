'use client';

// Expandable weekly-points breakdown for a fantasy team's public view.
// Each week is a collapsible row: the header shows the week + its total points;
// expanding reveals that week's roster split into Offense/Defense with each
// player's fantasy points for the week (bye/DNP shows 0). Points are computed
// server-side (getTeamWeekBreakdown) with the same matrix as the scoring job.

import { useState } from 'react';
import Link from 'next/link';
import { formatWeekLabel } from '@/lib/fantasy/weeks';
import type { WeekBreakdown, WeekPlayerScore } from '@/lib/fantasy/data';

export function WeeklyBreakdown({ weeks }: { weeks: WeekBreakdown[] }) {
  // Newest week (weeks[0], already sorted desc by the page) starts expanded.
  const [openWeek, setOpenWeek] = useState<string | null>(weeks[0]?.week ?? null);

  return (
    <div className="bg-surface rounded-card shadow-card overflow-hidden">
      {weeks.map((w, idx) => {
        const isOpen = openWeek === w.week;
        const panelId = `week-panel-${w.week}`;
        return (
          <div key={w.week} className={idx > 0 ? 'border-t border-hairline' : ''}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenWeek(isOpen ? null : w.week)}
              className={[
                'w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left cursor-pointer',
                'hover:bg-surface-hi transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
              ].join(' ')}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Chevron open={isOpen} />
                <span className="font-tight text-[14px] font-semibold text-ink truncate">
                  {formatWeekLabel(w.week)}
                </span>
              </span>
              <span className="font-tight text-[15px] font-bold tabular text-right text-ink shrink-0">
                {w.totalPoints}
                <span className="text-[11px] font-medium text-faint ml-1">pts</span>
              </span>
            </button>

            {isOpen && (
              <div id={panelId} className="px-3 pb-3">
                <PlayerRows
                  label="Offense"
                  tag="O"
                  players={w.players.filter((p) => p.role === 'offender')}
                />
                <PlayerRows
                  label="Defense"
                  tag="D"
                  accent
                  players={w.players.filter((p) => p.role === 'defender')}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlayerRows({
  label,
  tag,
  players,
  accent = false,
}: {
  label: string;
  tag: string;
  players: WeekPlayerScore[];
  accent?: boolean;
}) {
  if (players.length === 0) return null;
  return (
    <div className="mt-1.5 first:mt-0">
      <div className="px-2 pt-2 pb-1 text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
        {label}
      </div>
      <div className="rounded-card-sm bg-bg overflow-hidden">
        {players.map((p, i) => (
          <div
            key={p.playerId}
            className={[
              'flex items-center gap-3 px-3 py-2.5',
              i > 0 ? 'border-t border-hairline' : '',
            ].join(' ')}
          >
            <span
              className={[
                'shrink-0 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center font-tight bg-ink/5',
                accent ? 'text-accent' : 'text-ink',
              ].join(' ')}
              aria-label={accent ? 'defender' : 'offender'}
            >
              {tag}
            </span>
            <span className="flex-1 min-w-0">
              <Link
                href={`/players/${p.playerId}`}
                className="block font-tight text-[13.5px] font-semibold text-ink truncate hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:underline"
              >
                {p.fullName}
              </Link>
              <span className="block font-tight text-[10.5px] text-muted truncate">
                {p.teamName ?? '—'}
                {p.gamesPlayed === 0 && <span className="text-faint"> · did not play</span>}
              </span>
            </span>
            <span
              className={[
                'shrink-0 font-tight text-[13.5px] font-bold tabular text-right',
                p.points > 0 ? 'text-ink' : p.points < 0 ? 'text-red-500' : 'text-faint',
              ].join(' ')}
            >
              {p.points > 0 ? p.points : p.points === 0 ? '0' : p.points}
              <span className="text-[10px] font-medium text-faint ml-1">pts</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={['shrink-0 text-faint transition-transform duration-150', open ? 'rotate-90' : ''].join(' ')}
    >
      <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
