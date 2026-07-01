// Fantasy Beta — public landing page. Server Component.
// Auth is NOT required to view this page (leaderboard + rules are public).
// The CTA "Build your team" links to /fantasy/team — auth is deferred until
// the user attempts a WRITE action inside the builder.

import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { getLeaderboard } from '@/lib/fantasy/data';
import { SCORING } from '@/lib/fantasy/scoring';

export const revalidate = 60;

export default async function FantasyLandingPage() {
  const leaderboard = await getLeaderboard().catch(() => []);

  return (
    <PageShell
      title="Fantasy"
      eyebrow="Fantasy · Beta"
      subtitle="Pick your seven. Own the season."
    >
      {/* ── Hero / Rules ──────────────────────────────────────────────────── */}
      <section aria-labelledby="fantasy-rules-heading" className="mb-10">
        <div className="rounded-lg border border-border bg-surface p-6 lg:p-8">
          {/* Beta pill + explanation */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-[0.14em] uppercase bg-accent text-[rgb(var(--accent-ink))]">
                Beta
              </span>
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
                Soccer-Style Free-for-All
              </span>
            </div>
            <h2
              id="fantasy-rules-heading"
              className="font-tight text-[22px] lg:text-[28px] font-bold tracking-[-0.03em] text-ink leading-tight mb-2"
            >
              Build a seven-player roster.
              <br className="hidden sm:block" /> Compete on one global leaderboard.
            </h2>
            <p className="text-muted font-tight text-[14px] lg:text-[15px] leading-relaxed max-w-[560px]">
              Draft 4 offenders and 3 defenders from across the UFA. The role you assign each
              player skews how their stats score — a defender&apos;s block pays{' '}
              <span className="text-ink font-semibold">{SCORING.defender.block} pts</span>{' '}
              vs{' '}
              <span className="text-ink font-semibold">{SCORING.offender.block} pts</span>{' '}
              as an offender. Make the call before the week locks.
            </p>
          </div>

          {/* Scoring table */}
          <div>
            <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3">
              Scoring
            </div>
            <div className="overflow-x-auto">
              <table
                className="w-full text-left border-collapse min-w-[320px]"
                aria-label="Fantasy scoring table"
              >
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="pb-2 pr-6 text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight"
                    >
                      Stat
                    </th>
                    <th
                      scope="col"
                      className="pb-2 pr-6 text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight text-right"
                    >
                      Offender
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight text-right"
                    >
                      Defender
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      {
                        stat: 'Goal',
                        off: `+${SCORING.offender.goal}`,
                        def: `+${SCORING.defender.goal}`,
                        neg: false,
                      },
                      {
                        stat: 'Assist',
                        off: `+${SCORING.offender.assist}`,
                        def: `+${SCORING.defender.assist}`,
                        neg: false,
                      },
                      {
                        stat: 'Block',
                        off: `+${SCORING.offender.block}`,
                        def: `+${SCORING.defender.block}`,
                        neg: false,
                      },
                      {
                        stat: 'Turnover',
                        off: `${SCORING.offender.turnover}`,
                        def: `${SCORING.defender.turnover}`,
                        neg: true,
                      },
                      {
                        stat: 'Yards (per 100)',
                        off: '+1',
                        def: '+1',
                        neg: false,
                      },
                    ] as { stat: string; off: string; def: string; neg: boolean }[]
                  ).map((row) => (
                    <tr key={row.stat} className="border-t border-hairline">
                      <td className="py-2.5 pr-6 font-tight text-[13px] font-medium text-ink">
                        {row.stat}
                      </td>
                      <td
                        className={[
                          'py-2.5 pr-6 font-tight text-[13px] font-bold tabular text-right',
                          row.neg ? 'text-[rgb(var(--live))]' : 'text-ink',
                        ].join(' ')}
                      >
                        {row.off}
                      </td>
                      <td
                        className={[
                          'py-2.5 font-tight text-[13px] font-bold tabular text-right',
                          row.neg ? 'text-[rgb(var(--live))]' : 'text-accent',
                        ].join(' ')}
                      >
                        {row.def}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-faint font-tight">
              Defender column in coral — defenders earn more per block. Points accumulate
              week-by-week.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-6 pt-5 border-t border-hairline flex flex-col sm:flex-row sm:items-center gap-3">
            <Link
              href="/fantasy/team"
              className={[
                'inline-flex items-center justify-center gap-2',
                'px-6 py-3 rounded-md',
                'bg-accent text-[rgb(var(--accent-ink))]',
                'font-tight text-[13px] font-bold tracking-[0.06em] uppercase',
                'transition-opacity duration-150 hover:opacity-90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                'cursor-pointer',
              ].join(' ')}
            >
              Build your team
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M3 7h8M8 4l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <p className="text-[11px] text-faint font-tight">
              Free to play. Sign in required only to save your roster.
            </p>
          </div>
        </div>
      </section>

      {/* ── Global Leaderboard ────────────────────────────────────────────── */}
      <section aria-labelledby="leaderboard-heading">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-1">
              Global
            </div>
            <h2
              id="leaderboard-heading"
              className="font-tight text-[20px] lg:text-[24px] font-bold tracking-[-0.03em] text-ink leading-none"
            >
              Leaderboard
            </h2>
          </div>
          {leaderboard.length > 0 && (
            <span className="text-[12px] text-faint font-tight tabular flex-shrink-0">
              {leaderboard.length} team{leaderboard.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {leaderboard.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-10 text-center">
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
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            {/* Column headers — hidden on small screens (info is self-evident) */}
            <div className="hidden sm:grid grid-cols-[2.5rem_1fr_auto] items-center px-4 py-2.5 border-b border-hairline">
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
                        'grid grid-cols-[2.5rem_1fr_auto] items-center px-4 py-3.5',
                        'no-underline transition-colors duration-150',
                        'hover:bg-[rgb(var(--surface-hi))]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                        idx > 0 ? 'border-t border-hairline' : '',
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

                      {/* Team name + owner handle */}
                      <span className="min-w-0 flex flex-col gap-0.5">
                        <span className="font-tight text-[14px] font-semibold text-ink truncate">
                          {row.teamName}
                        </span>
                        {row.ownerUsername && (
                          <span className="font-tight text-[11px] text-muted truncate">
                            @{row.ownerUsername}
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
              <div className="px-4 py-3 border-t border-hairline text-center">
                <span className="text-[11px] text-faint font-tight">Showing top 200 teams</span>
              </div>
            )}
          </div>
        )}
      </section>
    </PageShell>
  );
}
