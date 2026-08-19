// /leagues — league directory landing page body. Matches the mobile app's
// Leagues tab exactly: one card containing a vertical list of league rows
// (mark, label, subtitle, chevron) — no descriptor text, no per-league quick
// links. Reuses the same row treatment and league list as the home page's
// "Every league" strip (src/components/home/leagues-strip.tsx) so this page
// never drifts from it.

import { LEAGUE_ROWS, LeagueMark } from '@/components/home/leagues-strip';
import Link from 'next/link';

export function LeaguesDirectory() {
  return (
    <div className="bg-surface rounded-card-lg shadow-card p-2">
      {LEAGUE_ROWS.map((row, index) => {
        const isLast = index === LEAGUE_ROWS.length - 1;
        return (
          <Link
            key={row.id}
            href={row.href ?? '#'}
            className={[
              'flex items-center gap-3.5 px-3 py-[13px] min-h-[56px]',
              'text-ink no-underline hover:bg-surface-hi transition-colors duration-150 group',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
              !isLast ? 'border-b border-hairline' : '',
            ].join(' ')}
          >
            <LeagueMark abbr={row.abbr} img={row.img} size={40} />
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold font-tight leading-tight truncate text-ink">
                {row.label}
              </div>
              {row.subtitle && (
                <div className="text-[11.5px] text-muted font-tight leading-tight mt-0.5">
                  {row.subtitle}
                </div>
              )}
            </div>
            <ChevronRight />
          </Link>
        );
      })}
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="text-faint flex-shrink-0 group-hover:text-accent transition-colors duration-150"
    >
      <path
        d="M3.5 2L6.5 5L3.5 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
