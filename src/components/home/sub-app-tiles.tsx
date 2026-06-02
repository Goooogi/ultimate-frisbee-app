'use client';

// The two sub-app tiles that stack to the right of the hero on desktop and
// below the hero on mobile: Playbook (with field diagram preview) and
// Fantasy (with leaderboard preview).

import Link from 'next/link';
import { FieldDiagram } from './field-diagram';
import { useTheme } from '@/lib/use-theme';

// Stub data — both sub-apps not yet built.
const FANTASY_LB = [
  { rk: 1, name: 'Hammer Time', mv: '+12' },
  { rk: 2, name: 'Field Goals', mv: '+04' },
  { rk: 3, name: 'The Pull',    mv: '-02' },
  { rk: 4, name: 'Layout Kings', mv: '+18' },
];

export function PlaybookTile() {
  const [theme] = useTheme();
  return (
    <Link
      href="/playbook"
      className="group bg-surface border border-border grid grid-cols-[1.15fr_1fr] gap-[18px] overflow-hidden relative hover:border-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex flex-col min-w-0 p-5 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full text-accent bg-[rgb(var(--accent)/0.1)] border border-[rgb(var(--accent)/0.25)]">
            02 · Playbook
          </span>
          <span className="inline-flex items-center font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full text-muted bg-[rgb(var(--ink)/0.04)] border border-[rgb(var(--ink)/0.08)]">
            Beta
          </span>
        </div>
        <div className="font-display italic font-bold text-[28px] lg:text-[32px] leading-[0.95] tracking-[-0.02em] text-ink mt-3">
          Diagram,
          <br />
          share, study.
        </div>
        <p className="text-muted text-[12.5px] leading-[1.5] m-0 mt-2">
          A field for the rest of the field. Sketch plays and sync to your team.
        </p>
        <span className="mt-auto pt-3 font-sans text-[11px] font-bold tracking-[0.14em] uppercase text-ink inline-flex items-center gap-1.5 group-hover:text-accent transition-colors duration-150">
          Open beta <Arrow />
        </span>
      </div>
      <div className="bg-surface-hi -m-px self-stretch flex items-center justify-center p-3 min-w-0">
        <FieldDiagram
          width={220}
          height={140}
          accent="rgb(var(--accent))"
          dark={theme === 'broadcast'}
        />
      </div>
    </Link>
  );
}

export function FantasyTile() {
  return (
    <Link
      href="/fantasy"
      className="group bg-surface-hi border border-border grid grid-cols-[1.15fr_1fr] gap-[18px] overflow-hidden relative hover:border-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex flex-col min-w-0 p-5 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full text-accent bg-[rgb(var(--accent)/0.1)] border border-[rgb(var(--accent)/0.25)]">
            03 · Fantasy
          </span>
          <span className="inline-flex items-center font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full text-muted bg-[rgb(var(--ink)/0.04)] border border-[rgb(var(--ink)/0.08)]">
            Aug 2026
          </span>
        </div>
        <div className="font-display italic font-bold text-[28px] lg:text-[32px] leading-[0.95] tracking-[-0.02em] text-ink mt-3">
          Draft, set,
          <br />
          outscore.
        </div>
        <p className="text-muted text-[12.5px] leading-[1.5] m-0 mt-2">
          Run a UFA fantasy league with friends. Auto-scored, no spreadsheets.
        </p>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="font-sans text-[11px] font-bold tracking-[0.14em] uppercase text-ink inline-flex items-center gap-1.5 group-hover:text-accent transition-colors duration-150">
            Get notified <Arrow />
          </span>
          <span className="font-mono text-[10px] text-faint">1,284 waitlist</span>
        </div>
      </div>
      <div className="bg-surface -m-px self-stretch px-3.5 py-3.5 flex flex-col justify-center gap-1 min-w-0 font-mono">
        {FANTASY_LB.map((r, i) => (
          <div
            key={r.rk}
            className={[
              'grid grid-cols-[18px_1fr_auto] gap-2 items-center text-[11px] py-[3px]',
              i === FANTASY_LB.length - 1 ? '' : 'border-b border-hairline',
            ].join(' ')}
          >
            <span
              className={['font-bold', r.rk === 1 ? 'text-accent' : 'text-faint'].join(' ')}
            >
              {String(r.rk).padStart(2, '0')}
            </span>
            <span className="text-ink font-semibold truncate">{r.name}</span>
            <span
              className={[
                'font-bold',
                r.mv.startsWith('+') ? 'text-[#1F8A5B]' : 'text-muted',
              ].join(' ')}
            >
              {r.mv}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function Arrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}
