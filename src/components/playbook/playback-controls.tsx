'use client';

// Play / pause / restart + speed control. Sits below the field on mobile,
// next to the step strip on desktop. Disabled when only one step exists.

interface PlaybackControlsProps {
  isPlaying: boolean;
  canPlay: boolean;
  speed: number;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSpeedChange: (s: number) => void;
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;

export function PlaybackControls({
  isPlaying,
  canPlay,
  speed,
  onTogglePlay,
  onRestart,
  onSpeedChange,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-t border-hairline">
      <button
        type="button"
        onClick={onTogglePlay}
        disabled={!canPlay}
        className={[
          'inline-flex items-center justify-center w-11 h-11 rounded-full cursor-pointer',
          'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          canPlay
            ? 'bg-accent text-accent-ink hover:opacity-90'
            : 'bg-surface text-faint cursor-not-allowed opacity-50',
        ].join(' ')}
        aria-label={isPlaying ? 'Pause playback' : 'Play steps'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        type="button"
        onClick={onRestart}
        disabled={!canPlay}
        className={[
          'inline-flex items-center justify-center w-9 h-9 rounded-full cursor-pointer',
          'border border-border bg-surface text-muted hover:text-ink hover:border-ink transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          !canPlay && 'opacity-50 cursor-not-allowed',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Restart from step 1"
      >
        <RestartIcon />
      </button>

      <div className="flex-1" />

      <div className="inline-flex items-center gap-1 rounded-full bg-surface border border-border p-[2px]">
        {SPEEDS.map((s) => {
          const on = Math.abs(s - speed) < 0.01;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              aria-pressed={on}
              className={[
                'px-2.5 py-1 rounded-full font-sans text-[10px] font-bold tracking-[0.12em] uppercase transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                on ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
              ].join(' ')}
            >
              {s}x
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 2.5v11l10-5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="2.5" width="3" height="11" />
      <rect x="9.5" y="2.5" width="3" height="11" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 7a5 5 0 1 0 1.5-3.5" />
      <path d="M2 2.2v3h3" />
    </svg>
  );
}
