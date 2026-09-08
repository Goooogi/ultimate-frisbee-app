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
import { TeamLogo } from '@/components/team-logo';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';
import { WfdfFlag } from '@/components/wfdf/wfdf-flag';
import { teamMeta } from '@/lib/ufa/teams';
import {
  getUfaSeasonCompleteCard,
  getUsauSeasonCompleteCard,
  type UfaSeasonCompleteCard,
  type UsauSeasonCompleteCard,
  type WfdfSeasonCompleteCard,
} from '@/lib/home/season-complete';

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

// ─── Shared champion-rows card (UFA / USAU / WFDF) ───────────────────────────
// ONE row per division (the champion only), capped at DISPLAY_CAP with a
// "+N more divisions" footer linking to the event. This keeps every card's
// content height converged regardless of how many divisions an event runs
// (WMUCC's ~10 masters divisions vs. WUCC's 3) — carousel pages stretch to the
// tallest card, so a tall outlier blows out every other page's whitespace.

interface ChampionDisplayRow {
  key: string;
  division: string;
  mark: React.ReactNode;
  name: string;
  record: string | null;
}

function ChampionRowsCard({
  eyebrow,
  title,
  subtitle,
  rows,
  totalCount,
  href,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  rows: ChampionDisplayRow[];
  totalCount: number;
  href: string;
}) {
  const overflow = totalCount - rows.length;

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-7">
      <Link href={href} className="block no-underline group">
        <StandingsCardHeader eyebrow={eyebrow} title={title} />
        {subtitle && (
          <div className="font-sans font-bold text-[12px] text-muted -mt-2 mb-4 truncate group-hover:text-accent transition-colors">
            {subtitle}
          </div>
        )}
      </Link>

      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={row.key}
            className={[
              'flex items-center gap-3 py-2.5',
              i === 0 ? '' : 'border-t border-hairline',
            ].join(' ')}
          >
            <span className="font-tight text-[9px] font-bold tracking-[0.1em] uppercase text-faint w-[60px] flex-shrink-0">
              {row.division}
            </span>
            <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
              {row.mark}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-sans font-bold text-[14px] leading-tight text-ink truncate">
                {row.name}
              </div>
              {row.record && (
                <div className="font-mono text-[10.5px] text-faint mt-0.5 tabular">
                  {row.record}
                </div>
              )}
            </div>
            <span className="flex-shrink-0 inline-flex items-center gap-1 text-accent font-tight text-[9.5px] font-bold tracking-[0.1em] uppercase bg-accent/10 rounded-full px-2.5 py-1">
              <TrophyIcon />
              Champion
            </span>
          </div>
        ))}

        {overflow > 0 && (
          <Link
            href={href}
            className="flex items-center justify-between gap-2 py-2.5 border-t border-hairline no-underline hover:opacity-80 transition-opacity"
          >
            <span className="font-sans font-bold text-[12px] text-muted">
              +{overflow} more division{overflow === 1 ? '' : 's'}
            </span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-faint">
              <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── UFA — championship-game result ──────────────────────────────────────────

export async function UfaSeasonCompleteSection() {
  let card: UfaSeasonCompleteCard | null = null;
  try {
    card = await getUfaSeasonCompleteCard();
  } catch {
    return null;
  }
  if (!card) return null;

  const champMeta = teamMeta(card.championTeamID);
  const runnerUpMeta = teamMeta(card.runnerUpTeamID);

  const rows: ChampionDisplayRow[] = [
    {
      key: card.championTeamID,
      division: 'Championship',
      mark: <TeamLogo team={champMeta} size={26} />,
      name: champMeta.name ?? champMeta.abbr,
      record: [
        card.championRecord,
        `${card.championScore}–${card.runnerUpScore} vs. ${runnerUpMeta.abbr}`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];

  return (
    <ChampionRowsCard
      eyebrow={`UFA · ${card.year}`}
      title="Season Complete"
      rows={rows}
      totalCount={1}
      href={`/teams/${card.championTeamID}`}
    />
  );
}

// ─── USAU — Club Nationals champion per division ─────────────────────────────

export async function UsauSeasonCompleteSection() {
  let card: UsauSeasonCompleteCard | null = null;
  try {
    card = await getUsauSeasonCompleteCard();
  } catch {
    return null;
  }
  if (!card || card.champions.length === 0) return null;

  // Champions here are always CLUB (recentUsauMajorsWithChampions filters
  // competition_level='CLUB'), so no level qualifier is needed on the link.
  const rows: ChampionDisplayRow[] = card.champions.slice(0, DISPLAY_CAP).map((row) => ({
    key: `${row.division}-${row.teamId}`,
    division: row.division,
    mark: <UsauTeamLogo name={row.teamName} genderDivision={row.division} size={22} />,
    name: row.teamName,
    record: null,
  }));

  return (
    <ChampionRowsCard
      eyebrow={`USAU · ${card.season}`}
      title="Season Complete"
      subtitle={card.name}
      rows={rows}
      totalCount={card.champions.length}
      href={`/usau/events/${card.slug}`}
    />
  );
}

// ─── WFDF — champion per division ────────────────────────────────────────────

export function WfdfSeasonCompleteSection({ card }: { card: WfdfSeasonCompleteCard }) {
  if (card.champions.length === 0) return null;

  const rows: ChampionDisplayRow[] = card.champions.slice(0, DISPLAY_CAP).map((row) => ({
    key: row.teamId,
    division: row.division,
    mark: <WfdfFlag countryCode={row.countryCode} size={18} />,
    name: row.name,
    record: row.record,
  }));

  return (
    <ChampionRowsCard
      eyebrow={`WFDF · ${card.year}`}
      title="Season Complete"
      subtitle={card.name}
      rows={rows}
      totalCount={card.champions.length}
      href={`/wfdf/events/${card.slug}`}
    />
  );
}
