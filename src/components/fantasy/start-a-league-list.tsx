// "Start a League" — every hub game ordered by soonest start, server-
// rendered from props resolved in the page (getGameStartDates +
// sortGamesBySoonest). Live games link into league creation preseeded with
// that game; every other row renders dimmed with a disabled Play pill.
//
// Playable requires BOTH `status === 'live'` AND `startable` (game-dates.ts):
// the next season/event still has its first lock ahead, so a league founded
// now has something to play. A tournament that has started or finished is
// never playable; UFA turns playable once next season's games are in
// ufa_games, and its row reads just "{season} season".

import Link from 'next/link';
import Image from 'next/image';
import type { GameDef } from '@/lib/fantasy/games';
import type { GameStartMap } from '@/lib/fantasy/game-dates';
import { formatStartRange } from '@/lib/fantasy/game-dates';

interface StartALeagueListProps {
  games: GameDef[];
  starts: GameStartMap;
}

export function StartALeagueList({ games, starts }: StartALeagueListProps) {
  return (
    <section aria-labelledby="start-a-league-heading" className="mb-8 lg:mb-10">
      <h2
        id="start-a-league-heading"
        className="font-display italic text-[22px] lg:text-[28px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-3"
      >
        Start a League
      </h2>

      <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
        <ul aria-label="Games">
          {games.map((game, idx) => {
            const start = starts[game.id];
            // Playable = live AND startable: its next season/event still has
            // its first lock ahead (getGameStartDates — the same rule the
            // create page's game picker uses).
            const playable = game.status === 'live' && !!start?.startable;
            const name = game.name.replace(/ Fantasy$/, '');
            // Tournaments print their dates; UFA prints just "{season} season"
            // (Hunter, 2026-09-13 — its season runs April–August).
            const range = start?.startDate ? formatStartRange(start.startDate, start.endDate) : null;
            const subtitle = range && start?.label ? `${range} · ${start.label}` : range ?? start?.label ?? 'Dates TBA';

            const row = (
              <div
                className={[
                  'flex items-center gap-3 px-4 py-2.5 min-h-[54px]',
                  idx > 0 ? 'border-t border-hairline' : '',
                  playable ? '' : 'opacity-55',
                ].join(' ')}
              >
                <span className="w-[34px] h-[34px] rounded-card-sm bg-ink/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <Image src={game.logoSrc} alt="" width={24} height={24} className="object-contain w-6 h-6" />
                </span>
                <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <span className="font-tight text-[14px] font-semibold text-ink truncate">{name}</span>
                  <span className="font-tight text-[11.5px] text-muted truncate">{subtitle}</span>
                </span>
                <span
                  className={[
                    'flex-shrink-0 inline-flex items-center justify-center',
                    'px-3 py-1 rounded-full min-h-[30px]',
                    'font-tight text-[10.5px] font-bold tracking-[0.08em] uppercase',
                    playable ? 'bg-accent text-accent-ink' : 'bg-ink/[0.06] text-faint',
                  ].join(' ')}
                >
                  Play
                  {/* The dimmed pill is the only visual cue that a row is
                      unavailable; name the reason for screen readers, which
                      can't see it. */}
                  {!playable && <span className="sr-only"> — not yet available</span>}
                </span>
              </div>
            );

            return (
              <li key={game.id}>
                {playable ? (
                  <Link
                    href={`/fantasy/leagues/new?game=${game.id}`}
                    className={[
                      'block no-underline transition-colors duration-150 hover:bg-surface-hi',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                    ].join(' ')}
                  >
                    {row}
                  </Link>
                ) : (
                  <div aria-disabled="true" className="cursor-not-allowed">
                    {row}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
