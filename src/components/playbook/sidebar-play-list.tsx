'use client';

// Compact play list that lives indented under the "Plays" nav item in the
// playbook sidebar. Smaller and denser than <PlayList> (which is used on
// mobile in the accordion below the editor).

import type { Play } from '@/lib/playbook/types';

interface SidebarPlayListProps {
  plays: Play[];
  currentID?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function SidebarPlayList({
  plays,
  currentID,
  onSelect,
  onCreate,
  onDelete,
}: SidebarPlayListProps) {
  return (
    <div className="flex flex-col gap-0.5 max-h-[40vh] overflow-y-auto pr-1 -mr-1">
      {plays.map((p) => {
        const active = p.id === currentID;
        return (
          <div
            key={p.id}
            className={[
              'group flex items-center gap-1.5 rounded text-[12px] font-tight cursor-pointer',
              'transition-colors duration-150',
              active
                ? 'bg-surface text-ink font-semibold'
                : 'text-muted hover:text-ink hover:bg-surface/60',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              aria-current={active ? 'true' : undefined}
              className="flex-1 min-w-0 text-left pl-3 pr-1 py-1.5 cursor-pointer focus-visible:outline-none focus-visible:underline"
            >
              <span className="truncate block">
                <span
                  aria-hidden="true"
                  className={`mr-1.5 ${active ? 'text-accent' : 'text-faint'}`}
                >
                  ›
                </span>
                {p.name || 'Untitled'}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p.id);
              }}
              aria-label={`Delete ${p.name || 'Untitled play'}`}
              className="pr-2 py-1.5 text-[10px] font-bold tracking-[0.14em] uppercase text-faint hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none cursor-pointer"
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onCreate}
        className="text-left px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] uppercase text-accent hover:opacity-80 cursor-pointer font-tight focus-visible:outline-none focus-visible:underline mt-1"
      >
        + New play
      </button>
    </div>
  );
}
