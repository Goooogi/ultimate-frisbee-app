'use client';

// Horizontal scrolling strip of step chips for mobile + tablet. Compact —
// no field preview, just the step number + a delete-on-hover ×. Keeps the
// playback controls reachable without scrolling.

import type { Step } from '@/lib/playbook/types';

interface StepStripProps {
  steps: Step[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}

export function StepStrip({ steps, currentIndex, onSelect, onAdd, onDelete }: StepStripProps) {
  return (
    <div className="border-t border-hairline">
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto">
        {steps.map((s, i) => (
          <StepChip
            key={s.id}
            index={i}
            active={i === currentIndex}
            onSelect={() => onSelect(i)}
            onDelete={steps.length > 1 ? () => onDelete(i) : undefined}
          />
        ))}
        <button
          type="button"
          onClick={onAdd}
          className={[
            'flex-shrink-0 inline-flex items-center gap-1 px-3 h-11 lg:h-9 rounded-md border-2 border-dashed border-border',
            'text-muted hover:text-ink hover:border-ink transition-colors cursor-pointer',
            'text-[10px] font-bold tracking-[0.16em] uppercase font-tight',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
          aria-label="Add a new step"
        >
          <span className="text-[14px] leading-none font-bold">+</span>
          Add
        </button>
      </div>
    </div>
  );
}

function StepChip({
  index,
  active,
  onSelect,
  onDelete,
}: {
  index: number;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={[
        'group relative flex items-center rounded-md border transition-colors flex-shrink-0',
        active
          ? 'bg-bg border-accent shadow-[inset_2px_0_0_rgb(var(--accent))]'
          : 'bg-bg border-border hover:border-ink',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        aria-label={`Step ${index + 1}`}
        className="flex items-center gap-1.5 pl-2 pr-2.5 h-11 lg:h-9 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
      >
        <span
          aria-hidden="true"
          className={[
            'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold tabular tracking-[0.04em] flex-shrink-0',
            active ? 'bg-accent text-accent-ink' : 'bg-surface text-muted',
          ].join(' ')}
        >
          {index + 1 < 10 ? `0${index + 1}` : index + 1}
        </span>
        <span
          className={[
            'text-[11px] font-tight whitespace-nowrap',
            active ? 'text-ink font-bold' : 'text-muted',
          ].join(' ')}
        >
          Step {index + 1}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete step ${index + 1}`}
          className="pr-2 pl-1 h-11 lg:h-9 text-[14px] font-bold leading-none text-faint hover:text-accent opacity-60 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
        >
          ×
        </button>
      )}
    </div>
  );
}
