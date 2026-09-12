// "Season complete" cards — one per league whose season-phase is `complete`
// (see src/lib/home/season-phase.ts). They share ONE shell (h-full flex-col,
// content top, footer pinned to the bottom); the carousel/grid
// (StandingsCarousel) stretches every card in a row to the tallest, so each
// card shows its FULL content rather than trimming to a row budget (Hunter,
// 2026-09-11 — a trimmed card just read as dead space):
//
//   UFA        championship + semifinals, then every team of the title year
//   PUL / WUL  championship + semifinals (+ WUL 3rd place), then every team
//   USAU       champion / finalist / semifinalists per division
//   WFDF       top-3 per division when ≤ 3 divisions (WUCC/WJUC = 9), else the
//              champion per division capped at WFDF_MAX_CHAMPION_ROWS + "+N more"

import Link from 'next/link';
import type { PulStandingRow } from '@/lib/pul/data';
import type { WulStandingRow } from '@/lib/wul/data';
import type { PulRecentGame, WulRecentGame } from '@/app/page';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { WulTeamLogo } from '@/components/wul-team-logo';
import { TeamLogo } from '@/components/team-logo';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';
import { WfdfFlag } from '@/components/wfdf/wfdf-flag';
import { ScoreDuo } from '@/components/home/recent-results-card';
import { teamMeta } from '@/lib/ufa/teams';
import type {
  UfaSeasonCompleteCard,
  UsauSeasonCompleteCard,
  WfdfSeasonCompleteCard,
} from '@/lib/home/season-complete';

/** Above this many divisions a WFDF card shows champions only. */
const WFDF_TOP3_MAX_DIVISIONS = 3;
/** Champions-only WFDF cards cap here with a "+N more divisions" footer. */
const WFDF_MAX_CHAMPION_ROWS = 8;

// ─── Shared chrome ───────────────────────────────────────────────────────────

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

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-faint">
      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

function ChampionPill() {
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-1 text-accent font-tight text-[9.5px] font-bold tracking-[0.1em] uppercase bg-accent/10 rounded-full px-2.5 py-1">
      <TrophyIcon />
      Champion
    </span>
  );
}

function MutedPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex-shrink-0 inline-flex items-center font-tight text-[9.5px] font-bold tracking-[0.1em] uppercase text-faint bg-[rgb(var(--ink)/0.05)] rounded-full px-2.5 py-1">
      {children}
    </span>
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

/** The one card shell every season-complete card uses. `href` makes the
 *  header a link; `footer` is pinned to the bottom so a short card still
 *  reads as finished rather than empty. */
function SeasonCardShell({
  eyebrow,
  subtitle,
  href,
  footer,
  children,
}: {
  eyebrow: string;
  subtitle?: string;
  href: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col bg-surface rounded-card-lg shadow-card p-5 lg:p-6">
      <Link href={href} className="block no-underline group">
        <StandingsCardHeader eyebrow={eyebrow} title="Season Complete" />
        {subtitle && (
          <div className="font-sans font-bold text-[12px] text-muted -mt-2 mb-4 truncate group-hover:text-accent transition-colors">
            {subtitle}
          </div>
        )}
      </Link>
      <div className="flex flex-col">{children}</div>
      {footer && <div className="mt-auto pt-2">{footer}</div>}
    </div>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 py-2.5 border-t border-hairline no-underline hover:opacity-80 transition-opacity"
    >
      <span className="font-sans font-bold text-[12px] text-muted">{label}</span>
      <ChevronRight />
    </Link>
  );
}

const rowClass = (i: number) => ['flex items-center gap-3 py-2', i === 0 ? '' : 'border-t border-hairline'].join(' ');

/** Round label column for score rows: "Final" / "Semi" / "3rd place". Kept
 *  to 48px — a 308px phone card (or a 3-across lg card with p-6) fits label +
 *  two 22px marks + abbrs + a two-digit score with ~9px to spare, which is also
 *  why the final's trophy is the label's accent colour rather than a separate
 *  icon (it overlapped "OAK", 2026-09-11). Measure before widening anything. */
function RowLabel({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`font-tight text-[9px] font-bold tracking-[0.1em] uppercase w-[48px] leading-tight flex-shrink-0 ${accent ? 'text-accent' : 'text-faint'}`}
    >
      {children}
    </span>
  );
}

/** Score row: winner at full weight, loser dimmed, score on the right. Used by
 *  the UFA bracket and the PUL/WUL playoff rows. */
function PlayoffScoreRow({
  i,
  label,
  href,
  awayMark,
  homeMark,
  awayAbbr,
  homeAbbr,
  awayScore,
  homeScore,
  champion,
}: {
  i: number;
  label: string;
  href: string;
  awayMark: React.ReactNode;
  homeMark: React.ReactNode;
  awayAbbr: string;
  homeAbbr: string;
  awayScore: number;
  homeScore: number;
  champion: boolean;
}) {
  const awayWin = awayScore > homeScore;
  const side = (win: boolean) => (win ? 'opacity-100' : 'opacity-55');
  return (
    <Link href={href} className={`${rowClass(i)} hover:opacity-80 transition-opacity`}>
      <RowLabel accent={champion}>{label}</RowLabel>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className={`inline-flex rounded-full overflow-hidden flex-shrink-0 ${side(awayWin)}`}>{awayMark}</span>
        <span className={`font-sans font-bold text-[13px] text-ink flex-shrink-0 ${side(awayWin)}`}>{awayAbbr}</span>
        <span className="font-mono text-[10.5px] text-faint flex-shrink-0">—</span>
        <span className={`inline-flex rounded-full overflow-hidden flex-shrink-0 ${side(!awayWin)}`}>{homeMark}</span>
        <span className={`font-sans font-bold text-[13px] text-ink flex-shrink-0 ${side(!awayWin)}`}>{homeAbbr}</span>
      </div>
      <ScoreDuo awayScore={awayScore} homeScore={homeScore} awayWin={awayWin} />
    </Link>
  );
}

/** Standings row (UFA/PUL/WUL): rank, logo, name + record, champion pill.
 *  `meta` is an optional trailing note on the record line (UFA division). */
function StandingRow({
  i,
  rank,
  href,
  mark,
  name,
  record,
  pointDiff,
  meta,
  champion,
}: {
  i: number;
  rank: number;
  href: string;
  mark: React.ReactNode;
  name: string;
  record: string;
  pointDiff?: number;
  meta?: string;
  champion: boolean;
}) {
  return (
    <Link href={href} className={`${rowClass(i)} hover:opacity-80 transition-opacity`}>
      <span className="font-mono text-[12px] font-bold text-faint w-[22px] flex-shrink-0 tabular">
        {String(rank).padStart(2, '0')}
      </span>
      <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">{mark}</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-sans font-bold text-[14px] leading-tight text-ink truncate">{name}</div>
          <div className="font-mono text-[10.5px] text-faint mt-0.5 tabular">
            {record}
            {pointDiff != null && pointDiff !== 0 && (
              <span className="ml-1">
                · {pointDiff > 0 ? '+' : ''}
                {pointDiff}
              </span>
            )}
            {meta && <span className="ml-1">· {meta}</span>}
          </div>
        </div>
        {champion && <ChampionPill />}
      </div>
    </Link>
  );
}

/** A division's placement rows under a caption line ("D-I Men", "GGM Mixed").
 *  A caption instead of a label COLUMN: at phone width the 72px column plus
 *  the pill left ~50px for the team name ("Mas…"), 2026-09-11. */
function DivisionGroup({ i, label, children }: { i: number; label: string; children: React.ReactNode }) {
  return (
    <div className={i === 0 ? '' : 'border-t border-hairline mt-1'}>
      <div className="pt-3 pb-0.5 font-tight text-[9px] font-bold tracking-[0.1em] uppercase text-faint">{label}</div>
      {children}
    </div>
  );
}

/** Champion/finalist/podium row: mark, name + record, pill. */
function PlacementRow({
  i,
  mark,
  name,
  record,
  pill,
}: {
  i: number;
  mark: React.ReactNode;
  name: string;
  record: string | null;
  pill: React.ReactNode;
}) {
  return (
    <div className={rowClass(i)}>
      <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">{mark}</span>
      <div className="flex-1 min-w-0">
        <div className="font-sans font-bold text-[14px] leading-tight text-ink truncate">{name}</div>
        {record && <div className="font-mono text-[10.5px] text-faint mt-0.5 tabular">{record}</div>}
      </div>
      {pill}
    </div>
  );
}

// ─── UFA — championship + semis, then the rest of the playoff field ─────────
// Same shape as PUL/WUL; the table skips the four teams already in the score
// rows and numbers from 5. Falls back to the full bracket (incl. the
// divisional round) when the standings feed has already rolled to the next
// season.

const UFA_ROUND_LABEL: Record<UfaSeasonCompleteCard['playoffGames'][number]['round'], string> = {
  championship: 'Final',
  semifinal: 'Semi',
  divisional: 'Div. round',
};

export function UfaSeasonCompleteSection({ card }: { card: UfaSeasonCompleteCard | null }) {
  if (!card) return null;
  const hasStandings = card.standingsRows.length > 0;
  const games = hasStandings
    ? card.playoffGames.filter((p) => p.round !== 'divisional')
    : card.playoffGames;
  return (
    <SeasonCardShell
      eyebrow={`UFA · ${card.year}`}
      href={`/teams/${card.championTeamID}`}
      footer={<FooterLink href={hasStandings ? '/teams' : `/schedule?year=${card.year}`} label={hasStandings ? 'Full standings' : 'Full schedule'} />}
    >
      {games.map(({ game, round }, i) => {
        const away = teamMeta(game.awayTeamID);
        const home = teamMeta(game.homeTeamID);
        return (
          <PlayoffScoreRow
            key={game.gameID}
            i={i}
            label={UFA_ROUND_LABEL[round]}
            href={`/g/${game.gameID}`}
            awayMark={<TeamLogo team={away} size={22} />}
            homeMark={<TeamLogo team={home} size={22} />}
            awayAbbr={away.abbr}
            homeAbbr={home.abbr}
            awayScore={game.awayScore}
            homeScore={game.homeScore}
            champion={round === 'championship'}
          />
        );
      })}
      {card.standingsRows.map((row, i) => {
        const meta = teamMeta(row.teamID);
        const record = row.ties > 0 ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`;
        return (
          <StandingRow
            key={row.teamID}
            i={games.length + i}
            rank={i + 1 + card.championshipWeekendTeams}
            href={`/teams/${row.teamID}`}
            mark={<TeamLogo team={meta} size={24} />}
            name={meta.name ?? row.teamName.split(' ').slice(-1).join(' ')}
            record={record}
            meta={row.divisionName ?? undefined}
            champion={row.teamID === card.championTeamID}
          />
        );
      })}
    </SeasonCardShell>
  );
}

// ─── PUL / WUL — playoffs, then the rest of the standings ─────────────────────
// The score rows already show the four championship-weekend teams, so the
// table below skips them and numbers from 5 (same rule as the UFA card —
// Hunter, 2026-09-11: don't list a team twice).

/** Team ids on either side of the playoff rows shown above the table. */
function playoffTeamIds(games: Array<{ game: { away: { teamId: string }; home: { teamId: string } } }>): Set<string> {
  return new Set(games.flatMap(({ game }) => [game.away.teamId, game.home.teamId]));
}

const PLAYOFF_LABEL = { final: 'Final', semifinal: 'Semi', third: '3rd place', regular: 'Regular' } as const;

function encodeGameId(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}

export function PulSeasonCompleteSection({
  season,
  playoffs,
  standings,
}: {
  season: number;
  playoffs: PulRecentGame[];
  standings: PulStandingRow[];
}) {
  const games = playoffs.filter((p) => p.round !== 'regular');
  const shown = playoffTeamIds(games);
  // getPulStandings maps EVERY pul_teams row, so folded franchises sit at 0-0.
  const rows = standings.filter((row) => row.wins + row.losses > 0 && !shown.has(row.team.id));
  if (games.length === 0 || rows.length === 0) return null;
  return (
    <SeasonCardShell
      eyebrow={`PUL · ${season} Season`}
      href="/pul/teams"
      footer={<FooterLink href="/pul/teams" label="Full standings" />}
    >
      {games.map(({ game, round }, i) => {
        const { away, home } = game;
        if (away.score === null || home.score === null) return null;
        const forLogo = (s: typeof away) => ({
          id: s.teamId,
          mascot: s.mascot ?? s.abbrev,
          logoUrl: s.logoUrl,
          name: s.mascot ?? s.abbrev,
          city: s.city ?? '',
          accentColor: null,
        });
        return (
          <PlayoffScoreRow
            key={game.id}
            i={i}
            label={PLAYOFF_LABEL[round]}
            href={`/pul/g/${encodeGameId(game.id)}`}
            awayMark={<PulTeamLogo team={forLogo(away)} size={22} />}
            homeMark={<PulTeamLogo team={forLogo(home)} size={22} />}
            awayAbbr={away.abbrev}
            homeAbbr={home.abbrev}
            awayScore={away.score}
            homeScore={home.score}
            champion={round === 'final'}
          />
        );
      })}
      {rows.map((row, i) => (
        <StandingRow
          key={row.team.id}
          i={games.length + i}
          rank={i + 1 + shown.size}
          href={`/pul/teams/${row.team.id}`}
          mark={<PulTeamLogo team={row.team} size={24} />}
          name={row.team.name}
          record={`${row.wins}-${row.losses}`}
          pointDiff={row.pointDiff}
          champion={row.champion}
        />
      ))}
    </SeasonCardShell>
  );
}

export function WulSeasonCompleteSection({
  season,
  playoffs,
  standings,
}: {
  season: number;
  playoffs: WulRecentGame[];
  standings: WulStandingRow[];
}) {
  const games = playoffs.filter((p) => p.round !== 'regular');
  const shown = playoffTeamIds(games);
  const rows = standings.filter((row) => !shown.has(row.team.id));
  if (games.length === 0 || rows.length === 0) return null;
  return (
    <SeasonCardShell
      eyebrow={`WUL · ${season} Season`}
      href="/wul/teams"
      footer={<FooterLink href="/wul/teams" label="Full standings" />}
    >
      {games.map(({ game, round }, i) => {
        const { away, home } = game;
        if (away.score === null || home.score === null) return null;
        const forLogo = (s: typeof away) => ({
          id: s.teamId,
          abbr: s.abbrev,
          logoUrl: s.logoUrl,
          accentColor: s.accentColor,
        });
        return (
          <PlayoffScoreRow
            key={game.id}
            i={i}
            label={PLAYOFF_LABEL[round]}
            href={`/wul/g/${encodeGameId(game.id)}`}
            awayMark={<WulTeamLogo team={forLogo(away)} size={22} />}
            homeMark={<WulTeamLogo team={forLogo(home)} size={22} />}
            awayAbbr={away.abbrev}
            homeAbbr={home.abbrev}
            awayScore={away.score}
            homeScore={home.score}
            champion={round === 'final'}
          />
        );
      })}
      {rows.map((row, i) => (
        <StandingRow
          key={row.team.id}
          i={games.length + i}
          rank={i + 1 + shown.size}
          href={`/wul/teams/${row.team.id}`}
          mark={<WulTeamLogo team={row.team} size={24} />}
          name={row.team.name}
          record={`${row.wins}-${row.losses}`}
          pointDiff={row.pointDiff}
          champion={row.champion}
        />
      ))}
    </SeasonCardShell>
  );
}

// ─── USAU — champion + finalist per division (Club Nationals / College) ──────

export function UsauSeasonCompleteSection({ card }: { card: UsauSeasonCompleteCard | null }) {
  if (!card || card.champions.length === 0) return null;
  const href = `/usau/events/${card.slug}`;
  // Division labels are "Men" (Club) or "D-I Men" / "D-III Women" (College);
  // the logo lookup keys college crests under College/, so the level must be
  // derived from the prefix — passing undefined resolves in the club namespace
  // and never loads (caught by the mobile port, 2026-09-09).
  const genderOf = (division: string) => division.replace(/^D-I{1,3}\s+/, '');
  const levelOf = (division: string): string =>
    /^D-III\b/.test(division) ? 'COLLEGE_D3' : /^D-I\b/.test(division) ? 'COLLEGE_D1' : 'CLUB';
  return (
    <SeasonCardShell
      eyebrow={`USAU · ${card.season}`}
      subtitle={card.name}
      href={href}
      footer={<FooterLink href={href} label="Full bracket" />}
    >
      {card.champions.map((row, k) => {
        const gender = genderOf(row.division);
        const level = levelOf(row.division);
        // USAU plays no 3rd-place game — both semi losers tie for 3rd, so one
        // row names them both (two overlapping marks).
        const semis = row.semifinalists ?? [];
        let i = 0;
        return (
          <DivisionGroup key={row.division} i={k} label={row.division}>
            <PlacementRow
              key={`${row.division}-${row.teamId}`}
              i={i++}
              mark={<UsauTeamLogo name={row.teamName} genderDivision={gender} competitionLevel={level} size={22} />}
              name={row.teamName}
              record={null}
              pill={<ChampionPill />}
            />
            {row.runnerUpName && (
              <PlacementRow
                key={`${row.division}-${row.runnerUpId ?? row.runnerUpName}`}
                i={i++}
                mark={<UsauTeamLogo name={row.runnerUpName} genderDivision={gender} competitionLevel={level} size={22} />}
                name={row.runnerUpName}
                record={null}
                pill={<MutedPill>Finalist</MutedPill>}
              />
            )}
            {semis.length > 0 && (
              <PlacementRow
                key={`${row.division}-semis`}
                i={i++}
                mark={
                  <span className="inline-flex items-center">
                    {semis.map((s, j) => (
                      <span key={s.id} className={`inline-flex rounded-full overflow-hidden ${j > 0 ? '-ml-2' : ''}`}>
                        <UsauTeamLogo name={s.name} genderDivision={gender} competitionLevel={level} size={18} />
                      </span>
                    ))}
                  </span>
                }
                name={semis.map((s) => s.name).join(' · ')}
                record={null}
                pill={<MutedPill>Semis</MutedPill>}
              />
            )}
          </DivisionGroup>
        );
      })}
    </SeasonCardShell>
  );
}

// ─── WFDF — podium per division ──────────────────────────────────────────────

/** "Great Grand Master Women's" wraps to four lines in the label column and
 *  makes rows uneven; the masters tiers have well-known short forms. */
function shortDivisionLabel(name: string): string {
  return name
    .replace(/great grand master(s)?/i, 'GGM')
    .replace(/grand master(s)?/i, 'GM')
    .replace(/\bmaster(s)?\b/i, 'Masters')
    // "9-0 · Masters Women's" wrapped the record line; the possessive adds nothing.
    .replace(/women's/i, 'Women');
}

const PODIUM_PILL: Record<2 | 3, string> = { 2: 'Runner-up', 3: '3rd' };

export function WfdfSeasonCompleteSection({ card }: { card: WfdfSeasonCompleteCard }) {
  if (card.champions.length === 0) return null;
  const href = `/wfdf/events/${card.slug}`;
  const showPodium = card.divisionCount <= WFDF_TOP3_MAX_DIVISIONS;
  const rows = showPodium ? card.placements : card.champions.slice(0, WFDF_MAX_CHAMPION_ROWS);
  const overflow = showPodium ? 0 : card.champions.length - rows.length;
  // Rows arrive division-ordered; bucket consecutive rows of one division.
  const groups: Array<{ division: string; rows: typeof rows }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.division === row.division) last.rows.push(row);
    else groups.push({ division: row.division, rows: [row] });
  }

  return (
    <SeasonCardShell
      eyebrow={`WFDF · ${card.year}`}
      subtitle={card.name}
      href={href}
      footer={
        overflow > 0 ? (
          <FooterLink href={href} label={`+${overflow} more division${overflow === 1 ? '' : 's'}`} />
        ) : (
          <FooterLink href={href} label="Full results" />
        )
      }
    >
      {showPodium ? (
        groups.map((group, k) => (
          <DivisionGroup key={group.division} i={k} label={shortDivisionLabel(group.division)}>
            {group.rows.map((row, i) => {
              const standing = row.finalStanding;
              return (
                <PlacementRow
                  key={row.teamId}
                  i={i}
                  mark={<WfdfFlag countryCode={row.countryCode} size={18} />}
                  name={row.name}
                  record={row.record}
                  pill={standing === 1 ? <ChampionPill /> : <MutedPill>{PODIUM_PILL[standing]}</MutedPill>}
                />
              );
            })}
          </DivisionGroup>
        ))
      ) : (
        // Champions only (4+ divisions): one row per division with the
        // division on the record line — a caption per single row doubled the
        // card's height (WMUCC was the tallest card, 2026-09-11).
        rows.map((row, i) => (
          <PlacementRow
            key={row.teamId}
            i={i}
            mark={<WfdfFlag countryCode={row.countryCode} size={18} />}
            name={row.name}
            record={[row.record, shortDivisionLabel(row.division)].filter(Boolean).join(' · ')}
            pill={<ChampionPill />}
          />
        ))
      )}
    </SeasonCardShell>
  );
}
