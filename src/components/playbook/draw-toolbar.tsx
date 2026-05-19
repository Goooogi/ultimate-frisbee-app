'use client';

// Vertical utility bar that sits along the left edge of the field. Switches
// the active editor tool — cursor (default, drag players) or one of the
// three drawing tools. Last button is a clear-all for the current step.

import type { DrawTool } from '@/lib/playbook/types';

interface DrawToolbarProps {
  tool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  /** Optional — wired to "clear drawings on the current step". Hidden when
   * the current step has no drawings. */
  onClear?: () => void;
  canClear: boolean;
}

const TOOLS: Array<{ id: DrawTool; label: string; render: (active: boolean) => React.ReactNode }> = [
  { id: 'cursor',   label: 'Select / drag players',     render: (a) => <CursorIcon active={a} /> },
  { id: 'line',     label: 'Straight line — drag to draw', render: (a) => <LineIcon active={a} /> },
  { id: 'arrow',    label: 'Arrow — drag to draw',      render: (a) => <ArrowIcon active={a} /> },
  { id: 'freehand', label: 'Freehand draw',             render: (a) => <FreehandIcon active={a} /> },
];

export function DrawToolbar({ tool, onToolChange, onClear, canClear }: DrawToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className={[
        'flex-shrink-0 flex flex-col items-center gap-1 py-2 px-1',
        'rounded-full border border-border bg-bg shadow-sm',
        'self-center',
      ].join(' ')}
    >
      {TOOLS.map((t) => {
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onToolChange(t.id)}
            aria-pressed={active}
            aria-label={t.label}
            title={t.label}
            className={[
              'inline-flex items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active
                ? 'bg-ink text-bg'
                : 'bg-transparent text-muted hover:text-ink hover:bg-surface',
            ].join(' ')}
          >
            {t.render(active)}
          </button>
        );
      })}

      {onClear && (
        <>
          <span aria-hidden="true" className="my-1 w-5 h-px bg-hairline" />
          <button
            type="button"
            onClick={onClear}
            disabled={!canClear}
            aria-label="Clear drawings on this step"
            title="Clear drawings"
            className={[
              'inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              canClear
                ? 'text-muted hover:text-accent hover:bg-surface cursor-pointer'
                : 'text-faint opacity-40 cursor-not-allowed',
            ].join(' ')}
          >
            <TrashIcon />
          </button>
        </>
      )}
    </div>
  );
}

// ── icons ────────────────────────────────────────────────────────────────

function CursorIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 2L3 11L5.5 8.7L7.4 12.5L9 11.7L7.1 8L10.5 7.6L3 2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LineIcon({ active: _a }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <line x1="2" y1="12" x2="12" y2="2" />
    </svg>
  );
}

function ArrowIcon({ active: _a }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="2" y1="12" x2="11" y2="3" />
      <path d="M7 3L11 3L11 7" />
    </svg>
  );
}

function FreehandIcon({ active: _a }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 11 Q 4 5, 7 8 T 12 5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8" />
    </svg>
  );
}
