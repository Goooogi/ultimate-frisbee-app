'use client';

// RivalsBoard — Play tab panel showing this week's Rivals tier ladder +
// Claim, plus last week's tiers if they're still claimable. Sits below
// PvpHistory on the mode-select screen (rivals.ts weekly.rivals). The mode
// card (draft-mode.tsx RivalsModeCard) only has room for points + W-D-L; the
// full ladder and claim flow live here since every claim opens a picked
// reward pack via the same handleOpenRewardPack entry point as everywhere
// else in the game.

import type { RivalsWeek } from '@/lib/utcg/rivals';
import { RIVALS_TIERS, rivalsTier } from '@/lib/utcg/rivals';
import { PACKS } from '@/lib/utcg/packs';

interface RivalsBoardProps {
  rivals: RivalsWeek | null;
  onClaim: (weekKey: string) => void;
  claimingWeek: string | null;
  claimError: string | null;
  /** Withdraw a parked squad. This is the ONLY place a parked squad can be
   *  withdrawn on a fresh page load — RivalsResult's own Withdraw button only
   *  exists in the session that just parked it, so a reload with an open
   *  squad needs this panel to offer it too (mirrors PvpHistory's openSquad
   *  row + the mode card's "Withdraw below to re-enter" copy). */
  onWithdraw: () => void;
  withdrawing: boolean;
  /** Surfaced HERE because this is the only Withdraw entry point reachable
   *  from a fresh page load (RivalsResult's own error only renders while
   *  buildPhase==='result', which a reload never is). */
  withdrawError: string | null;
}

export function RivalsBoard({ rivals, onClaim, claimingWeek, claimError, onWithdraw, withdrawing, withdrawError }: RivalsBoardProps) {
  if (!rivals) return null;

  const tier = rivalsTier(rivals.points);
  const hasUnclaimed = tier > rivals.claimedTier;

  const lastWeek = rivals.lastWeek;
  const lastTier = lastWeek ? rivalsTier(lastWeek.points) : 0;
  const lastHasUnclaimed = !!lastWeek && lastTier > lastWeek.claimedTier;

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto w-full rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">Rivals tiers</p>
        <span className="text-[10.5px] font-semibold text-faint font-tight tabular">{rivals.points} pts this week</span>
      </div>

      {claimError && (
        <p className="text-[12px] text-live font-tight" role="alert">{claimError}</p>
      )}

      {rivals.openSquad && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 rounded-card bg-ink/[0.03] px-3.5 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-accent motion-safe:animate-pulse flex-shrink-0" aria-hidden="true" />
              <span className="text-[12px] font-semibold text-ink font-tight truncate">
                Your Rivals squad is parked
              </span>
            </div>
            <button
              type="button"
              onClick={onWithdraw}
              disabled={withdrawing}
              className={[
                'inline-flex items-center justify-center px-4 py-2 rounded-full flex-shrink-0 min-h-[36px]',
                'text-[10.5px] font-bold uppercase tracking-[0.06em] font-tight',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'motion-safe:transition-opacity motion-safe:duration-150',
                withdrawing ? 'bg-ink/10 text-faint cursor-wait' : 'bg-ink text-bg hover:opacity-90 cursor-pointer',
              ].join(' ')}
            >
              {withdrawing ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </div>
          {withdrawError && (
            <p className="text-[12px] text-live font-tight" role="alert">{withdrawError}</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {RIVALS_TIERS.map((t) => {
          const reached = rivals.points >= t.points;
          const claimed = rivals.claimedTier >= t.tier;
          return (
            <div key={t.tier} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={[
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    claimed ? 'bg-accent' : reached ? 'bg-ink' : 'bg-ink/15',
                  ].join(' ')}
                  aria-hidden="true"
                />
                <span className="text-[12px] font-bold text-ink font-tight truncate">
                  Tier {t.tier} · {t.points}+ pts
                </span>
              </div>
              <span className="text-[10.5px] font-semibold text-faint font-tight flex-shrink-0">
                {claimed ? 'Claimed' : PACKS[t.pack].name}
              </span>
            </div>
          );
        })}
      </div>

      {hasUnclaimed && (
        <ClaimRow
          label={`Claim tier ${tier} reward${tier > rivals.claimedTier + 1 ? 's' : ''}`}
          onClick={() => onClaim(rivals.weekKey)}
          claiming={claimingWeek === rivals.weekKey}
        />
      )}

      {lastWeek && lastHasUnclaimed && (
        <>
          <span className="h-px bg-hairline -mx-4" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-faint font-tight">
              Last week: {lastWeek.points} pts, tier {lastTier} unclaimed
            </p>
            <ClaimRow
              label="Claim last week"
              onClick={() => onClaim(lastWeek.weekKey)}
              claiming={claimingWeek === lastWeek.weekKey}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ClaimRow({ label, onClick, claiming }: { label: string; onClick: () => void; claiming: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={claiming}
      className={[
        'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full flex-shrink-0 min-h-[36px]',
        'text-[10.5px] font-bold uppercase tracking-[0.06em] font-tight',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'motion-safe:transition-opacity motion-safe:duration-150',
        claiming ? 'bg-accent/60 text-accent-ink cursor-wait' : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
      ].join(' ')}
    >
      {claiming ? 'Claiming…' : label}
    </button>
  );
}
