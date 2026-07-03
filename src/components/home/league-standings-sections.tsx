// League standings / rankings sections for the home page.
// Three sibling sections — PUL, WUL, USAU — each matching the design language
// of StandingsStrip (dark left panel + light right content, same tokens, same
// padding cadence). Server components by default; the USAU division toggle is
// a 'use client' sub-component that receives already-fetched data as props.

import Link from 'next/link';
import { getPulCurrentSeason } from '@/lib/pul/data';
import type { PulStandingRow } from '@/lib/pul/data';
import { getWulCurrentSeason } from '@/lib/wul/data';
import type { WulStandingRow } from '@/lib/wul/data';
import type { OfficialRankedTeam } from '@/lib/usau/data';
import {
  getPulStandingsCached,
  getWulStandingsCached,
  listOfficialUsauRankingsCached,
} from '@/lib/cached-readers';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { WulTeamLogo } from '@/components/wul-team-logo';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';
import { UsauDivisionToggle } from '@/components/home/usau-division-toggle';

// ─── Shared icon ──────────────────────────────────────────────────────────────

function TrophyIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0"
    >
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

  // Show all teams (season over — full table is informative)
  const displayRows = rows.slice(0, 8);

  return (
    <section
      aria-label="PUL final standings"
      className="px-5 lg:px-12 pt-2 pb-8 lg:pb-10"
    >
      <div className="bg-surface border border-border grid grid-cols-1 md:grid-cols-[200px_1fr]">
        {/* Dark left panel — same chrome as StandingsStrip */}
        <div className="bg-[#0E0E0C] text-[#F4F2EB] px-5 py-5 lg:px-6 lg:py-6 flex flex-col justify-between gap-3 min-h-[160px]">
          <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-[rgba(244,242,235,0.55)]">
            PUL · Final Standings
          </span>
          <div>
            <div className="font-display italic font-bold text-[32px] lg:text-[36px] leading-[0.95] tracking-[-0.02em]">
              Season
              <br />
              Complete
            </div>
            <div className="font-mono text-[11px] mt-3 text-[rgba(244,242,235,0.55)]">
              {season} season
            </div>
          </div>
        </div>

        {/* Standings list */}
        <div className="px-5 py-4 lg:px-6 flex flex-col">
          {displayRows.map((row, i) => {
            const rank = i + 1;
            const record = `${row.wins}-${row.losses}`;
            return (
              <Link
                key={row.team.id}
                href={`/pul/teams/${row.team.id}`}
                className="flex items-center gap-3 py-2.5 border-b border-hairline last:border-b-0 hover:opacity-80 transition-opacity"
              >
                <span className="font-mono text-[11px] text-faint w-[18px] flex-shrink-0 tabular">
                  {String(rank).padStart(2, '0')}
                </span>
                <PulTeamLogo team={row.team} size={26} />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-display italic font-bold text-[14px] lg:text-[15px] leading-none text-ink truncate">
                      {row.team.name}
                    </div>
                    <div className="font-mono text-[10.5px] text-muted mt-0.5 tabular">
                      {record}
                      {row.pointDiff !== 0 && (
                        <span className="ml-1 text-faint">
                          · {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
                        </span>
                      )}
                    </div>
                  </div>
                  {row.champion && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-accent font-tight text-[9.5px] font-bold tracking-[0.1em] uppercase border border-accent/40 rounded px-1.5 py-0.5">
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
    </section>
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

  const displayRows = rows.slice(0, 8);

  return (
    <section
      aria-label="WUL final standings"
      className="px-5 lg:px-12 pt-2 pb-8 lg:pb-10"
    >
      <div className="bg-surface border border-border grid grid-cols-1 md:grid-cols-[200px_1fr]">
        {/* Dark left panel */}
        <div className="bg-[#0E0E0C] text-[#F4F2EB] px-5 py-5 lg:px-6 lg:py-6 flex flex-col justify-between gap-3 min-h-[160px]">
          <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-[rgba(244,242,235,0.55)]">
            WUL · Final Standings
          </span>
          <div>
            <div className="font-display italic font-bold text-[32px] lg:text-[36px] leading-[0.95] tracking-[-0.02em]">
              Season
              <br />
              Complete
            </div>
            <div className="font-mono text-[11px] mt-3 text-[rgba(244,242,235,0.55)]">
              {season} season
            </div>
          </div>
        </div>

        {/* Standings list */}
        <div className="px-5 py-4 lg:px-6 flex flex-col">
          {displayRows.map((row, i) => {
            const rank = i + 1;
            const record = `${row.wins}-${row.losses}`;
            return (
              <Link
                key={row.team.id}
                href={`/wul/teams/${row.team.id}`}
                className="flex items-center gap-3 py-2.5 border-b border-hairline last:border-b-0 hover:opacity-80 transition-opacity"
              >
                <span className="font-mono text-[11px] text-faint w-[18px] flex-shrink-0 tabular">
                  {String(rank).padStart(2, '0')}
                </span>
                <WulTeamLogo team={row.team} size={26} />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-display italic font-bold text-[14px] lg:text-[15px] leading-none text-ink truncate">
                      {row.team.name}
                    </div>
                    <div className="font-mono text-[10.5px] text-muted mt-0.5 tabular">
                      {record}
                      {row.pointDiff !== 0 && (
                        <span className="ml-1 text-faint">
                          · {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
                        </span>
                      )}
                    </div>
                  </div>
                  {row.champion && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-accent font-tight text-[9.5px] font-bold tracking-[0.1em] uppercase border border-accent/40 rounded px-1.5 py-0.5">
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
    </section>
  );
}

// ─── USAU Official Rankings ───────────────────────────────────────────────────

// The 5 published rank sets + their display labels / logo metadata.
const RANK_DIVISIONS = [
  {
    key: 'Club-Men' as const,
    label: 'Club Men',
    shortLabel: 'Club M',
    genderDivision: 'Men',
    competitionLevel: 'CLUB',
  },
  {
    key: 'Club-Women' as const,
    label: 'Club Women',
    shortLabel: 'Club W',
    genderDivision: 'Women',
    competitionLevel: 'CLUB',
  },
  {
    key: 'Club-Mixed' as const,
    label: 'Club Mixed',
    shortLabel: 'Mixed',
    genderDivision: 'Mixed',
    competitionLevel: 'CLUB',
  },
  {
    key: 'College-Men' as const,
    label: 'College Men',
    shortLabel: 'College M',
    genderDivision: 'Men',
    competitionLevel: 'COLLEGE_D1',
  },
  {
    key: 'College-Women' as const,
    label: 'College Women',
    shortLabel: 'College W',
    genderDivision: 'Women',
    competitionLevel: 'COLLEGE_D1',
  },
] as const;

export type UsauDivisionData = {
  key: string;
  label: string;
  shortLabel: string;
  genderDivision: string;
  competitionLevel: string;
  season: number;
  week: number;
  scrapedAt: string | null;
  teams: OfficialRankedTeam[];
};

export async function UsauRankingsSection() {
  // Fetch all 5 divisions in parallel — a failure in any one is non-fatal.
  const results = await Promise.allSettled(
    RANK_DIVISIONS.map((div) => listOfficialUsauRankingsCached(div.key, 16)),
  );

  const divisions: UsauDivisionData[] = RANK_DIVISIONS.map((div, i) => {
    const res = results[i];
    if (res.status === 'fulfilled') {
      return {
        key: div.key,
        label: div.label,
        shortLabel: div.shortLabel,
        genderDivision: div.genderDivision,
        competitionLevel: div.competitionLevel,
        season: res.value.season,
        week: res.value.week,
        scrapedAt: res.value.scrapedAt,
        teams: res.value.teams,
      };
    }
    return {
      key: div.key,
      label: div.label,
      shortLabel: div.shortLabel,
      genderDivision: div.genderDivision,
      competitionLevel: div.competitionLevel,
      season: 0,
      week: 0,
      scrapedAt: null,
      teams: [],
    };
  });

  // Only render divisions that have data.
  const populated = divisions.filter((d) => d.teams.length > 0);

  // Derive a shared season + attribution line from the first populated division.
  const firstPopulated = populated[0];

  if (populated.length === 0) {
    // Graceful "coming soon" placeholder — same chrome, no rows.
    return (
      <section
        aria-label="USAU official rankings"
        className="px-5 lg:px-12 pt-2 pb-8 lg:pb-10"
      >
        <div className="bg-surface border border-border grid grid-cols-1 md:grid-cols-[200px_1fr]">
          <div className="bg-[#0E0E0C] text-[#F4F2EB] px-5 py-5 lg:px-6 lg:py-6 flex flex-col justify-between gap-3 min-h-[160px]">
            <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-[rgba(244,242,235,0.55)]">
              USAU · Official Rankings
            </span>
            <div>
              <div className="font-display italic font-bold text-[32px] lg:text-[36px] leading-[0.95] tracking-[-0.02em]">
                Top of the
                <br />
                Division
              </div>
            </div>
          </div>
          <div className="px-5 py-6 lg:px-6 flex items-center">
            <span className="font-mono text-[11px] text-faint tracking-[0.06em]">
              Rankings coming soon — check back after the first ranking week.
            </span>
          </div>
        </div>
      </section>
    );
  }

  const scrapedAtLabel = firstPopulated?.scrapedAt
    ? `Updated ${new Date(firstPopulated.scrapedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`
    : null;

  const attributionLabel = [
    firstPopulated?.season ? `${firstPopulated.season} season` : null,
    firstPopulated?.week ? `Week ${firstPopulated.week}` : null,
    scrapedAtLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      aria-label="USAU official rankings"
      className="px-5 lg:px-12 pt-2 pb-8 lg:pb-10"
    >
      <div className="bg-surface border border-border grid grid-cols-1 md:grid-cols-[200px_1fr]">
        {/* Dark left panel */}
        <div className="bg-[#0E0E0C] text-[#F4F2EB] px-5 py-5 lg:px-6 lg:py-6 flex flex-col justify-between gap-3 min-h-[180px]">
          <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-[rgba(244,242,235,0.55)]">
            USAU · Official Rankings
          </span>
          <div>
            <div className="font-display italic font-bold text-[32px] lg:text-[36px] leading-[0.95] tracking-[-0.02em]">
              Top of the
              <br />
              Division
            </div>
            {attributionLabel && (
              <div className="font-mono text-[10px] mt-3 text-[rgba(244,242,235,0.55)] leading-relaxed">
                {attributionLabel}
              </div>
            )}
          </div>
        </div>

        {/* Division toggle + ranked list — client component receives pre-fetched data */}
        <UsauDivisionToggle divisions={populated} />
      </div>
    </section>
  );
}
