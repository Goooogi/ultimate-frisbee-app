'use client';

// Right-pane step rail. Layout inspired by the "Steps" panel in the
// playbook design ref — big italic display header, then per-step rows with
// an index, a small arc icon (visual rhythm), a name, and the step duration.

import { DEFAULT_STEP_MS } from '@/lib/playbook/types';
import type { Step } from '@/lib/playbook/types';

interface StepRailProps {
  steps: Step[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}

export function StepRail({ steps, currentIndex, onSelect, onAdd, onDelete }: StepRailProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-baseline gap-2 m-0">
          <span className="font-display italic font-bold text-[26px] leading-none text-ink tracking-[-0.01em]">
            Steps
          </span>
          <span className="font-display italic text-[14px] leading-none text-faint tabular">
            {pad2(steps.length)}
          </span>
        </h2>
        <button
          type="button"
          onClick={onAdd}
          className={[
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-bg',
            'text-[10px] font-bold tracking-[0.14em] uppercase text-ink font-tight cursor-pointer',
            'hover:border-ink transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          + Add
        </button>
      </div>

      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li key={s.id}>
            <StepRow
              step={s}
              index={i}
              active={i === currentIndex}
              onSelect={() => onSelect(i)}
              onDelete={steps.length > 1 ? () => onDelete(i) : undefined}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepRow({
  step,
  index,
  active,
  onSelect,
  onDelete,
}: {
  step: Step;
  index: number;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const seconds = ((step.durationMs ?? DEFAULT_STEP_MS) / 1000).toFixed(1);
  return (
    <div
      className={[
        'group relative flex items-center gap-2 rounded-md border transition-colors',
        'pl-2.5 pr-2 py-2',
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
        className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer text-left focus-visible:outline-none rounded"
      >
        <span
          className={[
            'font-display italic text-[13px] tabular leading-none w-5 text-right flex-shrink-0',
            active ? 'text-accent font-bold' : 'text-faint',
          ].join(' ')}
        >
          {pad2(index + 1)}
        </span>
        <ArcIcon active={active} />
        <span
          className={[
            'text-[12px] font-tight truncate leading-tight min-w-0',
            active ? 'text-ink font-bold' : 'text-ink font-semibold',
          ].join(' ')}
        >
          {`Step ${index + 1}`}
        </span>
      </button>
      <span className="text-[10px] font-bold tabular text-muted font-tight flex-shrink-0 pr-1">
        {seconds}s
      </span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete step ${index + 1}`}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-bg border border-border flex items-center justify-center text-[10px] font-bold text-faint hover:text-accent hover:border-accent opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none cursor-pointer"
        >
          ×
        </button>
      )}
    </div>
  );
}

function ArcIcon({ active }: { active: boolean }) {
  const c = active ? 'rgb(var(--accent))' : 'rgb(var(--muted))';
  return (
    <svg
      width="22"
      height="14"
      viewBox="0 0 22 14"
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path
        d="M2 11 Q 11 1, 20 11"
        stroke={c}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
