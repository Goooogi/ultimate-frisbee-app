'use client';

// Saved-plays sidebar. Shows all plays in the library with a tiny preview of
// step 0. Tap a play to open it in the editor. The "+ New play" button is
// also exposed via this list for parity with the rest of the chrome.

import { useEffect, useRef, useState } from 'react';
import { Field } from './field';
import { PRESET_LABELS } from '@/lib/playbook/presets';
import type { Play } from '@/lib/playbook/types';
import type { CopyDestination } from './playbook-app';

interface PlayListProps {
  plays: Play[];
  currentID?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  copyTargets: CopyDestination[];
  onCopy: (playID: string, target: CopyDestination) => void;
}

export function PlayList({ plays, currentID, onSelect, onCreate, onDelete, copyTargets, onCopy }: PlayListProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Close on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpenId]);

  // Close on Escape and return focus to trigger
  useEffect(() => {
    if (!menuOpenId) return;
    const openId = menuOpenId;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const trigger = triggerRefs.current[openId];
        setMenuOpenId(null);
        trigger?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpenId]);

  function toggleMenu(e: React.MouseEvent, playId: string) {
    e.stopPropagation();
    setMenuOpenId((prev) => (prev === playId ? null : playId));
  }

  function handleCopy(e: React.MouseEvent, playId: string, target: CopyDestination) {
    e.stopPropagation();
    onCopy(playId, target);
    setMenuOpenId(null);
  }

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
            const menuOpen = menuOpenId === p.id;
            return (
              <li key={p.id}>
                <div
                  className={[
                    'flex items-center gap-3 p-2 rounded-card bg-surface shadow-card transition-shadow',
                    active ? 'ring-1 ring-accent shadow-lift' : 'hover:shadow-lift',
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
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(p.id);
                      }}
                      className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint hover:text-accent transition-colors cursor-pointer font-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                      aria-label={`Delete ${p.name || 'Untitled play'}`}
                    >
                      Del
                    </button>
                    {/* More-actions trigger */}
                    <div className="relative">
                      <button
                        ref={(el) => { triggerRefs.current[p.id] = el; }}
                        type="button"
                        onClick={(e) => toggleMenu(e, p.id)}
                        aria-label={`Copy ${p.name || 'play'} to another playbook`}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        className="flex items-center justify-center w-5 h-5 rounded text-faint hover:text-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
                          <circle cx="2" cy="8" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="14" cy="8" r="1.5" />
                        </svg>
                      </button>
                      {/* Popover menu */}
                      {menuOpen && (
                        <div
                          ref={menuRef}
                          role="menu"
                          className="absolute right-0 top-full mt-1 min-w-[148px] rounded-card bg-surface shadow-lift z-20"
                        >
                          <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
                            Copy to
                          </div>
                          {copyTargets.length === 0 ? (
                            <div className="px-3 py-2 text-[12px] font-tight text-faint">
                              No other playbooks
                            </div>
                          ) : (
                            copyTargets.map((target, i) => (
                              <button
                                key={target.kind === 'personal' ? 'personal' : target.teamID + i}
                                type="button"
                                role="menuitem"
                                onClick={(e) => handleCopy(e, p.id, target)}
                                className="w-full text-left px-3 py-2 text-[12px] font-tight text-ink hover:bg-ink/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-ink/5"
                              >
                                {target.label}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
