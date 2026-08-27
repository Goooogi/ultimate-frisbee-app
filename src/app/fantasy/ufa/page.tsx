// /fantasy/ufa — UFA GAME HOME. Server Component.
// Moved from the old /fantasy landing (2026-08-27 game-hub IA inversion).
// Auth is NOT required to view this page.
//
// Standings USED to live here as a global "leaderboard". They don't any more
// (2026-08-27): standings belong to a league, so the UFA Public League's
// standings render on its own league page like every private league's —
// ESPN/Yahoo/Sleeper all scope standings inside a league. This page is now
// purely the game's front door: branding, rules, and the way into leagues.

import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { fantasySeasonYear } from '@/lib/fantasy/data';
import { getGlobalContest } from '@/lib/fantasy/leagues';
import { FantasyRulesModal } from '@/components/fantasy/fantasy-rules-modal';
import { YourLeagues } from '@/components/fantasy/your-leagues';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

const BREADCRUMBS: Crumb[] = [
  { label: 'Fantasy', href: '/fantasy' },
  { label: 'UFA Fantasy' },
];

export default async function UfaGameHomePage() {
  const globalContest = await getGlobalContest('ufa', fantasySeasonYear()).catch(() => null);

  return (
    <PageShell
      title="UFA Fantasy"
      eyebrow="UFA Fantasy · Beta"
      subtitle="Season-long fantasy for the UFA — build a team, outscore your friends."
      breadcrumbs={BREADCRUMBS}
      hideFooterMobile
      controls={<FantasyRulesModal label="Rules" autoOpenOnceKey="fantasy_rules_seen_v1" />}
    >
      {/* ── Public League callout ─────────────────────────────────────────
          The open-to-everyone pool. Its standings live on its league page. */}
      {globalContest && (
        <section aria-labelledby="public-league-heading" className="mb-8 lg:mb-10">
          <div className="bg-surface rounded-card-lg shadow-card p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
            <div className="flex-1">
              <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-2">
                Public League
              </div>
              <h2
                id="public-league-heading"
                className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-2"
              >
                UFA {globalContest.seasonYear} · Public League
              </h2>
              <p className="text-muted font-tight text-[13px] lg:text-[14px] leading-snug max-w-[440px]">
                Open to everyone — build a team, then track the standings against
                every other player.
              </p>
            </div>
            <Link
              href={`/fantasy/ufa/l/${globalContest.id}`}
              className={[
                'inline-flex items-center justify-center gap-2 flex-shrink-0',
                'px-6 py-3 rounded-full min-h-[44px]',
                'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.12em] uppercase',
                'no-underline hover:opacity-90 transition-opacity duration-150 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              ].join(' ')}
            >
              View standings
            </Link>
          </div>
        </section>
      )}

      {/* ── Your leagues in this game ─────────────────────────────────────── */}
      <YourLeagues
        globalPool={
          globalContest
            ? { name: `UFA ${globalContest.seasonYear} · Public League`, contestId: globalContest.id }
            : null
        }
      />
    </PageShell>
  );
}
