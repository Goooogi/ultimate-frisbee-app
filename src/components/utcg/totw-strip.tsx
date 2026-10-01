'use client';

// TotwStrip — Play tab showcase for this week's Team of the Week + Flash
// challenges (boosts.ts WeekExtras). Sits below ProgressHub on the
// mode-select screen. TOTW cards are a LEAN shape (name/teamAbbr/year/score,
// no photo/position/stats), not a full UtcgCard — building a fake UtcgCard to
// reuse CardTile would fabricate fields CardTile depends on (position for the
// label, headshotUrl, goals/assists/blocks for the stat bar), so this renders
// its own compact mini-tile using teamMeta() for real team colors instead
// (matches the app's "always resolve colors via teamMeta" convention).

import type { TotwCard, FlashChallenge } from '@/lib/utcg/boosts';
import { TOTW_BOOST } from '@/lib/utcg/boosts';
import { PACKS } from '@/lib/utcg/packs';
import { teamMeta } from '@/lib/ufa/teams';
import { TeamLogo } from '@/components/team-logo';

interface TotwStripProps {
  totw: TotwCard[];
  flash: FlashChallenge[];
  onClaimFlash: (key: string) => void;
  claimingFlashKey: string | null;
  claimError: string | null;
}

export function TotwStrip({ totw, flash, onClaimFlash, claimingFlashKey, claimError }: TotwStripProps) {
  if (totw.length === 0 && flash.length === 0) return null;

  const ownedCount = totw.filter((c) => c.owned).length;

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto w-full flex flex-col gap-3">
      {totw.length > 0 && (
        <div className="rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
                {totw[0].label}
              </p>
              <p className="text-[12px] text-muted font-tight mt-0.5">
                In Form this week: +{TOTW_BOOST} in every mode
              </p>
            </div>
            <span className="text-[10.5px] font-semibold text-faint font-tight tabular flex-shrink-0">
              {ownedCount}/{totw.length} owned
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {totw.map((c) => (
              <TotwMiniCard key={`${c.playerId}|${c.teamSlug}|${c.year}`} card={c} />
            ))}
          </div>
        </div>
      )}

      {flash.length > 0 && (
        <div className="rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-2.5">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">Flash challenge</p>
          {claimError && (
            <p className="text-[12px] text-live font-tight" role="alert">{claimError}</p>
          )}
          <div className="flex flex-col gap-2">
            {flash.map((f) => (
              <FlashRow
                key={f.key}
                challenge={f}
                ownedCount={ownedCount}
                onClaim={onClaimFlash}
                claiming={claimingFlashKey === f.key}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TotwMiniCard({ card }: { card: TotwCard }) {
  const meta = teamMeta(card.teamSlug);
  return (
    <div
      className={[
        'relative rounded-card p-1.5 flex flex-col items-center gap-1 text-center',
        card.owned ? 'bg-accent/10' : 'bg-ink/[0.03]',
      ].join(' ')}
      title={`${card.name}, ${card.teamAbbr} ${card.year} · ${card.score.toFixed(0)} +${card.boost}`}
    >
      <TeamLogo team={meta} size={28} />
      <span className="text-[9.5px] font-bold text-ink font-tight leading-tight truncate w-full">{card.name}</span>
      <span className="text-[8.5px] font-semibold text-faint font-tight tabular leading-none">
        {card.score.toFixed(0)} <span className="text-accent">+{card.boost}</span>
      </span>
      {card.owned && (
        <span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-accent-ink flex items-center justify-center"
          aria-label="Owned"
        >
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  );
}

function FlashRow({
  challenge,
  ownedCount,
  onClaim,
  claiming,
}: {
  challenge: FlashChallenge;
  ownedCount: number;
  onClaim: (key: string) => void;
  claiming: boolean;
}) {
  const progress = Math.min(ownedCount, challenge.target);
  const pct = Math.min(100, (progress / challenge.target) * 100);
  const canClaim = !challenge.claimed && progress >= challenge.target;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <p className="text-[12px] font-bold text-ink font-tight truncate">{challenge.label}</p>
          <span className="text-[10.5px] font-semibold text-faint font-tight tabular flex-shrink-0">
            {progress}/{challenge.target}
          </span>
        </div>
        <div
          className="h-1.5 rounded-full bg-ink/10 overflow-hidden"
          role="progressbar"
          aria-label={`${challenge.label} progress`}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={challenge.target}
        >
          <div
            className={['h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 w-[var(--pct)]', challenge.claimed ? 'bg-ink/20' : 'bg-accent'].join(' ')}
            style={{ '--pct': `${pct}%` } as React.CSSProperties}
          />
        </div>
      </div>
      {challenge.claimed ? (
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint font-tight flex-shrink-0">Claimed</span>
      ) : canClaim ? (
        <button
          type="button"
          onClick={() => onClaim(challenge.key)}
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
      ) : (
        <span className="text-[10px] font-semibold text-faint font-tight flex-shrink-0">{PACKS[challenge.rewardPack].name}</span>
      )}
    </div>
  );
}
