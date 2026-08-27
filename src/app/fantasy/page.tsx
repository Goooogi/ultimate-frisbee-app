// /fantasy — GAME HUB. Server Component, public + ISR.
// Competition-first landing (ESPN model): sells the games, not one league's
// leaderboard. Live games link into their game home; coming-soon games are
// greyed placeholders; hidden games (WFDF, until Hunter lifts the test flag)
// don't render at all. See vault: Features/Fantasy V2 — Game Hub & Draft.md.

import Link from 'next/link';
import Image from 'next/image';
import { PageShell } from '@/components/page-shell';
import { hubGames } from '@/lib/fantasy/games';

export const revalidate = 60;

export default function FantasyHubPage() {
  const games = hubGames();

  return (
    <PageShell
      title="Fantasy"
      eyebrow="Fantasy"
      subtitle="Pick a game, build a team, outscore your friends."
      hideFooterMobile
    >
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Fantasy games">
        {games.map((game) => (
          <li key={game.id}>
            <GameCard
              href={game.status === 'live' ? `/fantasy/${gameSlug(game.id)}` : undefined}
              name={game.name}
              blurb={game.blurb}
              badge={game.badge}
              logoSrc={game.logoSrc}
              comingSoon={game.status === 'coming-soon'}
            />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

// Only 'ufa' has a live route today; other competition ids stay coming-soon
// (no route to resolve for them in P0 — see games.ts).
function gameSlug(id: string): string {
  return id === 'ufa' ? 'ufa' : id;
}

function GameCard({
  href,
  name,
  blurb,
  badge,
  logoSrc,
  comingSoon,
}: {
  href?: string;
  name: string;
  blurb: string;
  badge?: string;
  logoSrc: string;
  comingSoon: boolean;
}) {
  const content = (
    <div
      className={[
        'h-full bg-surface rounded-card-lg shadow-card p-5 lg:p-6',
        'flex flex-col gap-4',
        comingSoon ? 'opacity-55' : 'transition-shadow duration-150 hover:shadow-soft',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-11 h-11 rounded-card-sm bg-ink/5 flex items-center justify-center overflow-hidden flex-shrink-0">
          <Image src={logoSrc} alt="" width={32} height={32} className="object-contain w-8 h-8" />
        </div>
        {badge && !comingSoon && (
          <span className="flex-shrink-0 text-[9.5px] font-bold tracking-[0.1em] uppercase px-2 py-[3px] rounded-full bg-accent text-accent-ink">
            {badge}
          </span>
        )}
        {comingSoon && (
          <span className="flex-shrink-0 text-[9.5px] font-bold tracking-[0.1em] uppercase px-2 py-[3px] rounded-full bg-ink/[0.06] text-faint">
            Coming soon
          </span>
        )}
      </div>

      <div className="flex-1">
        <h2 className="font-display italic text-[20px] font-bold tracking-[-0.02em] leading-[1.05] text-ink mb-1.5">
          {name}
        </h2>
        <p className="text-muted font-tight text-[12.5px] leading-snug">{blurb}</p>
      </div>

      {!comingSoon && (
        <span className="inline-flex items-center gap-1.5 text-accent font-tight text-[12px] font-bold tracking-[0.04em]">
          Enter
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M3 7h8M8 4l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </div>
  );

  if (!href) {
    return (
      <div aria-disabled="true" className="block cursor-not-allowed">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-card-lg"
    >
      {content}
    </Link>
  );
}
