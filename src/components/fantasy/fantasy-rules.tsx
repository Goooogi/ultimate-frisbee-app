// Fantasy rules + scoring content. Presentational Server Component (reads the
// SCORING constant only).
//
// The rules now live in a modal (see FantasyRulesModal), so this file exposes
// the *content* (`FantasyRulesContent`) separately from any card chrome. The
// legacy `FantasyRules` card wrapper is kept for the optional `showCta` inline
// use, but the primary surfaces (leaderboard + My Team) trigger the modal.

import Link from 'next/link';
import { SCORING } from '@/lib/fantasy/scoring';

const SCORING_ROWS: { stat: string; off: string; def: string; neg: boolean }[] = [
  { stat: 'Goal', off: `+${SCORING.offender.goal}`, def: `+${SCORING.defender.goal}`, neg: false },
  { stat: 'Assist', off: `+${SCORING.offender.assist}`, def: `+${SCORING.defender.assist}`, neg: false },
  { stat: 'Block', off: `+${SCORING.offender.block}`, def: `+${SCORING.defender.block}`, neg: false },
  { stat: 'Turnover', off: `${SCORING.offender.turnover}`, def: `${SCORING.defender.turnover}`, neg: true },
  { stat: 'Yards (per 100)', off: '+1', def: '+1', neg: false },
];

/**
 * The rules body — heading, explainer, and scoring table. No outer card; the
 * caller (inline card or modal) supplies the surrounding chrome. `headingId`
 * lets the container wire aria-labelledby to the heading.
 */
export function FantasyRulesContent({ headingId }: { headingId?: string }) {
  return (
    <>
      {/* Beta pill + explanation */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-2.5 py-[3px] rounded-full text-[9px] font-bold tracking-[0.14em] uppercase bg-accent text-accent-ink">
            Beta
          </span>
        </div>
        <h2
          id={headingId}
          className="font-display italic text-[22px] lg:text-[28px] font-bold tracking-[-0.02em] text-ink leading-[0.95] mb-2"
        >
          Build a seven-player roster.
          <br className="hidden sm:block" /> Compete on one global leaderboard.
        </h2>
        <p className="text-muted font-tight text-[14px] lg:text-[15px] leading-relaxed max-w-[560px]">
          Draft 4 offenders and 3 defenders from across the UFA. The role you assign each
          player skews how their stats score — a defender&apos;s block pays{' '}
          <span className="text-ink font-semibold">{SCORING.defender.block} pts</span> vs{' '}
          <span className="text-ink font-semibold">{SCORING.offender.block} pts</span> as an
          offender. Your roster locks when the week&apos;s first game starts and reopens
          Monday, so set your lineup before kickoff.
        </p>
      </div>

      {/* Scoring table */}
      <div>
        <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3">
          Scoring
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[320px]" aria-label="Fantasy scoring table">
            <thead>
              <tr>
                <th scope="col" className="pb-2 pr-6 text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
                  Stat
                </th>
                <th scope="col" className="pb-2 pr-6 text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight text-right">
                  Offender
                </th>
                <th scope="col" className="pb-2 text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight text-right">
                  Defender
                </th>
              </tr>
            </thead>
            <tbody>
              {SCORING_ROWS.map((row) => (
                <tr key={row.stat} className="border-t border-hairline">
                  <td className="py-2.5 pr-6 font-tight text-[13px] font-medium text-ink">{row.stat}</td>
                  <td
                    className={[
                      'py-2.5 pr-6 font-tight text-[13px] font-bold tabular text-right',
                      row.neg ? 'text-live' : 'text-ink',
                    ].join(' ')}
                  >
                    {row.off}
                  </td>
                  <td
                    className={[
                      'py-2.5 font-tight text-[13px] font-bold tabular text-right',
                      row.neg ? 'text-live' : 'text-accent',
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
    </>
  );
}

interface FantasyRulesProps {
  /** Show the "Build your team" CTA row at the bottom (default false). */
  showCta?: boolean;
}

/**
 * Inline rules card. Retained for surfaces that want the rules rendered in
 * place (with an optional CTA) rather than behind the modal trigger.
 */
export function FantasyRules({ showCta = false }: FantasyRulesProps) {
  return (
    <section aria-labelledby="fantasy-rules-heading" className="mb-8">
      <div className="bg-surface rounded-card-lg shadow-card p-6 lg:p-8">
        <FantasyRulesContent headingId="fantasy-rules-heading" />

        {showCta && (
          <div className="mt-6 pt-5 border-t border-hairline flex flex-col sm:flex-row sm:items-center gap-3">
            <Link
              href="/fantasy/team"
              className={[
                'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full',
                'bg-accent text-accent-ink',
                'font-tight text-[13px] font-bold tracking-[0.06em] uppercase',
                'transition-opacity duration-150 hover:opacity-90 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              ].join(' ')}
            >
              Build your team
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <p className="text-[11px] text-faint font-tight">
              Free to play. Sign in required only to save your roster.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
