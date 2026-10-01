'use client';

// CollectionGoals — Collection tab's "Goals" sub-tab: distinct-card
// milestones, per-team-set progress, and the pack-points/pity readout. Pure
// display + Claim buttons; utcg-game.tsx owns the claim/craft mutations.

import type { CollectionState } from '@/lib/utcg/sinks';
import { DISTINCT_MILESTONES, TEAM_SET_SIZE, TEAM_SET_PACK, PITY_PACKS, PACK_POINTS_PER_PACK } from '@/lib/utcg/sinks';
import { PACKS } from '@/lib/utcg/packs';
import { teamMeta } from '@/lib/ufa/teams';
import { TeamLogo } from '@/components/team-logo';
import { CoinGlyph } from '@/components/utcg/coin-glyph';

interface CollectionGoalsProps {
  collection: CollectionState;
  onClaimMilestone: (milestone: string) => void;
  claimingMilestone: string | null;
  claimError: string | null;
}

export function CollectionGoals({ collection, onClaimMilestone, claimingMilestone, claimError }: CollectionGoalsProps) {
  const { distinctCards, milestonesClaimed, teamSets, packPoints, pityCounter } = collection;

  const nextDistinct = DISTINCT_MILESTONES.find((m) => !milestonesClaimed.includes(`distinct:${m.threshold}`));
  const distinctReadyToClaim =
    nextDistinct && distinctCards >= nextDistinct.threshold && !milestonesClaimed.includes(`distinct:${nextDistinct.threshold}`);

  const packsUntilPity = Math.max(0, PITY_PACKS - pityCounter);

  return (
    <div className="flex flex-col gap-4">
      {claimError && (
        <p className="text-[12px] text-live font-tight" role="alert">{claimError}</p>
      )}

      {/* Distinct-card milestones */}
      <div className="rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">Distinct Cards</p>
          <span className="font-display italic font-bold text-xl text-ink tabular leading-none">
            {distinctCards}
          </span>
        </div>
        {nextDistinct ? (
          <>
            <div
              className="h-1.5 rounded-full bg-ink/10 overflow-hidden"
              role="progressbar"
              aria-label="Progress to next distinct-card milestone"
              aria-valuenow={Math.min(distinctCards, nextDistinct.threshold)}
              aria-valuemin={0}
              aria-valuemax={nextDistinct.threshold}
            >
              <div
                className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-500 w-[var(--pct)]"
                style={{ '--pct': `${Math.min(100, (distinctCards / nextDistinct.threshold) * 100)}%` } as React.CSSProperties}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-faint font-tight">
                {Math.min(distinctCards, nextDistinct.threshold)}/{nextDistinct.threshold} · next reward {PACKS[nextDistinct.pack].name}
              </p>
              {distinctReadyToClaim && (
                <ClaimButton
                  onClick={() => onClaimMilestone(`distinct:${nextDistinct.threshold}`)}
                  claiming={claimingMilestone === `distinct:${nextDistinct.threshold}`}
                />
              )}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-faint font-tight">All distinct-card milestones claimed.</p>
        )}
      </div>

      {/* Team sets */}
      {teamSets.length > 0 && (
        <div className="rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
            Team Sets · {TEAM_SET_SIZE} distinct players, one franchise-season
          </p>
          <div className="flex flex-col gap-2.5">
            {teamSets.map((t) => {
              const milestone = `team_set:${t.teamSlug}:${t.year}`;
              const claimed = milestonesClaimed.includes(milestone);
              const ready = !claimed && t.have >= TEAM_SET_SIZE;
              const meta = teamMeta(t.teamSlug);
              return (
                <div key={milestone} className="flex items-center gap-3">
                  <TeamLogo team={meta} size={22} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <p className="text-[12px] font-bold text-ink font-tight truncate">{meta.abbr} · {t.year}</p>
                      <span className="text-[10.5px] font-semibold text-faint font-tight tabular flex-shrink-0">
                        {Math.min(t.have, TEAM_SET_SIZE)}/{TEAM_SET_SIZE}
                      </span>
                    </div>
                    <div
                      className="h-1.5 rounded-full bg-ink/10 overflow-hidden"
                      role="progressbar"
                      aria-label={`${meta.abbr} ${t.year} team set progress`}
                      aria-valuenow={Math.min(t.have, TEAM_SET_SIZE)}
                      aria-valuemin={0}
                      aria-valuemax={TEAM_SET_SIZE}
                    >
                      <div
                        className={['h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 w-[var(--pct)]', claimed ? 'bg-ink/20' : 'bg-accent'].join(' ')}
                        style={{ '--pct': `${Math.min(100, (t.have / TEAM_SET_SIZE) * 100)}%` } as React.CSSProperties}
                      />
                    </div>
                  </div>
                  {claimed ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint font-tight flex-shrink-0">Claimed</span>
                  ) : ready ? (
                    <ClaimButton onClick={() => onClaimMilestone(milestone)} claiming={claimingMilestone === milestone} />
                  ) : (
                    <span className="text-[10px] font-semibold text-faint font-tight flex-shrink-0">{PACKS[TEAM_SET_PACK].name}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pack points + pity */}
      <div className="rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-2">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">Pack Points &amp; Pity</p>
        <div className="flex items-baseline gap-2">
          <CoinGlyph size={16} className="text-accent" />
          <span className="font-display italic font-bold text-2xl text-ink leading-none tabular">
            {packPoints.toLocaleString()}
          </span>
          <span className="text-[11px] font-semibold text-faint font-tight">points</span>
        </div>
        <p className="text-[11px] text-faint font-tight">
          +{PACK_POINTS_PER_PACK} per bought or free pack. Spend points to craft a specific card from its detail sheet in the Cards tab.
        </p>
        <p className="text-[11px] text-ink font-semibold font-tight mt-1">
          {packsUntilPity === 0
            ? 'Your next pack is guaranteed an All-Time Elite or better.'
            : `All-Time Elite guaranteed in ${packsUntilPity} more pack${packsUntilPity === 1 ? '' : 's'} without one.`}
        </p>
      </div>
    </div>
  );
}

function ClaimButton({ onClick, claiming }: { onClick: () => void; claiming: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={claiming}
      className={[
        'inline-flex items-center gap-1 px-3.5 py-2 rounded-full flex-shrink-0 min-h-[36px]',
        'text-[10.5px] font-bold uppercase tracking-[0.06em] font-tight',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'motion-safe:transition-opacity motion-safe:duration-150',
        claiming ? 'bg-accent/60 text-accent-ink cursor-wait' : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
      ].join(' ')}
    >
      {claiming ? 'Claiming…' : 'Claim'}
    </button>
  );
}
