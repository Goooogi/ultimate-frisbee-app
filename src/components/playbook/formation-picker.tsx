'use client';

// Compact preset row — pills with a tiny mini-field icon on the left and the
// label inline. Smaller vertical footprint than the card grid; readable at a
// glance because the icon still shows the formation's shape.

import { PRESET_LABELS, PRESET_ORDER } from '@/lib/playbook/presets';
import { FormationPreview } from './formation-preview';
import type { FormationID } from '@/lib/playbook/types';

interface FormationPickerProps {
  current: FormationID;
  onPick: (id: Exclude<FormationID, 'custom'>) => void;
}

export function FormationPicker({ current, onPick }: FormationPickerProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 py-0.5 snap-x">
      {PRESET_ORDER.map((id) => {
        const active = current === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            aria-pressed={active}
            title={`Apply ${PRESET_LABELS[id]} formation`}
            className={[
              'flex-shrink-0 snap-start inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full',
              'cursor-pointer transition-colors duration-150 font-tight',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active
                ? 'bg-accent text-accent-ink'
                : 'bg-surface border border-border text-muted hover:border-ink hover:text-ink',
            ].join(' ')}
          >
            <span className="w-[16px] h-[28px] flex-shrink-0">
              <FormationPreview formation={id} active={active} className="w-full h-full" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase leading-none">
              {PRESET_LABELS[id]}
            </span>
          </button>
        );
      })}
      {current === 'custom' && (
        <span
          className="flex-shrink-0 inline-flex items-center px-3 py-1.5 rounded-full border border-dashed border-border text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight"
          title="You've moved players manually — preset no longer matches."
        >
          Custom
        </span>
      )}
    </div>
  );
}
