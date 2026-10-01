'use client';

// ProgressHub — compact panel at the top of the Play tab's mode-select screen
// (same slot as PvpHistory below it). Surfaces the whole progression system in
// one glance: season level + XP, streak, daily/weekly objectives, and any
// unopened reward packs — everything else in progression.ts/brawl.ts/sinks.ts
// is reachable from here or from the mode cards / Collection tab.
//
// Every claim/open here follows the app's own reconcile pattern (see
// handleClaimObjective / handleOpenRewardPack in utcg-game.tsx): optimistic
// local removal on success, then router.refresh() folds the authoritative
// snapshot back in.

import type { ProgressState, Objective, RewardPack } from '@/lib/utcg/progression';
import { SEASON_XP_PER_LEVEL, SEASON_MAX_LEVEL, MAX_STREAK_FREEZES, seasonLevelReward } from '@/lib/utcg/progression';
import type { PackKind } from '@/lib/utcg/packs';
import { PACKS } from '@/lib/utcg/packs';
import { CoinGlyph } from '@/components/utcg/coin-glyph';

interface ProgressHubProps {
  progress: ProgressState;
  onClaimObjective: (key: string, periodKey: string) => void;
  claimingKey: string | null;
  claimError: string | null;
  onOpenRewardPack: (id: string, packKind: PackKind) => void;
  openingRewardId: string | null;
}

function daysLeft(endsOnExclusive: string): number {
  const end = new Date(`${endsOnExclusive}T00:00:00Z`).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

export function ProgressHub({
  progress,
  onClaimObjective,
  claimingKey,
  claimError,
  onOpenRewardPack,
  openingRewardId,
}: ProgressHubProps) {
  const { season, streak, objectives, rewardPacks } = progress;
  const daily = objectives.filter((o) => o.period === 'daily').sort((a, b) => a.slot - b.slot);
  const weekly = objectives.filter((o) => o.period === 'weekly').sort((a, b) => a.slot - b.slot);

  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {season && <SeasonCard season={season} />}
        {streak && <StreakCard streak={streak} />}
      </div>

      {(daily.length > 0 || weekly.length > 0) && (
        <div className="rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">Objectives</p>
          {claimError && (
            <p className="text-[12px] text-live font-tight" role="alert">{claimError}</p>
          )}
          <div className="flex flex-col gap-2">
            {daily.map((o) => (
              <ObjectiveRow key={o.key} objective={o} onClaim={onClaimObjective} claiming={claimingKey === o.key} />
            ))}
            {daily.length > 0 && weekly.length > 0 && <span className="h-px bg-hairline -mx-4" aria-hidden="true" />}
            {weekly.map((o) => (
              <ObjectiveRow key={o.key} objective={o} onClaim={onClaimObjective} claiming={claimingKey === o.key} />
            ))}
          </div>
        </div>
      )}

      {rewardPacks.length > 0 && (
        <div className="rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-2.5">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
            Unopened packs
          </p>
          <div className="flex flex-col gap-2">
            {rewardPacks.map((p) => (
              <RewardPackRow key={p.id} pack={p} onOpen={onOpenRewardPack} opening={openingRewardId === p.id} />
            ))}
          </div>
        </div>
      )}

      <p className="text-[10.5px] text-faint font-tight leading-relaxed px-1">
        Reward cards are untradeable — they play, but can&rsquo;t be listed, offered, or quicksold. Weekly
        packs and the Brawl/Boss reset Monday 00:00 UTC; dailies reset 00:00 UTC.
      </p>
    </div>
  );
}

function SeasonCard({ season }: { season: NonNullable<ProgressState['season']> }) {
  const maxed = season.level >= SEASON_MAX_LEVEL;
  const inLevelXp = season.xp % SEASON_XP_PER_LEVEL;
  const pct = maxed ? 100 : Math.min(100, (inLevelXp / SEASON_XP_PER_LEVEL) * 100);
  const next = maxed ? null : seasonLevelReward(season.level + 1);
  const left = daysLeft(season.endsOn);

  return (
    <div className="rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight truncate">
          {season.name}
        </p>
        <span className="text-[10px] font-semibold text-faint font-tight tabular flex-shrink-0">
          {left === 0 ? 'Ends today' : `${left}d left`}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display italic font-bold text-2xl text-ink leading-none tabular">
          Lvl {season.level}
        </span>
        {!maxed && (
          <span className="text-[11px] font-semibold text-faint font-tight tabular">
            {inLevelXp}/{SEASON_XP_PER_LEVEL} XP
          </span>
        )}
      </div>
      <div
        className="h-1.5 rounded-full bg-ink/10 overflow-hidden"
        role="progressbar"
        aria-label="Season XP to next level"
        aria-valuenow={maxed ? SEASON_XP_PER_LEVEL : inLevelXp}
        aria-valuemin={0}
        aria-valuemax={SEASON_XP_PER_LEVEL}
      >
        <div className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-500 w-[var(--pct)]" style={{ '--pct': `${pct}%` } as React.CSSProperties} />
      </div>
      <p className="text-[10.5px] text-faint font-tight">
        {maxed
          ? 'Max level reached this season'
          : next
            ? `Next: +${next.coins} coins${next.pack ? ` + ${PACKS[next.pack].name}` : ''} at Lvl ${season.level + 1}`
            : `Next level at ${SEASON_XP_PER_LEVEL} XP`}
      </p>
    </div>
  );
}

function StreakCard({ streak }: { streak: NonNullable<ProgressState['streak']> }) {
  return (
    <div className="rounded-card-lg bg-surface shadow-card p-4 flex flex-col gap-2">
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">Play Streak</p>
      <div className="flex items-baseline gap-2">
        <span className="font-display italic font-bold text-2xl text-ink leading-none tabular">
          {streak.days} {streak.days === 1 ? 'day' : 'days'}
        </span>
        <span className="text-[11px] font-semibold text-faint font-tight tabular">best {streak.best}</span>
      </div>
      <div className="flex items-center gap-1.5" aria-label={`${streak.freezes} of ${MAX_STREAK_FREEZES} streak freezes banked`}>
        {Array.from({ length: MAX_STREAK_FREEZES }).map((_, i) => (
          <ShieldGlyph key={i} filled={i < streak.freezes} />
        ))}
        <span className="text-[10px] text-faint font-tight ml-0.5">
          {streak.freezes} freeze{streak.freezes === 1 ? '' : 's'} banked
        </span>
      </div>
      {!streak.playedToday && (
        <p className="text-[10.5px] text-accent font-bold font-tight">Play today to keep your streak.</p>
      )}
    </div>
  );
}

function ShieldGlyph({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className={filled ? 'text-accent' : 'text-ink/15'}>
      <path
        d="M7 1.2l4.6 1.7v3.6c0 3-1.9 5.2-4.6 6.3C4.3 11.7 2.4 9.5 2.4 6.5V2.9L7 1.2z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ObjectiveRow({
  objective,
  onClaim,
  claiming,
}: {
  objective: Objective;
  onClaim: (key: string, periodKey: string) => void;
  claiming: boolean;
}) {
  const pct = Math.min(100, (objective.progress / objective.target) * 100);
  const canClaim = objective.completed && !objective.claimed;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <p className="text-[12px] font-bold text-ink font-tight truncate">{objective.label}</p>
          <span className="text-[10.5px] font-semibold text-faint font-tight tabular flex-shrink-0">
            {Math.min(objective.progress, objective.target)}/{objective.target}
          </span>
        </div>
        <div
          className="h-1.5 rounded-full bg-ink/10 overflow-hidden"
          role="progressbar"
          aria-label={`${objective.label} progress`}
          aria-valuenow={Math.min(objective.progress, objective.target)}
          aria-valuemin={0}
          aria-valuemax={objective.target}
        >
          <div
            className={['h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 w-[var(--pct)]', objective.claimed ? 'bg-ink/20' : 'bg-accent'].join(' ')}
            style={{ '--pct': `${pct}%` } as React.CSSProperties}
          />
        </div>
      </div>
      {objective.claimed ? (
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint font-tight flex-shrink-0">
          Claimed
        </span>
      ) : canClaim ? (
        <button
          type="button"
          onClick={() => onClaim(objective.key, objective.periodKey)}
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
        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-faint font-tight tabular flex-shrink-0">
          <CoinGlyph size={11} className="text-faint" />
          {objective.rewardCoins}
        </span>
      )}
    </div>
  );
}

function RewardPackRow({
  pack,
  onOpen,
  opening,
}: {
  pack: RewardPack;
  onOpen: (id: string, packKind: PackKind) => void;
  opening: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[12.5px] font-bold text-ink font-tight truncate">{PACKS[pack.packKind].name}</p>
        <p className="text-[10.5px] text-faint font-tight truncate">{rewardSourceLabel(pack.source)}</p>
      </div>
      <button
        type="button"
        onClick={() => onOpen(pack.id, pack.packKind)}
        disabled={opening}
        className={[
          'inline-flex items-center justify-center px-4 py-2 rounded-full flex-shrink-0 min-h-[36px]',
          'text-[10.5px] font-bold uppercase tracking-[0.06em] font-tight',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'motion-safe:transition-opacity motion-safe:duration-150',
          opening ? 'bg-ink/10 text-faint cursor-wait' : 'bg-ink text-bg hover:opacity-90 cursor-pointer',
        ].join(' ')}
      >
        {opening ? 'Opening…' : 'Open'}
      </button>
    </div>
  );
}

// 'season:1:L5' / 'streak:7' / 'brawl:2026-W40' / 'boss:2026-W40' / 'sbc:<key>'
// / 'rivals:2026-W40' / 'flash:<key>'
function rewardSourceLabel(source: string): string {
  const [kind] = source.split(':');
  switch (kind) {
    case 'season': return 'Season level reward';
    case 'streak': return 'Streak milestone';
    case 'brawl': return 'Weekly Brawl win';
    case 'boss': return 'Featured Boss win';
    case 'sbc': return 'Squad Building Challenge';
    case 'rivals': return 'Rivals tier reward';
    case 'flash': return 'Flash challenge';
    default: return 'Reward pack';
  }
}
