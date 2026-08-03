'use client';

// PlayModeSelect — the Play tab's entry point once a user has cards to build
// with. Two tappable cards in the app's card language: "Squad Battle" (the
// existing collection-based flow, unchanged beneath) and "Draft" (new — pay
// DRAFT_ENTRY_FEE, get dealt candidates per slot, gauntlet for coins). If a
// draft run is already active, the Draft card becomes "Resume Draft" and
// shows exactly where the run left off (drafting slot N, or gauntlet round N
// + bank) instead of the pitch copy.

import type { DraftRun } from '@/lib/utcg/draft';
import { DRAFT_ENTRY_FEE, DRAFT_REWARDS, DRAFT_JACKPOT } from '@/lib/utcg/draft';
import { PVP_STAKE } from '@/lib/utcg/actions';
import { CoinGlyph } from '@/components/utcg/coin-glyph';

export type PlayMode = 'squad' | 'draft' | 'pvp';

interface PlayModeSelectProps {
  activeDraftRun: DraftRun | null;
  onSelectSquad: () => void;
  onSelectDraft: () => void;
  onSelectPvp: () => void;
}

export function PlayModeSelect({
  activeDraftRun,
  onSelectSquad,
  onSelectDraft,
  onSelectPvp,
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-2xl mx-auto w-full">
        <ModeCard
          eyebrow="Squad Battle"
          tag={{ label: 'Solo', tone: 'solo' }}
          title="Build & Play"
          tagline="Field a squad from your collection and simulate one match."
          onSelect={onSelectSquad}
          ariaLabel="Play Squad Battle — solo mode"
        />
        <DraftModeCard activeDraftRun={activeDraftRun} onSelect={onSelectDraft} />
        <PvpModeCard onSelect={onSelectPvp} />
      </div>
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
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={ariaLabel}
      className={[
        'group text-left rounded-card-lg bg-surface shadow-card hover:shadow-lift',
        'motion-safe:transition-shadow motion-safe:duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'flex flex-col gap-3 p-5 cursor-pointer min-h-[180px]',
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
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0 text-faint group-hover:text-accent motion-safe:transition-colors motion-safe:duration-150">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="font-display italic text-2xl font-bold text-ink leading-tight tracking-[-0.02em]">
        {title}
      </span>
      <span className="text-[12.5px] text-muted font-tight leading-snug">{tagline}</span>
      <div className="mt-auto pt-1">{children}</div>
    </button>
  );
}

function DraftModeCard({ activeDraftRun, onSelect }: { activeDraftRun: DraftRun | null; onSelect: () => void }) {
  if (activeDraftRun) {
    const inGauntlet = activeDraftRun.status === 'playing';
    return (
      <ModeCard
        eyebrow="Draft — In Progress"
        title="Resume Draft"
        tagline={
          inGauntlet
            ? `Gauntlet round ${activeDraftRun.round + 1} of 4 · bank ${activeDraftRun.bank.toLocaleString()} coins`
            : `Drafting slot ${activeDraftRun.slotIdx + 1} of 7`
        }
        onSelect={onSelect}
        ariaLabel="Resume your active draft run"
      >
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.1em] uppercase px-3 py-1.5 rounded-full bg-accent/15 text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true" />
          {inGauntlet ? `Bank: ${activeDraftRun.bank.toLocaleString()} coins` : 'Continue drafting'}
        </span>
      </ModeCard>
    );
  }

  return (
    <ModeCard
      eyebrow="Draft"
      title="Draft & Gauntlet"
      tagline="Pay to enter, draft anyone — stars included — then win a gauntlet for a growing coin payout."
      onSelect={onSelect}
      ariaLabel={`Start a draft run for ${DRAFT_ENTRY_FEE} coins`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular px-3 py-1.5 rounded-full bg-ink/5 text-ink">
          <CoinGlyph size={13} className="text-accent" />
          {DRAFT_ENTRY_FEE} entry
        </span>
        <span className="text-[10px] font-semibold tracking-[0.04em] text-faint">
          Up to {DRAFT_REWARDS[DRAFT_REWARDS.length - 1].toLocaleString()} + {DRAFT_JACKPOT.toLocaleString()} jackpot
        </span>
      </div>
    </ModeCard>
  );
}

/**
 * PvP — stake coins, play another real user's stored squad, winner takes the pot.
 * Matchmaking is async: if nobody is waiting your squad becomes the open
 * challenge and resolves as soon as someone enters, so there's no lobby to sit in.
 */
function PvpModeCard({ onSelect }: { onSelect: () => void }) {
  return (
    <ModeCard
      eyebrow="PvP"
      title="Head to Head"
      tagline="Stake coins and face another player's squad. Chemistry and overall both decide it — winner takes the pot."
      onSelect={onSelect}
      ariaLabel={`Play PvP for a ${PVP_STAKE} coin stake`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular px-3 py-1.5 rounded-full bg-ink/5 text-ink">
          <CoinGlyph size={13} className="text-accent" />
          {PVP_STAKE} stake
        </span>
        <span className="text-[10px] font-semibold tracking-[0.04em] text-faint">
          Winner takes {PVP_STAKE * 2}
        </span>
      </div>
    </ModeCard>
  );
}
