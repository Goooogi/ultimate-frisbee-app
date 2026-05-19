'use client';

// Compact team chip + dropdown that lives in the playbook sidebar.
//
// Shows the currently-selected team as a colored pill with the short name.
// Click → opens a list of all teams + a "Manage" link to /playbook/teams.
// Keyboard-accessible via <details>/<summary>; will be replaced with a real
// menu primitive when shadcn-ui lands.

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { Team } from '@/lib/playbook/teams';

interface TeamSwitcherProps {
  teams: Team[];
  currentID?: string;
  onSwitch: (id: string) => void;
}

export function TeamSwitcher({ teams, currentID, onSwitch }: TeamSwitcherProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    function onDocPointer(e: PointerEvent) {
      const el = detailsRef.current;
      if (!el || !el.open) return;
      if (!el.contains(e.target as Node)) el.open = false;
    }
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, []);

  const current = teams.find((t) => t.id === currentID) ?? teams[0];
  const owned = teams.filter((t) => t.role === 'owner');
  const member = teams.filter((t) => t.role === 'member');
  const invited = teams.filter((t) => t.role === 'invited');

  if (!current) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight px-1">
        Team
      </div>

      <details ref={detailsRef} className="relative group">
        <summary
          aria-label={`Current team: ${current.name}. Click to switch.`}
          className={[
            'list-none cursor-pointer flex items-center gap-2 px-2 py-2 rounded-md',
            'border border-border bg-surface hover:border-ink transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          <TeamDot team={current} />
          <span className="flex-1 min-w-0 text-left">
            <span className="block text-[12px] font-bold text-ink font-tight truncate leading-tight">
              {current.name}
            </span>
            <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-faint font-tight mt-0.5">
              {current.role}
            </span>
          </span>
          <ChevronIcon />
        </summary>

        {/* Popover-style list. Positioned absolutely so it doesn't push sidebar layout. */}
        <div
          className={[
            'absolute left-0 right-0 top-full mt-1 z-30',
            'border border-border bg-bg shadow-lg rounded-md p-1.5',
            'flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto',
          ].join(' ')}
        >
          {invited.length > 0 && (
            <TeamGroup
              label="Pending invites"
              teams={invited}
              currentID={currentID}
              onSwitch={onSwitch}
              accent
            />
          )}
          {owned.length > 0 && (
            <TeamGroup
              label="Owned"
              teams={owned}
              currentID={currentID}
              onSwitch={onSwitch}
            />
          )}
          {member.length > 0 && (
            <TeamGroup
              label="Member"
              teams={member}
              currentID={currentID}
              onSwitch={onSwitch}
            />
          )}

          <div className="h-px bg-hairline my-0.5" />

          <Link
            href="/playbook/teams"
            className="flex items-center justify-between gap-2 px-2 py-2 rounded-md hover:bg-surface transition-colors text-[11px] font-bold tracking-[0.14em] uppercase text-ink font-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Manage teams
            <ArrowIcon />
          </Link>
        </div>
      </details>
    </div>
  );
}

function TeamGroup({
  label,
  teams,
  currentID,
  onSwitch,
  accent,
}: {
  label: string;
  teams: Team[];
  currentID?: string;
  onSwitch: (id: string) => void;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={[
          'px-2 pt-1 pb-0.5 text-[9px] font-bold tracking-[0.18em] uppercase font-tight',
          accent ? 'text-accent' : 'text-faint',
        ].join(' ')}
      >
        {label}
      </div>
      {teams.map((t) => {
        const active = t.id === currentID;
        return (
          <button
            key={t.id}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onSwitch(t.id);
              // close the details
              const det = (e.currentTarget.closest('details') as HTMLDetailsElement | null);
              if (det) det.open = false;
            }}
            className={[
              'flex items-center gap-2 px-2 py-1.5 rounded-md text-left cursor-pointer transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active ? 'bg-surface' : 'hover:bg-surface',
            ].join(' ')}
          >
            <TeamDot team={t} />
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-semibold text-ink font-tight truncate leading-tight">
                {t.name}
              </span>
              <span className="block text-[9px] font-medium uppercase tracking-[0.14em] text-faint font-tight">
                {t.memberCount} {t.memberCount === 1 ? 'member' : 'members'}
              </span>
            </span>
            {active && (
              <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
                On
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TeamDot({ team }: { team: Team }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 text-[10px] font-bold tracking-[0.04em] text-white"
      style={{ background: team.color }}
    >
      {team.shortName}
    </span>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-faint flex-shrink-0"
      aria-hidden="true"
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7h8M7 3l4 4-4 4" />
    </svg>
  );
}
