'use client';

// Compact play list that lives indented under the "Plays" nav item in the
// playbook sidebar. Smaller and denser than <PlayList> (which is used on
// mobile in the accordion below the editor).

import { useEffect, useRef, useState } from 'react';
import type { Play } from '@/lib/playbook/types';
import type { CopyDestination } from './playbook-app';

interface SidebarPlayListProps {
  plays: Play[];
  currentID?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  copyTargets: CopyDestination[];
  onCopy: (playID: string, target: CopyDestination) => void;
}

// Position of the open popover, anchored in fixed coords so it escapes the
// overflow-y-auto scrolling container.
interface PopoverPos {
  top: number;
  right: number; // distance from viewport right edge
}

export function SidebarPlayList({
  plays,
  currentID,
  onSelect,
  onCreate,
  onDelete,
  copyTargets,
  onCopy,
}: SidebarPlayListProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPos | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Close on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
        setPopoverPos(null);
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
        setPopoverPos(null);
        trigger?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpenId]);

  function toggleMenu(e: React.MouseEvent<HTMLButtonElement>, playId: string) {
    e.stopPropagation();
    if (menuOpenId === playId) {
      setMenuOpenId(null);
      setPopoverPos(null);
      return;
    }
    // Anchor to right edge of trigger button, just below it — fixed coords
    // so the menu escapes the overflow-y-auto container.
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuOpenId(playId);
    setPopoverPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }

  function handleCopy(e: React.MouseEvent, playId: string, target: CopyDestination) {
    e.stopPropagation();
    onCopy(playId, target);
    setMenuOpenId(null);
    setPopoverPos(null);
  }

  return (
    <div className="flex flex-col gap-0.5 max-h-[40vh] overflow-y-auto pr-1 -mr-1">
      {plays.map((p) => {
        const active = p.id === currentID;
        const menuOpen = menuOpenId === p.id;
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
            {/* Action buttons: Del + ⋯ */}
            <div className="flex items-center gap-0.5 pr-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p.id);
                }}
                aria-label={`Delete ${p.name || 'Untitled play'}`}
                className="py-1.5 px-1 text-[10px] font-bold tracking-[0.14em] uppercase text-faint hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none cursor-pointer"
              >
                ×
              </button>
              {/* More-actions trigger */}
              <button
                ref={(el) => { triggerRefs.current[p.id] = el; }}
                type="button"
                onClick={(e) => toggleMenu(e, p.id)}
                aria-label={`Copy ${p.name || 'play'} to another playbook`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={[
                  'flex items-center justify-center w-5 h-5 rounded text-faint hover:text-accent',
                  'transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                ].join(' ')}
              >
                <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">
                  <circle cx="2" cy="8" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="14" cy="8" r="1.5" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}

      {/* Popover menu — rendered as fixed to escape overflow-y-auto clipping */}
      {menuOpenId && popoverPos && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'fixed',
            top: popoverPos.top,
            right: popoverPos.right,
          }}
          className="min-w-[148px] rounded-md border border-border bg-bg shadow-lg z-[100]"
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
                onClick={(e) => handleCopy(e, menuOpenId, target)}
                className="w-full text-left px-3 py-2 text-[12px] font-tight text-ink hover:bg-surface transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-surface"
              >
                {target.label}
              </button>
            ))
          )}
        </div>
      )}

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
