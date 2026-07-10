// "Recent results" cards — split per-league per Hunter's explicit request
// ("I want each league/subject to be separate"). Each league gets its own
// independent floating card (same shell: bg-surface rounded-card-lg
// shadow-card, italic display 22px title + neutral "Final" pill top-right,
// winner-emphasized rows with hairline separators) instead of one combined
// card with in-card league-pill dividers.
//
// Exports RecentResultsCards — a fragment of 0-4 cards (UFA, USAU, PUL,
// WUL, in that order) — so page.tsx can drop it straight into a
// `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4` row as its own
// "Recent results" section; each card renders only when it has data, same
// gating as before.

import Link from 'next/link';
import type { UfaGame } from '@/lib/ufa/types';
import type { UsauMajorWithChampions } from '@/lib/usau/data';
import type { PulRecentGame, PulRecentRound } from '@/app/page';
import type { WulRecentGame, WulRecentRound } from '@/app/page';
import { teamMeta } from '@/lib/ufa/teams';
import { TeamLogo } from '@/components/team-logo';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { WulTeamLogo } from '@/components/wul-team-logo';

interface RecentResultsCardsProps {
  ufaGames: UfaGame[];
  usauMajors: UsauMajorWithChampions[];
  pulGames: PulRecentGame[];
  wulGames: WulRecentGame[];
}

/** Renders the "Recent results" card group: UFA, USAU, PUL, WUL — each its
 *  own card, shown only when it has data. Returns null (no wrapper element)
 *  when nothing has content. */
export function RecentResultsCards({ ufaGames, usauMajors, pulGames, wulGames }: RecentResultsCardsProps) {
  const hasUfa = ufaGames.length > 0;
  const hasUsau = usauMajors.length > 0;
  const hasPul = pulGames.length > 0;
  const hasWul = wulGames.length > 0;
  if (!hasUfa && !hasUsau && !hasPul && !hasWul) return null;

  return (
    <>
      {hasUfa && (
        <CardShell pill="UFA">
          {ufaGames.slice(0, 4).map((g, i) => (
            <UfaRecentRow key={g.gameID} game={g} first={i === 0} />
          ))}
        </CardShell>
      )}
      {hasUsau && (
        <CardShell pill="USAU">
          {usauMajors.slice(0, 4).map((m, i) => (
            <UsauMajorRow key={m.slug} major={m} first={i === 0} />
          ))}
        </CardShell>
      )}
      {hasPul && (
        <CardShell pill="PUL">
          {pulGames.map((g, i) => (
            <PulRecentRow key={g.game.id} entry={g} first={i === 0} />
          ))}
        </CardShell>
      )}
      {hasWul && (
        <CardShell pill="WUL">
          {wulGames.map((g, i) => (
            <WulRecentRow key={g.game.id} entry={g} first={i === 0} />
          ))}
        </CardShell>
      )}
    </>
  );
}

// ─── Shared card shell ────────────────────────────────────────────────────

function CardShell({ pill, children }: { pill: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-card-lg shadow-card px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h3 className="font-display italic font-bold text-[22px] leading-none tracking-[-0.01em] text-ink m-0">
          Recent results
        </h3>
        <LeaguePill>{pill}</LeaguePill>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function LeaguePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-[10.5px] font-bold tracking-[0.12em] uppercase px-2.5 py-[5px] rounded-full bg-[rgb(var(--ink)/0.05)] text-ink/80 flex-shrink-0">
      {children}
    </span>
  );
}

function ScoreDuo({ awayScore, homeScore, awayWin }: { awayScore: number; homeScore: number; awayWin: boolean }) {
  return (
    <span className="font-display italic font-bold text-[18px] tabular flex-shrink-0">
      <span className={awayWin ? 'text-accent' : 'text-ink'}>{awayScore}</span>
      <span className="text-faint mx-[5px]">·</span>
      <span className={awayWin ? 'text-ink' : 'text-accent'}>{homeScore}</span>
    </span>
  );
}

// ─── UFA row ──────────────────────────────────────────────────────────────

function UfaRecentRow({ game, first }: { game: UfaGame; first: boolean }) {
  const away = teamMeta(game.awayTeamID);
  const home = teamMeta(game.homeTeamID);
  const awayWin = game.awayScore > game.homeScore;

  return (
    <Link
      href={`/g/${game.gameID}`}
      className={[
        'grid grid-cols-[1fr_auto] gap-3 items-center py-[11px]',
        first ? '' : 'border-t border-hairline',
        'hover:opacity-80 transition-opacity',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0" style={{ opacity: awayWin ? 1 : 0.55 }}>
          <TeamLogo team={away} size={26} />
        </span>
        <span className="font-sans font-bold text-[13.5px] text-ink flex-shrink-0" style={{ opacity: awayWin ? 1 : 0.55 }}>
          {away.abbr}
        </span>
        <span className="font-mono text-[11px] text-faint flex-shrink-0">—</span>
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0" style={{ opacity: awayWin ? 0.55 : 1 }}>
          <TeamLogo team={home} size={26} />
        </span>
        <span className="font-sans font-bold text-[13.5px] text-ink flex-shrink-0" style={{ opacity: awayWin ? 0.55 : 1 }}>
          {home.abbr}
        </span>
      </div>
      <ScoreDuo awayScore={game.awayScore} homeScore={game.homeScore} awayWin={awayWin} />
    </Link>
  );
}

// ─── USAU major row — event name + champion(s) condensed to one line ─────

function TrophyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
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

function UsauMajorRow({ major, first }: { major: UsauMajorWithChampions; first: boolean }) {
  const champLine =
    major.champions.length === 0
      ? 'Results pending'
      : major.champions.map((c) => c.teamName).join(' · ');
  const firstChamp = major.champions[0];

  return (
    <Link
      href={`/usau/events/${major.slug}`}
      className={[
        'flex items-center gap-2 py-[11px]',
        first ? '' : 'border-t border-hairline',
        'hover:opacity-80 transition-opacity',
      ].join(' ')}
    >
      {firstChamp ? (
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <UsauTeamLogo name={firstChamp.teamName} genderDivision={firstChamp.division} size={22} />
        </span>
      ) : (
        <span className="text-faint flex-shrink-0">
          <TrophyIcon />
        </span>
      )}
      {/* Flight badge dropped (Hunter's ask) — the freed right-column space
          lets the full event name show instead of truncating to fit it. */}
      <div className="min-w-0 flex-1">
        <div className="font-tight font-semibold text-[13px] text-ink truncate leading-tight">{major.name}</div>
        <div className="font-mono text-[9.5px] text-faint tracking-[0.06em] truncate flex items-center gap-1">
          {major.champions.length > 0 && <TrophyIcon />}
          {champLine}
        </div>
      </div>
    </Link>
  );
}

// ─── PUL / WUL recent finals rows ─────────────────────────────────────────

function pulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}
function wulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}

function roundLabel(round: PulRecentRound | WulRecentRound): string | null {
  if (round === 'final') return 'Championship';
  if (round === 'semifinal') return 'Semifinal';
  return null;
}

function PulRecentRow({ entry, first }: { entry: PulRecentGame; first: boolean }) {
  const { game, round } = entry;
  const { away, home } = game;
  const awayWin = away.score !== null && home.score !== null && away.score > home.score;
  const isChampion = round === 'final';
  const label = roundLabel(round);

  const awayForLogo = { id: away.teamId, mascot: away.mascot ?? away.abbrev, logoUrl: away.logoUrl, name: away.mascot ?? away.abbrev, city: away.city ?? '', accentColor: null };
  const homeForLogo = { id: home.teamId, mascot: home.mascot ?? home.abbrev, logoUrl: home.logoUrl, name: home.mascot ?? home.abbrev, city: home.city ?? '', accentColor: null };

  return (
    <Link
      href={`/pul/g/${pulGameHref(game.id)}`}
      className={[
        'grid grid-cols-[1fr_auto] gap-3 items-center py-[11px]',
        first ? '' : 'border-t border-hairline',
        'hover:opacity-80 transition-opacity',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isChampion && (
          <span className="text-accent flex-shrink-0">
            <TrophyIcon />
          </span>
        )}
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0" style={{ opacity: awayWin ? 1 : 0.55 }}>
          <PulTeamLogo team={awayForLogo} size={22} />
        </span>
        <span className="font-sans font-bold text-[13px] text-ink flex-shrink-0" style={{ opacity: awayWin ? 1 : 0.55 }}>
          {away.abbrev}
        </span>
        <span className="font-mono text-[10.5px] text-faint flex-shrink-0">—</span>
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0" style={{ opacity: awayWin ? 0.55 : 1 }}>
          <PulTeamLogo team={homeForLogo} size={22} />
        </span>
        <span className="font-sans font-bold text-[13px] text-ink flex-shrink-0" style={{ opacity: awayWin ? 0.55 : 1 }}>
          {home.abbrev}
        </span>
        {label && (
          <span className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase text-faint hidden sm:inline flex-shrink-0">
            {label}
          </span>
        )}
      </div>
      {away.score !== null && home.score !== null && (
        <ScoreDuo awayScore={away.score} homeScore={home.score} awayWin={awayWin} />
      )}
    </Link>
  );
}

function WulRecentRow({ entry, first }: { entry: WulRecentGame; first: boolean }) {
  const { game, round } = entry;
  const { away, home } = game;
  const awayWin = away.score !== null && home.score !== null && away.score > home.score;
  const isChampion = round === 'final';
  const label = roundLabel(round);

  const awayForLogo = { id: away.teamId, abbr: away.abbrev, logoUrl: away.logoUrl, accentColor: away.accentColor };
  const homeForLogo = { id: home.teamId, abbr: home.abbrev, logoUrl: home.logoUrl, accentColor: home.accentColor };

  return (
    <Link
      href={`/wul/g/${wulGameHref(game.id)}`}
      className={[
        'grid grid-cols-[1fr_auto] gap-3 items-center py-[11px]',
        first ? '' : 'border-t border-hairline',
        'hover:opacity-80 transition-opacity',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isChampion && (
          <span className="text-accent flex-shrink-0">
            <TrophyIcon />
          </span>
        )}
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0" style={{ opacity: awayWin ? 1 : 0.55 }}>
          <WulTeamLogo team={awayForLogo} size={22} />
        </span>
        <span className="font-sans font-bold text-[13px] text-ink flex-shrink-0" style={{ opacity: awayWin ? 1 : 0.55 }}>
          {away.abbrev}
        </span>
        <span className="font-mono text-[10.5px] text-faint flex-shrink-0">—</span>
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0" style={{ opacity: awayWin ? 0.55 : 1 }}>
          <WulTeamLogo team={homeForLogo} size={22} />
        </span>
        <span className="font-sans font-bold text-[13px] text-ink flex-shrink-0" style={{ opacity: awayWin ? 0.55 : 1 }}>
          {home.abbrev}
        </span>
        {label && (
          <span className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase text-faint hidden sm:inline flex-shrink-0">
            {label}
          </span>
        )}
      </div>
      {away.score !== null && home.score !== null && (
        <ScoreDuo awayScore={away.score} homeScore={home.score} awayWin={awayWin} />
      )}
    </Link>
  );
}
