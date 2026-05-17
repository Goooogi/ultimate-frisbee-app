// The two sub-app tiles that stack to the right of the hero on desktop and
// below the hero on mobile: Playbook (with field diagram preview) and
// Fantasy (with leaderboard preview).

import Link from 'next/link';
import { FieldDiagram } from './field-diagram';

const ACCENT = '#FF3D00';

// Stub data — both sub-apps not yet built.
const FANTASY_LB = [
  { rk: 1, name: 'Hammer Time', mv: '+12' },
  { rk: 2, name: 'Field Goals', mv: '+04' },
  { rk: 3, name: 'The Pull',    mv: '-02' },
  { rk: 4, name: 'Layout Kings', mv: '+18' },
];

export function PlaybookTile() {
  return (
    <Link
      href="/playbook"
      className="group bg-white border border-[#E5E1D6] grid grid-cols-[1.15fr_1fr] gap-[18px] overflow-hidden relative hover:border-[#0E0E0C] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00]"
    >
      <div className="flex flex-col min-w-0 p-5 lg:p-6">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full"
            style={{
              color: ACCENT,
              background: `${ACCENT}1A`,
              border: `1px solid ${ACCENT}40`,
            }}
          >
            02 · Playbook
          </span>
          <span className="inline-flex items-center font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full text-[#6F6B62] bg-[rgba(14,14,12,0.04)] border border-[rgba(14,14,12,0.08)]">
            Beta
          </span>
        </div>
        <div className="font-display italic font-bold text-[28px] lg:text-[32px] leading-[0.95] tracking-[-0.02em] text-[#0E0E0C] mt-3">
          Diagram,
          <br />
          share, study.
        </div>
        <p className="text-[#6F6B62] text-[12.5px] leading-[1.5] m-0 mt-2">
          A field for the rest of the field. Sketch plays and sync to your team.
        </p>
        <span className="mt-auto pt-3 font-sans text-[11px] font-bold tracking-[0.14em] uppercase text-[#0E0E0C] inline-flex items-center gap-1.5 group-hover:text-[#FF3D00] transition-colors duration-150">
          Open beta <Arrow />
        </span>
      </div>
      <div className="bg-[#ECE9DF] -m-px self-stretch flex items-center justify-center p-3 min-w-0">
        <FieldDiagram width={220} height={140} accent={ACCENT} />
      </div>
    </Link>
  );
}

export function FantasyTile() {
  return (
    <Link
      href="/fantasy"
      className="group bg-[#ECE9DF] border border-[#E5E1D6] grid grid-cols-[1.15fr_1fr] gap-[18px] overflow-hidden relative hover:border-[#0E0E0C] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00]"
    >
      <div className="flex flex-col min-w-0 p-5 lg:p-6">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full"
            style={{
              color: ACCENT,
              background: `${ACCENT}1A`,
              border: `1px solid ${ACCENT}40`,
            }}
          >
            03 · Fantasy
          </span>
          <span className="inline-flex items-center font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full text-[#6F6B62] bg-[rgba(14,14,12,0.04)] border border-[rgba(14,14,12,0.08)]">
            Aug 2026
          </span>
        </div>
        <div className="font-display italic font-bold text-[28px] lg:text-[32px] leading-[0.95] tracking-[-0.02em] text-[#0E0E0C] mt-3">
          Draft, set,
          <br />
          outscore.
        </div>
        <p className="text-[#6F6B62] text-[12.5px] leading-[1.5] m-0 mt-2">
          Run a UFA fantasy league with friends. Auto-scored, no spreadsheets.
        </p>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="font-sans text-[11px] font-bold tracking-[0.14em] uppercase text-[#0E0E0C] inline-flex items-center gap-1.5 group-hover:text-[#FF3D00] transition-colors duration-150">
            Get notified <Arrow />
          </span>
          <span className="font-mono text-[10px] text-[#A6A29A]">1,284 waitlist</span>
        </div>
      </div>
      <div className="bg-white -m-px self-stretch px-3.5 py-3.5 flex flex-col justify-center gap-1 min-w-0 font-mono">
        {FANTASY_LB.map((r, i) => (
          <div
            key={r.rk}
            className="grid grid-cols-[18px_1fr_auto] gap-2 items-center text-[11px] py-[3px]"
            style={{
              borderBottom: i === FANTASY_LB.length - 1 ? 'none' : '1px solid #EFECE3',
            }}
          >
            <span
              className="font-bold"
              style={{ color: r.rk === 1 ? ACCENT : '#A6A29A' }}
            >
              {String(r.rk).padStart(2, '0')}
            </span>
            <span className="text-[#0E0E0C] font-semibold truncate">{r.name}</span>
            <span
              className="font-bold"
              style={{ color: r.mv.startsWith('+') ? '#1F8A5B' : '#6F6B62' }}
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
