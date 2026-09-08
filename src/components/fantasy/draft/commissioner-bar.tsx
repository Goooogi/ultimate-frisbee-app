'use client';

// CommissionerBar — commissioner-only draft controls (pause/resume, undo,
// skip clock). Rendered by DraftRoom above the room content while the draft
// is live. Destructive actions (undo, skip) confirm before calling.
// Ported from mobile CommissionerBar.tsx by intent.

import { useState } from 'react';
import { pauseDraft, resumeDraft, undoLastPick, skipClock, type Draft } from '@/lib/fantasy/draft-room';

interface CommissionerBarProps {
  draft: Draft;
  pickCount: number;
  refetch: () => Promise<void> | void;
}

export function CommissionerBar({ draft, pickCount, refetch }: CommissionerBarProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaused = Boolean(draft.pausedAt);

  const showError = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setTimeout(() => setError(null), 4000);
  };

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refetch();
    } catch (err) {
      showError(err, fallback);
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePause = () => {
    if (isPaused) {
      run(() => resumeDraft(draft.id), 'Could not resume the draft.');
    } else {
      run(() => pauseDraft(draft.id), 'Could not pause the draft.');
    }
  };

  const confirmUndo = () => {
    if (!window.confirm('Undo last pick? This reverts the most recent pick and restarts the clock.')) return;
    run(() => undoLastPick(draft.id), 'Could not undo the last pick.');
  };

  const confirmSkip = () => {
    if (!window.confirm('Skip the clock? The team on the clock will be autopicked right now.')) return;
    run(() => skipClock(draft.id), 'Could not skip the clock.');
  };

  return (
    <div className="mb-3">
      <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-2">
        Commissioner
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleTogglePause}
          disabled={busy}
          className={[
            'px-3.5 py-2 rounded-full min-h-[36px] border-[1.5px] border-ink/15',
            'font-tight text-[11px] font-bold tracking-[0.08em] uppercase text-ink transition-opacity duration-150',
            'hover:opacity-80 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={confirmUndo}
          disabled={busy || pickCount === 0}
          className={[
            'px-3.5 py-2 rounded-full min-h-[36px] border-[1.5px] border-ink/15',
            'font-tight text-[11px] font-bold tracking-[0.08em] uppercase text-ink transition-opacity duration-150',
            'hover:opacity-80 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          Undo pick
        </button>
        <button
          type="button"
          onClick={confirmSkip}
          disabled={busy || isPaused}
          className={[
            'px-3.5 py-2 rounded-full min-h-[36px] border-[1.5px] border-ink/15',
            'font-tight text-[11px] font-bold tracking-[0.08em] uppercase text-ink transition-opacity duration-150',
            'hover:opacity-80 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          Skip clock
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-live font-tight">
          {error}
        </p>
      )}
    </div>
  );
}
