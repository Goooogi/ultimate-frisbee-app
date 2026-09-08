// "Start a League" — every hub game ordered by soonest start, server-
// rendered from props resolved in the page (getGameStartDates +
// sortGamesBySoonest). Live games link into league creation preseeded with
// that game; non-live games render a dimmed "Coming soon" row.

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
        className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-4"
      >
        Start a League
      </h2>

      <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
        <ul aria-label="Games">
          {games.map((game, idx) => {
            const start = starts[game.id];
            const live = game.status === 'live';
            const name = game.name.replace(/ Fantasy$/, '');
            const range = formatStartRange(start?.startDate ?? null, start?.endDate ?? null);
            const subtitle = start?.label ? `${range} · ${start.label}` : range;

            const row = (
              <div
                className={[
                  'flex items-center gap-3.5 px-5 py-3.5',
                  idx > 0 ? 'border-t border-hairline' : '',
                  live ? '' : 'opacity-55',
                ].join(' ')}
              >
                <span className="w-9 h-9 rounded-card-sm bg-ink/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <Image src={game.logoSrc} alt="" width={26} height={26} className="object-contain w-[26px] h-[26px]" />
                </span>
                <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <span className="font-tight text-[14px] font-semibold text-ink truncate">{name}</span>
                  <span className="font-tight text-[11px] text-muted truncate">{subtitle}</span>
                </span>
                {live ? (
                  <span
                    className={[
                      'flex-shrink-0 inline-flex items-center justify-center',
                      'px-3.5 py-1.5 rounded-full min-h-[32px]',
                      'bg-accent text-accent-ink font-tight text-[10.5px] font-bold tracking-[0.08em] uppercase',
                    ].join(' ')}
                  >
                    Play
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-[9.5px] font-bold tracking-[0.1em] uppercase px-2 py-[3px] rounded-full bg-ink/[0.06] text-faint whitespace-nowrap">
                    Coming soon
                  </span>
                )}
              </div>
            );

            return (
              <li key={game.id}>
                {live ? (
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
