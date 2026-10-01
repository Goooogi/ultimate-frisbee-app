'use client';

// PlayModeSelect — the Play tab's entry point once a user has cards to build
// with. Two tappable cards in the app's card language: "Squad Battle" (the
// existing collection-based flow, unchanged beneath) and "Draft" (new — pay
// DRAFT_ENTRY_FEE, get dealt candidates per slot, gauntlet for coins). If a
// draft run is already active, the Draft card becomes "Resume Draft" and
// shows exactly where the run left off (drafting slot N, or gauntlet round N
// + bank) instead of the pitch copy.

import type { DraftRun } from '@/lib/utcg/draft';
import { DRAFT_ENTRY_FEE, DRAFT_TARGETS, DRAFT_REWARDS, DRAFT_JACKPOT } from '@/lib/utcg/draft';
import { DRAFT_PAID_RUNS_PER_DAY } from '@/lib/utcg/packs';
import { PVP_STAKE, PVP_RAKE_PCT } from '@/lib/utcg/actions';
import type { MarketAccess } from '@/lib/utcg/server';
import type { WeeklyState } from '@/lib/utcg/brawl';
import type { RivalsWeek } from '@/lib/utcg/rivals';
import { RIVALS_TIERS, rivalsTier } from '@/lib/utcg/rivals';
import { matchPayMultiplier } from '@/lib/utcg/progression';
import { CoinGlyph } from '@/components/utcg/coin-glyph';
import { MarketUnlockChecklist } from '@/components/utcg/market-unlock';

export type PlayMode = 'squad' | 'draft' | 'pvp' | 'brawl' | 'boss' | 'rivals';

const DRAFT_MAX_PAYOUT = DRAFT_REWARDS.reduce((s, r) => s + r, 0) + DRAFT_JACKPOT;
const PVP_NET_WIN = Math.round(PVP_STAKE * 2 * (1 - PVP_RAKE_PCT)) - PVP_STAKE;

// Squad Battle's pay-decay schedule, derived from matchPayMultiplier rather
// than hardcoded — groups consecutive matches-of-the-day that share a
// multiplier into one "N–M: X%" run (Hunter's standing rule: never hardcode
// a derivable value; this bit a prior pass on the market-unlock sentence).
function decaySchedule(): string {
  const runs: { from: number; to: number; pct: number }[] = [];
  for (let n = 1; n <= 20; n++) {
    const pct = Math.round(matchPayMultiplier(n) * 100);
    const last = runs[runs.length - 1];
    if (last && last.pct === pct) last.to = n;
    else runs.push({ from: n, to: n, pct });
    if (pct === 0) break;
  }
  return runs
    .filter((r) => r.pct > 0)
    .map((r) => (r.from === r.to ? `match ${r.from}: ${r.pct}%` : `${r.from}–${r.to}: ${r.pct}%`))
    .join(' · ');
}

interface PlayModeSelectProps {
  activeDraftRun: DraftRun | null;
  /** Paid draft runs left today (UTC); 0 = the next run is free practice. */
  draftPaidRunsLeft: number;
  marketAccess: MarketAccess | null;
  weekly: WeeklyState | null;
  onSelectSquad: () => void;
  onSelectDraft: () => void;
  onSelectPvp: () => void;
  onSelectBrawl: () => void;
  onSelectBoss: () => void;
  onSelectRivals: () => void;
}

export function PlayModeSelect({
  activeDraftRun,
  draftPaidRunsLeft,
  marketAccess,
  weekly,
  onSelectSquad,
  onSelectDraft,
  onSelectPvp,
  onSelectBrawl,
  onSelectBoss,
  onSelectRivals,
}: PlayModeSelectProps) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8 py-4 sm:py-8">
      <div className="text-center">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted font-tight mb-1.5 sm:mb-3">
          Play UTCG
        </p>
        <h2 className="font-display italic text-3xl sm:text-5xl font-bold text-ink leading-[0.95] tracking-[-0.02em]">
          Choose your <span className="text-accent">game</span>
        </h2>
        <p className="text-sm text-muted font-tight mt-2 sm:mt-3 max-w-[380px] mx-auto">
          Build from your collection, or draft a fresh squad from server-dealt cards and run the gauntlet for coins.
        </p>
      </div>

      {/* Three modes, three columns on desktop — 2-up left PvP stranded on its
          own half-width row. Stays 2-up at sm (tablet) and stacks on phones. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 max-w-2xl lg:max-w-5xl mx-auto w-full">
        <ModeCard
          eyebrow="Squad Battle"
          tag={{ label: 'Solo', tone: 'solo' }}
          title="Build & Play"
          tagline="Field a squad from your collection and simulate one match."
          onSelect={onSelectSquad}
          ariaLabel="Play Squad Battle — solo mode"
        >
          <p className="text-[9.5px] font-semibold text-faint font-tight leading-snug">
            Pay decays per match today: {decaySchedule()}
          </p>
        </ModeCard>
        <DraftModeCard activeDraftRun={activeDraftRun} draftPaidRunsLeft={draftPaidRunsLeft} onSelect={onSelectDraft} />
        <PvpModeCard marketAccess={marketAccess} onSelect={onSelectPvp} />
      </div>

      {weekly && (
        <div className="max-w-2xl lg:max-w-5xl mx-auto w-full flex flex-col gap-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight text-center sm:text-left">
            This week
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <BrawlModeCard brawl={weekly.brawl} onSelect={onSelectBrawl} />
            <BossModeCard boss={weekly.boss} onSelect={onSelectBoss} />
            <RivalsModeCard rivals={weekly.rivals} onSelect={onSelectRivals} />
          </div>
        </div>
      )}
    </div>
  );
}

function ModeCard({
  eyebrow,
  tag,
  title,
  tagline,
  onSelect,
  ariaLabel,
  disabled,
  children,
}: {
  eyebrow: string;
  /** Small pill next to the eyebrow marking a mode as single-player. Beta ask:
   *  it wasn't obvious Squad Battle is solo. PvP needs no counterpart tag — its
   *  "PvP" eyebrow and "Head to Head" title already say it. (A 'vs Player' tag
   *  existed briefly; its two-slashed-circles icon read as a "%" at 9px.) */
  tag?: { label: string; tone: 'solo' };
  title: string;
  tagline: string;
  onSelect: () => void;
  ariaLabel: string;
  /** Locked mode (e.g. PvP pre-unlock) — no hover-lift, no navigation; the
   *  reason lives in `children` (a checklist) instead of the usual pitch pill. */
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      disabled={disabled}
      className={[
        'group text-left rounded-card-lg bg-surface shadow-card',
        'motion-safe:transition-shadow motion-safe:duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'flex flex-col gap-3 p-5 min-h-[180px]',
        disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:shadow-lift',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">{eyebrow}</p>
          {tag && (
            <span
              className={[
                'inline-flex items-center gap-1 px-2 py-[3px] rounded-full',
                'text-[9px] font-extrabold tracking-[0.1em] uppercase font-tight leading-none',
                'bg-ink/8 text-muted',
              ].join(' ')}
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="6" cy="4" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M2.5 10c0-1.9 1.6-3 3.5-3s3.5 1.1 3.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {tag.label}
            </span>
          )}
        </div>
        {!disabled && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0 text-faint group-hover:text-accent motion-safe:transition-colors motion-safe:duration-150">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="font-display italic text-2xl font-bold text-ink leading-tight tracking-[-0.02em]">
        {title}
      </span>
      <span className="text-[12.5px] text-muted font-tight leading-snug">{tagline}</span>
      <div className="mt-auto pt-1">{children}</div>
    </button>
  );
}

function DraftModeCard({
  activeDraftRun,
  draftPaidRunsLeft,
  onSelect,
}: {
  activeDraftRun: DraftRun | null;
  draftPaidRunsLeft: number;
  onSelect: () => void;
}) {
  if (activeDraftRun) {
    const inGauntlet = activeDraftRun.status === 'playing';
    const practice = activeDraftRun.practice;
    return (
      <ModeCard
        eyebrow={practice ? 'Draft — Practice' : 'Draft — In Progress'}
        title="Resume Draft"
        tagline={
          inGauntlet
            ? `Gauntlet round ${activeDraftRun.round + 1} of 4 · bank ${activeDraftRun.bank.toLocaleString()} coins${practice ? ' (practice — not paid)' : ''}`
            : `Drafting slot ${activeDraftRun.slotIdx + 1} of 7${practice ? ' · practice run' : ''}`
        }
        onSelect={onSelect}
        ariaLabel="Resume your active draft run"
      >
        <span
          className={[
            'inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.1em] uppercase px-3 py-1.5 rounded-full',
            practice ? 'bg-ink/8 text-muted' : 'bg-accent/15 text-accent',
          ].join(' ')}
        >
          <span className={`w-1.5 h-1.5 rounded-full motion-safe:animate-pulse ${practice ? 'bg-faint' : 'bg-accent'}`} aria-hidden="true" />
          {inGauntlet ? `Bank: ${activeDraftRun.bank.toLocaleString()} coins` : 'Continue drafting'}
        </span>
      </ModeCard>
    );
  }

  const willBePractice = draftPaidRunsLeft <= 0;

  return (
    <ModeCard
      eyebrow="Draft"
      title="Draft & Gauntlet"
      tagline="Pay to enter, draft anyone — stars included — then win a gauntlet for a growing coin payout."
      onSelect={onSelect}
      ariaLabel={
        willBePractice
          ? 'Start a free practice draft run — no entry fee, no payout'
          : `Start a draft run for ${DRAFT_ENTRY_FEE} coins`
      }
    >
      {willBePractice ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular px-3 py-1.5 rounded-full bg-ink/5 text-ink">
            Practice · no entry, no payout
          </span>
          <span className="text-[10px] font-semibold tracking-[0.04em] text-faint">
            Paid runs reset at 00:00 UTC
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular px-3 py-1.5 rounded-full bg-ink/5 text-ink">
            <CoinGlyph size={13} className="text-accent" />
            {DRAFT_ENTRY_FEE} entry
          </span>
          <span className="text-[10px] font-semibold tracking-[0.04em] text-faint">
            Up to {DRAFT_MAX_PAYOUT.toLocaleString()} ({DRAFT_TARGETS.length}-0 incl. {DRAFT_JACKPOT.toLocaleString()} jackpot)
          </span>
        </div>
      )}
      <p className="text-[10px] font-semibold tracking-[0.04em] text-faint mt-1.5">
        {draftPaidRunsLeft} of {DRAFT_PAID_RUNS_PER_DAY} paid runs left today
      </p>
    </ModeCard>
  );
}

/**
 * PvP — stake coins, play another real user's stored squad. The winner nets
 * the pot minus the house's PVP_RAKE_PCT cut (draws refund both stakes, no
 * rake). Gated behind MARKET_UNLOCK same as the marketplace — locked until
 * then, shown as a checklist instead of a start CTA.
 * Matchmaking is async: if nobody is waiting your squad becomes the open
 * challenge and resolves as soon as someone enters, so there's no lobby to sit in.
 */
function PvpModeCard({ marketAccess, onSelect }: { marketAccess: MarketAccess | null; onSelect: () => void }) {
  const locked = marketAccess !== null && !marketAccess.unlocked;

  return (
    <ModeCard
      eyebrow="PvP"
      title="Head to Head"
      tagline={
        locked
          ? 'Stake coins and face another player’s squad. Unlocks once you’ve played the game a bit.'
          : 'Stake coins and face another player’s squad. Chemistry and overall both decide it.'
      }
      onSelect={onSelect}
      ariaLabel={locked ? 'PvP — locked until unlock requirements are met' : `Play PvP for a ${PVP_STAKE} coin stake`}
      disabled={locked}
    >
      {locked ? (
        <MarketUnlockChecklist access={marketAccess} />
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular px-3 py-1.5 rounded-full bg-ink/5 text-ink">
            <CoinGlyph size={13} className="text-accent" />
            {PVP_STAKE} stake
          </span>
          <span className="text-[10px] font-semibold tracking-[0.04em] text-faint">
            Win nets +{PVP_NET_WIN} · draws refund
          </span>
        </div>
      )}
    </ModeCard>
  );
}

/**
 * Weekly Brawl — this week's house rule (e.g. "Max 85 OVR", "One Team Only"),
 * won by clearing a target squad strength. No coins on a win — only the
 * FIRST win of the week pays an untradeable Bronze reward pack (rewardPackId
 * on the play result tells the caller when that happened); every other play
 * is free practice against the same rule.
 */
function BrawlModeCard({ brawl, onSelect }: { brawl: WeeklyState['brawl']; onSelect: () => void }) {
  return (
    <ModeCard
      eyebrow="Weekly Brawl"
      title={brawl.label}
      tagline={brawl.description}
      onSelect={onSelect}
      ariaLabel={`Play the Weekly Brawl — ${brawl.label}, target strength ${brawl.target}`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular px-3 py-1.5 rounded-full bg-ink/5 text-ink">
          Target {brawl.target.toFixed(1)}
        </span>
        {brawl.bestStrength !== null && (
          <span className="text-[10px] font-semibold tracking-[0.04em] text-faint">
            Best {brawl.bestStrength.toFixed(1)}
          </span>
        )}
      </div>
      <p className="text-[10px] font-semibold tracking-[0.04em] mt-1.5">
        <span className={brawl.won ? 'text-accent' : 'text-faint'}>
          {brawl.won ? 'This week’s pack claimed' : `${brawl.plays} play${brawl.plays === 1 ? '' : 's'} this week · win once for a Bronze pack`}
        </span>
      </p>
    </ModeCard>
  );
}

/**
 * Featured Boss — beat a real UFA team-season's best 7, strictly (strength
 * must exceed the boss's, not just tie it). First win pays a Silver reward
 * pack. `boss` is null only in a data gap; the card renders disabled rather
 * than crashing.
 */
function BossModeCard({ boss, onSelect }: { boss: WeeklyState['boss']; onSelect: () => void }) {
  if (!boss) {
    return (
      <ModeCard
        eyebrow="Featured Boss"
        title="Unavailable"
        tagline="No boss is set for this week — check back soon."
        onSelect={onSelect}
        ariaLabel="Featured Boss unavailable this week"
        disabled
      />
    );
  }

  return (
    <ModeCard
      eyebrow="Featured Boss"
      title={`${boss.teamAbbr} ${boss.year}`}
      tagline={`Beat this real 7-player squad (${boss.formation}) — strength must exceed theirs.`}
      onSelect={onSelect}
      ariaLabel={`Play the Featured Boss — ${boss.teamAbbr} ${boss.year}, strength ${boss.strength}`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular px-3 py-1.5 rounded-full bg-ink/5 text-ink">
          Strength {boss.strength.toFixed(1)}
        </span>
        {boss.bestStrength !== null && (
          <span className="text-[10px] font-semibold tracking-[0.04em] text-faint">
            Best {boss.bestStrength.toFixed(1)}
          </span>
        )}
      </div>
      <p className="text-[10px] font-semibold tracking-[0.04em] mt-1.5">
        <span className={boss.won ? 'text-accent' : 'text-faint'}>
          {boss.won ? 'This week’s pack claimed' : `${boss.plays} play${boss.plays === 1 ? '' : 's'} this week · win once for a Silver pack`}
        </span>
      </p>
    </ModeCard>
  );
}

/**
 * Rivals — unstaked async PvP scored in weekly points (win 3 / draw 1 / loss
 * 0, BOTH sides score), settling toward Bronze/Silver/Gold tier reward packs
 * (RIVALS_TIERS). Unlike PvP, no coins move and there's no market gate, so
 * the card never renders locked. A parked squad shows "Withdraw" instead of
 * "Enter" — matching PvP's queued state — since re-entering while parked
 * would double up the one-open-squad rule.
 */
function RivalsModeCard({ rivals, onSelect }: { rivals: RivalsWeek | null; onSelect: () => void }) {
  if (!rivals) {
    return (
      <ModeCard
        eyebrow="Rivals"
        title="Unavailable"
        tagline="Rivals isn't set up for this week yet — check back soon."
        onSelect={onSelect}
        ariaLabel="Rivals unavailable this week"
        disabled
      />
    );
  }

  const tier = rivalsTier(rivals.points);
  const nextTier = RIVALS_TIERS.find((t) => t.tier === tier + 1);
  const hasUnclaimed = tier > rivals.claimedTier;

  // A parked squad can't re-enter (the one-open-squad rule) — the card goes
  // disabled and points at the Withdraw button on RivalsBoard below, rather
  // than letting a tap walk into formation-select → a server rejection.
  return (
    <ModeCard
      eyebrow="Rivals"
      title={rivals.openSquad ? 'Squad parked' : 'Weekly Rivals'}
      tagline={
        rivals.openSquad
          ? 'Your squad is parked, scoring points while you’re away. Withdraw below to re-enter.'
          : 'Unstaked async PvP — win 3 pts, draw 1. Both sides score, even while you’re away.'
      }
      onSelect={onSelect}
      ariaLabel={
        rivals.openSquad
          ? 'Rivals — your squad is parked; withdraw it below to re-enter'
          : 'Play Rivals — unstaked, scores weekly points'
      }
      disabled={rivals.openSquad}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular px-3 py-1.5 rounded-full bg-ink/5 text-ink">
          {rivals.points} pts
        </span>
        <span className="text-[10px] font-semibold tracking-[0.04em] text-faint tabular">
          {rivals.wins}W–{rivals.draws}D–{rivals.losses}L
        </span>
      </div>
      <p className="text-[10px] font-semibold tracking-[0.04em] mt-1.5">
        {hasUnclaimed ? (
          <span className="text-accent">Tier {tier} reward ready to claim</span>
        ) : nextTier ? (
          <span className="text-faint">
            {nextTier.points - rivals.points} pts to tier {nextTier.tier}
          </span>
        ) : (
          <span className="text-faint">Top tier reached this week</span>
        )}
      </p>
    </ModeCard>
  );
}
