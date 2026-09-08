// "Mini Games" section — currently just 12-0. Server-rendered: no client
// state, a plain link into the live /12-0 route. Port of the mobile hub's
// Mini Games tile.

import Link from 'next/link';

export function MiniGamesTile() {
  return (
    <section aria-labelledby="mini-games-heading" className="mb-8 lg:mb-10">
      <h2
        id="mini-games-heading"
        className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-4"
      >
        Mini Games
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface rounded-card-lg shadow-card p-5 flex flex-col gap-3">
          <span className="w-10 h-10 rounded-card-sm bg-accent/10 flex items-center justify-center flex-shrink-0">
            <TwelveOhGlyph />
          </span>
          <div className="flex-1">
            <h3 className="font-display italic text-[17px] font-bold tracking-[-0.02em] leading-[1.05] text-ink mb-1">
              12-0
            </h3>
            <p className="text-muted font-tight text-[12px] leading-snug">
              Build a perfect-season roster
            </p>
          </div>
          <Link
            href="/12-0"
            className={[
              'inline-flex items-center justify-center',
              'px-4 py-2 rounded-full min-h-[36px]',
              'bg-ink/5 text-ink font-tight text-[11px] font-bold tracking-[0.08em] uppercase',
              'no-underline hover:bg-ink/10 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            Play
          </Link>
        </div>
      </div>
    </section>
  );
}

function TwelveOhGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-accent">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
