'use client';

// Compact scope chip + dropdown in the playbook sidebar.
//
// Scopes: a magic "Personal" pseudo-team (id = `__personal__`) plus every
// team the user belongs to. The editor uses the id to pick which plays it
// loads. Clicking "Manage teams" routes to /playbook/teams.

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { Team } from '@/lib/playbook/data';

const PERSONAL_ID = '__personal__';

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

  const isPersonal = !currentID || currentID === PERSONAL_ID;
  const current = isPersonal ? null : teams.find((t) => t.id === currentID) ?? null;
  const owned = teams.filter((t) => t.role === 'owner');
  const coachOf = teams.filter((t) => t.role === 'coach');
  const memberOf = teams.filter((t) => t.role === 'member');

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight px-1">
        Scope
      </div>

      <details ref={detailsRef} className="relative group">
        <summary
          aria-label={
            current ? `Current team: ${current.name}. Click to switch.` : 'Personal scope. Click to switch.'
          }
          className={[
            'list-none cursor-pointer flex items-center gap-2 px-2 py-2 rounded-full',
            'bg-ink/5 hover:bg-ink/10 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          {current ? <TeamDot team={current} /> : <PersonalDot />}
          <span className="flex-1 min-w-0 text-left">
            <span className="block text-[12px] font-bold text-ink font-tight truncate leading-tight">
              {current?.name ?? 'Personal'}
            </span>
            <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-faint font-tight mt-0.5">
              {current ? current.role : 'My plays'}
            </span>
          </span>
          <ChevronIcon />
        </summary>

        <div
          className={[
            'absolute left-0 right-0 top-full mt-1 z-30',
            'bg-surface rounded-card shadow-lift p-1.5',
            'flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto',
          ].join(' ')}
        >
          {/* Personal scope — always present as a pseudo-team. */}
          <PersonalRow active={isPersonal} onSelect={() => onSwitch(PERSONAL_ID)} />

          {owned.length > 0 && (
            <TeamGroup
              label="Owned"
              teams={owned}
              currentID={currentID}
              onSwitch={onSwitch}
            />
          )}
          {coachOf.length > 0 && (
            <TeamGroup
              label="Coaching"
              teams={coachOf}
              currentID={currentID}
              onSwitch={onSwitch}
            />
          )}
          {memberOf.length > 0 && (
            <TeamGroup
              label="Member"
              teams={memberOf}
              currentID={currentID}
              onSwitch={onSwitch}
            />
          )}

          <div className="h-px bg-hairline my-0.5" />

          <Link
            href="/playbook/teams"
            className="flex items-center justify-between gap-2 px-2 py-2 rounded-full hover:bg-ink/5 transition-colors text-[11px] font-bold tracking-[0.14em] uppercase text-ink font-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Manage teams
            <ArrowIcon />
          </Link>
        </div>
      </details>
    </div>
  );
}

function PersonalRow({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onSelect();
        const det = e.currentTarget.closest('details') as HTMLDetailsElement | null;
        if (det) det.open = false;
      }}
      className={[
        'flex items-center gap-2 px-2 py-1.5 rounded-full text-left cursor-pointer transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active ? 'bg-ink/5' : 'hover:bg-ink/5',
      ].join(' ')}
    >
      <PersonalDot />
      <span className="flex-1 min-w-0">
        <span className="block text-[12px] font-semibold text-ink font-tight truncate leading-tight">
          Personal
        </span>
        <span className="block text-[9px] font-medium uppercase tracking-[0.14em] text-faint font-tight">
          Just for me
        </span>
      </span>
      {active && (
        <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
          On
        </span>
      )}
    </button>
  );
}

function TeamGroup({
  label,
  teams,
  currentID,
  onSwitch,
}: {
  label: string;
  teams: Team[];
  currentID?: string;
  onSwitch: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 pt-1 pb-0.5 text-[9px] font-bold tracking-[0.18em] uppercase font-tight text-faint">
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
              const det = (e.currentTarget.closest('details') as HTMLDetailsElement | null);
              if (det) det.open = false;
            }}
            className={[
              'flex items-center gap-2 px-2 py-1.5 rounded-full text-left cursor-pointer transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active ? 'bg-ink/5' : 'hover:bg-ink/5',
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
      className="inline-flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 text-[10px] font-bold tracking-[0.04em] text-white"
      style={{ background: team.color }}
    >
      {team.shortName}
    </span>
  );
}

function PersonalDot() {
  // Inverted token so it reads as the "neutral / me" option distinct from
  // any team color.
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 bg-ink text-bg"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M3 13.5c0-2.5 2.24-4 5-4s5 1.5 5 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
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
