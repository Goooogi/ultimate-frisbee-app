// Fantasy Beta — public landing page. Server Component.
// Auth is NOT required to view this page (leaderboard + rules are public).
// The CTA "Build your team" links to /fantasy/team — auth is deferred until
// the user attempts a WRITE action inside the builder.

import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { getLeaderboard } from '@/lib/fantasy/data';
import { FantasyRulesModal } from '@/components/fantasy/fantasy-rules-modal';

export const revalidate = 60;

export default async function FantasyLandingPage() {
  const leaderboard = await getLeaderboard().catch(() => []);

  return (
    <PageShell
      title="Leaderboard"
      eyebrow="Fantasy · Beta"
      subtitle="Every team, ranked by cumulative points."
      hideFooterMobile
    >
      {/* ── Global Leaderboard ────────────────────────────────────────────── */}
      <section aria-labelledby="leaderboard-heading">
        <div className="flex items-end justify-between gap-4 mb-4 lg:mb-5">
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-2">
              Global
            </div>
            <h2
              id="leaderboard-heading"
              className="font-display italic text-[26px] lg:text-[34px] font-bold tracking-[-0.02em] leading-[0.95] text-ink"
            >
              Standings
            </h2>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {leaderboard.length > 0 && (
              <span className="text-[12px] text-faint font-tight tabular">
                {leaderboard.length} team{leaderboard.length !== 1 ? 's' : ''}
              </span>
            )}
            <FantasyRulesModal label="Rules" autoOpenOnceKey="fantasy_rules_seen_v1" />
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
            <p className="text-muted font-tight text-[14px]">
              No teams yet — be the first to build one.
            </p>
            <Link
              href="/fantasy/team"
              className={[
                'inline-flex items-center gap-1.5 mt-4',
                'text-accent font-tight text-[13px] font-bold tracking-[0.04em]',
                'hover:opacity-80 transition-opacity duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
              ].join(' ')}
            >
              Build your team
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M3 7h8M8 4l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        ) : (
          <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
            {/* Column headers — hidden on small screens (info is self-evident) */}
            <div className="hidden sm:grid grid-cols-[2.5rem_1fr_auto] items-center px-5 py-3">
              <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
                #
              </span>
              <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
                Team
              </span>
              <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight text-right">
                Pts
              </span>
            </div>

            <ol aria-label="Fantasy leaderboard">
              {leaderboard.map((row, idx) => {
                const rank = idx + 1;
                const isTop3 = rank <= 3;
                return (
                  <li key={row.teamId}>
                    <Link
                      href={`/fantasy/team/${row.teamId}`}
                      className={[
                        'grid grid-cols-[2.5rem_1fr_auto] items-center px-5 py-3.5',
                        'no-underline transition-colors duration-150',
                        'hover:bg-surface-hi',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                        'border-t border-hairline sm:first:border-t-0',
                      ].join(' ')}
                    >
                      {/* Rank */}
                      <span
                        className={[
                          'font-tight text-[13px] font-bold tabular',
                          isTop3 ? 'text-accent' : 'text-faint',
                        ].join(' ')}
                        aria-label={`Rank ${rank}`}
                      >
                        {rank}
                      </span>

                      {/* Team name + owner display name (no @handle) */}
                      <span className="min-w-0 flex flex-col gap-0.5">
                        <span className="font-tight text-[14px] font-semibold text-ink truncate">
                          {row.teamName}
                        </span>
                        {(row.ownerDisplayName || row.ownerUsername) && (
                          <span className="font-tight text-[11px] text-muted truncate">
                            {row.ownerDisplayName ?? row.ownerUsername}
                          </span>
                        )}
                      </span>

                      {/* Points */}
                      <span className="font-tight text-[15px] font-bold tabular text-right text-ink">
                        {row.totalPoints}
                        <span className="text-[11px] font-medium text-faint ml-1">pts</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>

            {leaderboard.length >= 200 && (
              <div className="px-5 py-3 border-t border-hairline text-center">
                <span className="text-[11px] text-faint font-tight">Showing top 200 teams</span>
              </div>
            )}
          </div>
        )}
      </section>
    </PageShell>
  );
}
