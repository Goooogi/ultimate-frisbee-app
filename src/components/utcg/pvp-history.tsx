'use client';

// PvpHistory — recent PvP results, shown on the Play tab's mode-select screen.
//
// This is the DEFENDER's only notification channel. A parked squad gets played
// while its owner is away, so without this the sole signal that anything
// happened is a changed coin balance. Rows are pre-oriented server-side to
// "us vs them", and defended matches are labelled so it's obvious which ones
// happened without you.

import type { PvpMatchRow } from '@/lib/utcg/server';
import { CoinGlyph } from '@/components/utcg/coin-glyph';

interface PvpHistoryProps {
  matches: PvpMatchRow[];
  openSquad: { chem: number; strength: number; stakedCoins: number; createdAt: string } | null;
}

export function PvpHistory({ matches, openSquad }: PvpHistoryProps) {
  if (matches.length === 0 && !openSquad) return null;

  // Anything we didn't initiate resolved while we were away — worth calling out.
  const defended = matches.filter((m) => !m.wasChallenger).length;

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-muted font-tight">
          PvP activity
        </h3>
        {defended > 0 && (
          <span className="text-[10px] font-semibold text-faint font-tight">
            {defended} played your squad
          </span>
        )}
      </div>

      {openSquad && (
        <div className="flex items-center justify-between gap-3 rounded-card bg-surface shadow-card px-3.5 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full bg-accent motion-safe:animate-pulse flex-shrink-0"
              aria-hidden="true"
            />
            <span className="text-[12px] font-semibold text-ink font-tight truncate">
              Your challenge is open
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold tabular text-muted flex-shrink-0">
            <CoinGlyph size={11} className="text-accent" />
            {openSquad.stakedCoins} staked
          </span>
        </div>
      )}

      {matches.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {matches.slice(0, 5).map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-card bg-surface shadow-card px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={[
                    'inline-flex items-center justify-center min-w-[38px] px-1.5 py-1 rounded-full',
                    'text-[9.5px] font-extrabold tracking-[0.08em] uppercase font-tight leading-none',
                    m.result === 'won'
                      ? 'bg-accent text-accent-ink'
                      : m.result === 'draw'
                        ? 'bg-ink/8 text-muted'
                        : 'bg-ink/5 text-faint',
                  ].join(' ')}
                >
                  {m.result === 'won' ? 'Win' : m.result === 'draw' ? 'Draw' : 'Loss'}
                </span>
                <span className="text-[11.5px] text-muted font-tight tabular truncate">
                  {m.ourStrength.toFixed(1)} v {m.theirStrength.toFixed(1)}
                  <span className="text-faint"> · chem {m.ourChem}–{m.theirChem}</span>
                  {!m.wasChallenger && <span className="text-faint"> · defended</span>}
                </span>
              </div>
              <span
                className={[
                  'inline-flex items-center gap-1 text-[11.5px] font-bold tabular flex-shrink-0',
                  m.coinDelta > 0 ? 'text-accent' : m.coinDelta < 0 ? 'text-faint' : 'text-muted',
                ].join(' ')}
              >
                <CoinGlyph size={11} className={m.coinDelta > 0 ? 'text-accent' : 'text-faint'} />
                {m.coinDelta > 0 ? `+${m.coinDelta}` : m.coinDelta < 0 ? `−${Math.abs(m.coinDelta)}` : '±0'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
