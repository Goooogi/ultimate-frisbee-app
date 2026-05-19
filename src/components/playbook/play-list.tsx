'use client';

// Saved-plays sidebar. Shows all plays in the library with a tiny preview of
// step 0. Tap a play to open it in the editor. The "+ New play" button is
// also exposed via this list for parity with the rest of the chrome.

import { Field } from './field';
import { PRESET_LABELS } from '@/lib/playbook/presets';
import type { Play } from '@/lib/playbook/types';

interface PlayListProps {
  plays: Play[];
  currentID?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function PlayList({ plays, currentID, onSelect, onCreate, onDelete }: PlayListProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          My plays · {plays.length}
        </h2>
        <button
          type="button"
          onClick={onCreate}
          className="text-[10px] font-bold tracking-[0.16em] uppercase text-accent hover:opacity-80 transition-opacity cursor-pointer font-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          + New
        </button>
      </div>
      {plays.length === 0 ? (
        <p className="text-[12px] text-faint font-tight">
          No plays yet. Drag the players around and hit <strong>+ Add step</strong> to start one.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plays.map((p) => {
            const active = p.id === currentID;
            return (
              <li key={p.id}>
                <div
                  className={[
                    'flex items-center gap-3 p-2 rounded-md transition-colors',
                    active
                      ? 'bg-surface border border-accent'
                      : 'bg-surface border border-border hover:border-ink',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-none focus-visible:underline"
                    aria-current={active ? 'true' : undefined}
                  >
                    <div className="flex-shrink-0 w-9 h-16 rounded overflow-hidden border border-border">
                      <Field step={p.steps[0]} readOnly />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink font-tight truncate">
                        {p.name || 'Untitled play'}
                      </div>
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint font-tight mt-0.5">
                        {p.formation === 'custom' ? 'Custom' : PRESET_LABELS[p.formation]} · {p.steps.length} {p.steps.length === 1 ? 'step' : 'steps'}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(p.id)}
                    className="flex-shrink-0 text-[9px] font-bold tracking-[0.16em] uppercase text-faint hover:text-accent transition-colors cursor-pointer font-tight"
                    aria-label={`Delete ${p.name || 'Untitled play'}`}
                  >
                    Del
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
