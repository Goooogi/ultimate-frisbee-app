// PUL / WUL final standings — compact RankingsCardA-style cards. Per the
// Home v2 design spec these aren't full-width sections; they render as a
// two-up row (PUL left, WUL right; stacked on mobile) directly below the
// rankings/activity grid, reusing the same card chrome as RankingsCard.
// Each returns null if that league has no data (offseason-safe) — the
// caller (page.tsx) only renders the wrapping row when at least one exists.

import Link from 'next/link';
import { getPulCurrentSeason } from '@/lib/pul/data';
import type { PulStandingRow } from '@/lib/pul/data';
import { getWulCurrentSeason } from '@/lib/wul/data';
import type { WulStandingRow } from '@/lib/wul/data';
import { getPulStandingsCached, getWulStandingsCached } from '@/lib/cached-readers';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { WulTeamLogo } from '@/components/wul-team-logo';

const DISPLAY_CAP = 8;

// ─── Shared icon ──────────────────────────────────────────────────────────────

function TrophyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
      <path
        d="M6 4h12v3a6 6 0 0 1-12 0V4Z M6 5H3v2a3 3 0 0 0 3 3 M18 5h3v2a3 3 0 0 1-3 3 M9 14.5h6 M10 18h4 M9 18h6v2H9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StandingsCardHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <span className="block text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-2">
        {eyebrow}
      </span>
      <h2 className="font-display italic font-bold text-[22px] lg:text-[26px] leading-[0.95] tracking-[-0.02em] text-ink m-0">
        {title}
      </h2>
    </div>
  );
}

// ─── PUL Final Standings ──────────────────────────────────────────────────────

export async function PulStandingsSection() {
  let rows: PulStandingRow[] = [];
  const season = await getPulCurrentSeason();
  try {
    rows = await getPulStandingsCached(season);
  } catch {
    return null;
  }
  if (rows.length === 0) return null;

  const displayRows = rows.slice(0, DISPLAY_CAP);

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-7">
      <StandingsCardHeader eyebrow={`PUL · ${season} Season`} title="Season Complete" />
      <div className="flex flex-col">
        {displayRows.map((row, i) => {
          const rank = i + 1;
          const record = `${row.wins}-${row.losses}`;
          return (
            <Link
              key={row.team.id}
              href={`/pul/teams/${row.team.id}`}
              className={[
                'flex items-center gap-3 py-2.5',
                i === 0 ? '' : 'border-t border-hairline',
                'hover:opacity-80 transition-opacity',
              ].join(' ')}
            >
              <span className="font-mono text-[12px] font-bold text-faint w-[22px] flex-shrink-0 tabular">
                {String(rank).padStart(2, '0')}
              </span>
              <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
                <PulTeamLogo team={row.team} size={26} />
              </span>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-sans font-bold text-[14px] leading-tight text-ink truncate">
                    {row.team.name}
                  </div>
                  <div className="font-mono text-[10.5px] text-faint mt-0.5 tabular">
                    {record}
                    {row.pointDiff !== 0 && (
                      <span className="ml-1">
                        · {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
                      </span>
                    )}
                  </div>
                </div>
                {row.champion && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-accent font-tight text-[9.5px] font-bold tracking-[0.1em] uppercase bg-accent/10 rounded-full px-2.5 py-1">
                    <TrophyIcon />
                    Champion
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── WUL Final Standings ──────────────────────────────────────────────────────

export async function WulStandingsSection() {
  let rows: WulStandingRow[] = [];
  const season = await getWulCurrentSeason();
  try {
    rows = await getWulStandingsCached(season);
  } catch {
    return null;
  }
  if (rows.length === 0) return null;

  const displayRows = rows.slice(0, DISPLAY_CAP);

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-7">
      <StandingsCardHeader eyebrow={`WUL · ${season} Season`} title="Season Complete" />
      <div className="flex flex-col">
        {displayRows.map((row, i) => {
          const rank = i + 1;
          const record = `${row.wins}-${row.losses}`;
          return (
            <Link
              key={row.team.id}
              href={`/wul/teams/${row.team.id}`}
              className={[
                'flex items-center gap-3 py-2.5',
                i === 0 ? '' : 'border-t border-hairline',
                'hover:opacity-80 transition-opacity',
              ].join(' ')}
            >
              <span className="font-mono text-[12px] font-bold text-faint w-[22px] flex-shrink-0 tabular">
                {String(rank).padStart(2, '0')}
              </span>
              <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
                <WulTeamLogo team={row.team} size={26} />
              </span>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-sans font-bold text-[14px] leading-tight text-ink truncate">
                    {row.team.name}
                  </div>
                  <div className="font-mono text-[10.5px] text-faint mt-0.5 tabular">
                    {record}
                    {row.pointDiff !== 0 && (
                      <span className="ml-1">
                        · {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
                      </span>
                    )}
                  </div>
                </div>
                {row.champion && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-accent font-tight text-[9.5px] font-bold tracking-[0.1em] uppercase bg-accent/10 rounded-full px-2.5 py-1">
                    <TrophyIcon />
                    Champion
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
