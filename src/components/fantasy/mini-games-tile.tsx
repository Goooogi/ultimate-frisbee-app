// "Mini Games" section — currently just 12-0. Server-rendered: no client
// state, a plain link into the live /12-0 route. Port of the mobile hub's
// Mini Games tile.

import Link from 'next/link';

export function MiniGamesTile() {
  return (
    <section aria-labelledby="mini-games-heading" className="mb-8 lg:mb-10">
      <h2
        id="mini-games-heading"
        className="font-display italic text-[22px] lg:text-[28px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-3"
      >
        Mini Games
      </h2>

      {/* Mobile: one compact full-width row — same row rhythm as Start a
          League, so the two sections read as one list. Desktop: a square tile;
          the full-width row stretched a single game across the whole page. */}
      <div className="bg-surface rounded-card-lg shadow-card overflow-hidden lg:w-[240px] lg:aspect-square">
        <Link
          href="/12-0"
          className={[
            'flex items-center gap-3 px-4 py-2.5 min-h-[54px]',
            'lg:h-full lg:flex-col lg:items-start lg:gap-4 lg:p-5',
            'no-underline transition-colors duration-150 hover:bg-surface-hi',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
          ].join(' ')}
        >
          <span className="w-[34px] h-[34px] lg:w-[44px] lg:h-[44px] rounded-card-sm bg-accent/10 flex items-center justify-center flex-shrink-0">
            <TwelveOhGlyph />
          </span>
          <span className="min-w-0 flex-1 lg:w-full flex flex-col gap-0.5">
            <span className="font-display italic text-[17px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[1.05] text-ink truncate">
              12-0
            </span>
            <span className="font-tight text-[11.5px] text-muted truncate">
              Build a perfect-season roster
            </span>
          </span>
          <span
            className={[
              'flex-shrink-0 inline-flex items-center justify-center',
              'px-3 py-1 rounded-full min-h-[30px]',
              'bg-ink/5 text-ink font-tight text-[10.5px] font-bold tracking-[0.08em] uppercase',
            ].join(' ')}
          >
            Play
          </span>
        </Link>
      </div>
    </section>
  );
}

function TwelveOhGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-accent">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
