// Multi-league "Up next" / "Recent results" section for the home page.
//
// Renders a section with an eyebrow header that matches GameGridSection's style,
// followed by per-league sub-rows. Each sub-row has a small subordinate league
// label above that league's cards. Omits any row with no data (caller filters
// empty leagues before building the rows array).
//
// Server component — no 'use client'. All tokens from the project design system.

import React from 'react';
import Link from 'next/link';
import type { UfaGame } from '@/lib/ufa/types';
import type { PulGame } from '@/lib/pul/data';
import type { WulGame } from '@/lib/wul/data';
import type { UsauEventSummary } from '@/lib/usau/data';
import type { UsauMajorWithChampions } from '@/lib/usau/data';
import { GameTile } from '@/components/home/game-grid-section';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { WulTeamLogo } from '@/components/wul-team-logo';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface LeagueRow {
  leagueKey: string;        // 'UFA' | 'USAU' | 'PUL' | 'WUL'
  content: React.ReactNode; // cards for that league (pre-assembled by caller)
}

export interface MultiLeagueGridSectionProps {
  title: string;            // e.g. "Up next"
  rows: LeagueRow[];        // only leagues with data included
  rightLink?: { label: string; href: string };
}

// ─── Section component ────────────────────────────────────────────────────────

export function MultiLeagueGridSection({
  title,
  rows,
  rightLink,
}: MultiLeagueGridSectionProps) {
  if (rows.length === 0) return null;

  return (
    <section aria-label={title} className="px-5 lg:px-12 pt-1 pb-6 lg:pb-8">
      {/* Eyebrow header — matches GameGridSection exactly */}
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-muted">
          {title}
        </span>
        {rightLink && (
          <Link
            href={rightLink.href}
            className="text-[11px] font-bold tracking-[0.14em] uppercase text-ink no-underline inline-flex items-center gap-1.5 hover:text-accent transition-colors"
          >
            {rightLink.label}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
          </Link>
        )}
      </div>

      {/* Per-league sub-rows */}
      <div className="flex flex-col gap-5">
        {rows.map((row) => (
          <div key={row.leagueKey}>
            {/* Subordinate league label — subtle, under the section eyebrow */}
            <div className="font-mono text-[10px] font-bold tracking-[0.14em] uppercase text-faint mb-2.5">
              {row.leagueKey}
            </div>
            {row.content}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── UFA tile grid ────────────────────────────────────────────────────────────
// Renders UFA games in the same 1/2/4-col responsive grid as GameGridSection,
// using the exported GameTile so markup stays 100% consistent.

export function UfaTileGrid({ games }: { games: UfaGame[] }) {
  if (games.length === 0) return null;
  // Horizontal scroll carousel — a weekend has more than 4 games, so a fixed
  // 4-col grid clipped the rest. Each tile is a fixed-width snap target; the
  // row scrolls (swipe on touch, scrollbar on desktop). Negative margins +
  // padding let the row bleed to the section edge so the last card isn't
  // visually cut at the container boundary.
  return (
    <div className="-mx-5 lg:-mx-12 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory">
      <div className="flex gap-3 px-5 lg:px-12 w-max">
        {games.map((g) => (
          <div key={g.gameID} className="snap-start shrink-0 w-[280px] sm:w-[320px]">
            <GameTile game={g} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── USAU "Up next" event card ────────────────────────────────────────────────
// Compact tournament card for the current USAU event. Lighter surface style
// (not the dark stadium look of the hero carousel). Includes the event name,
// date range, and a "View →" link to /usau/events/{slug}.

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };
  if (start && end && start !== end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  return fmt(end!);
}

export function UsauUpNextCard({ event }: { event: UsauEventSummary }) {
  const dateRange = formatDateRange(event.startDate, event.endDate);

  // teamId → gender division, from the event's own teams. Used to resolve the
  // correct logo per team (a "Pool A" bracket name carries no gender, so we
  // must look the team up rather than guess the division from the bracket).
  const divByTeamId = new Map<string, string | null>();
  for (const t of event.teams) divByTeamId.set(t.teamId, t.genderDivision);

  // Show up to 4 pool games (round='pool', scored).
  const poolGames = event.games
    .filter((g) => g.round === 'pool' && (g.scoreA !== null || g.scoreB !== null))
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-3">
      {/* Event header card */}
      <Link
        href={`/usau/events/${event.slug}`}
        className="group bg-surface border border-border px-4 py-3.5 flex flex-col gap-1.5 hover:border-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-tight font-semibold text-[14px] text-ink leading-snug">
            {event.name}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-[0.12em] uppercase text-accent flex-shrink-0">
            View
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
          </span>
        </div>
        {dateRange && (
          <span className="font-mono text-[10.5px] text-faint tracking-[0.06em]">{dateRange}</span>
        )}
      </Link>

      {/* Pool game mini-cards */}
      {poolGames.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {poolGames.map((g) => (
            <UsauPoolGameMini
              key={g.id}
              game={g}
              eventSlug={event.slug}
              divA={g.teamAId ? divByTeamId.get(g.teamAId) ?? null : null}
              divB={g.teamBId ? divByTeamId.get(g.teamBId) ?? null : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UsauPoolGameMini({
  game,
  eventSlug,
  divA,
  divB,
}: {
  game: UsauEventSummary['games'][number];
  eventSlug: string;
  /** Real gender division per team (from event.teams) — drives logo lookup.
   *  Bracket/pool names carry no gender, so we must pass the team's own. */
  divA: string | null;
  divB: string | null;
}) {
  const aName = game.teamAName ?? '?';
  const bName = game.teamBName ?? '?';
  const aScore = game.scoreA;
  const bScore = game.scoreB;
  const hasScore = aScore !== null && bScore !== null;
  const aWin = hasScore && aScore! > bScore!;
  const bWin = hasScore && bScore! > aScore!;

  return (
    <Link
      href={`/usau/events/${eventSlug}`}
      className="bg-surface border border-hairline px-3 py-2 flex flex-col gap-1 hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* Team A */}
      <div className={['flex items-center justify-between', bWin ? 'opacity-55' : ''].join(' ')}>
        <div className="flex items-center gap-1.5 min-w-0">
          <UsauTeamLogo name={aName} genderDivision={divA} size={16} />
          <span className="font-tight text-[13px] text-ink truncate">{aName}</span>
        </div>
        <span className="font-mono font-bold text-[13px] text-ink tabular ml-2 flex-shrink-0">
          {hasScore ? aScore : '–'}
        </span>
      </div>
      {/* Team B */}
      <div className={['flex items-center justify-between', aWin ? 'opacity-55' : ''].join(' ')}>
        <div className="flex items-center gap-1.5 min-w-0">
          <UsauTeamLogo name={bName} genderDivision={divB} size={16} />
          <span className="font-tight text-[13px] text-ink truncate">{bName}</span>
        </div>
        <span className="font-mono font-bold text-[13px] text-ink tabular ml-2 flex-shrink-0">
          {hasScore ? bScore : '–'}
        </span>
      </div>
    </Link>
  );
}

// ─── USAU "Recent results" major champion card ────────────────────────────────
// Shows one completed major (TCT event) with its champion(s) derived from finals.

function TrophyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function UsauMajorCard({ major }: { major: UsauMajorWithChampions }) {
  const dateRange = formatDateRange(major.startDate, major.endDate);
  return (
    <Link
      href={`/usau/events/${major.slug}`}
      className="group bg-surface border border-border px-4 py-3.5 flex flex-col gap-2.5 hover:border-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* Event header */}
      <div className="flex flex-col gap-0.5">
        <span className="font-tight font-semibold text-[13px] text-ink leading-snug line-clamp-2">
          {major.name}
        </span>
        {dateRange && (
          <span className="font-mono text-[10px] text-faint tracking-[0.06em]">{dateRange}</span>
        )}
      </div>

      {/* Champions */}
      <div className="flex flex-col gap-2">
        {major.champions.map((c) => (
          <div key={c.division} className="flex items-center gap-2">
            <span className="text-accent flex-shrink-0">
              <TrophyIcon />
            </span>
            <UsauTeamLogo name={c.teamName} genderDivision={c.division} size={22} />
            <div className="min-w-0 flex-1">
              <div className="font-tight text-[13px] text-ink font-semibold truncate">{c.teamName}</div>
              <div className="font-mono text-[9.5px] text-faint tracking-[0.1em] uppercase">{c.division}</div>
            </div>
          </div>
        ))}
      </div>
    </Link>
  );
}

export function UsauMajorGrid({ majors }: { majors: UsauMajorWithChampions[] }) {
  if (majors.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {majors.map((m) => (
        <UsauMajorCard key={m.slug} major={m} />
      ))}
    </div>
  );
}

// ─── PUL recent game card ────────────────────────────────────────────────────
// Compact self-contained card for the most-recent PUL final. Matches pul-scores
// ScoreCard style but self-contained (no async fetch).

function pulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}

function wulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}

export function PulRecentCard({ game }: { game: PulGame }) {
  const { away, home } = game;
  const awayWin = away.score !== null && home.score !== null && away.score > home.score;
  const homeWin = away.score !== null && home.score !== null && home.score > away.score;
  const isChampion = game.weekLabel === 'finals';

  const cardClass = [
    'block bg-surface border rounded-md px-4 py-3.5 transition-colors duration-150',
    isChampion ? 'border-accent ring-1 ring-accent/40 hover:border-accent' : 'border-border hover:border-ink',
    'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  ].join(' ');

  return (
    // Constrain to a single grid-column width so this lone card doesn't span
    // the full section like the multi-card UFA/USAU rows. Full width on mobile.
    <div className="w-full sm:max-w-[360px]">
      <Link href={`/pul/g/${pulGameHref(game.id)}`} className={cardClass}>
        {isChampion && (
          <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
            <TrophyIcon />
            <span>Championship</span>
          </div>
        )}
        {game.gameDate && (
          <div className="mb-2.5 text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight tabular">
            {formatCardDate(game.gameDate)}
          </div>
        )}
        <PulScoreRow side={away} win={awayWin} lose={homeWin} />
        <div className="h-px bg-hairline my-1" />
        <PulScoreRow side={home} win={homeWin} lose={awayWin} />
      </Link>
    </div>
  );
}

function PulScoreRow({
  side,
  win,
  lose,
}: {
  side: PulGame['away'];
  win: boolean;
  lose: boolean;
}) {
  const teamForLogo = {
    id: side.teamId,
    mascot: side.mascot ?? side.abbrev,
    logoUrl: side.logoUrl,
    name: side.mascot ?? side.abbrev,
    city: side.city ?? '',
    accentColor: null,
  };
  const label = [side.city, side.mascot].filter(Boolean).join(' ') || side.abbrev;
  return (
    <div className={['flex items-center justify-between py-1.5', lose ? 'opacity-60' : ''].join(' ')}>
      <div className="flex items-center gap-2.5 min-w-0">
        <PulTeamLogo team={teamForLogo} size={26} />
        <span className={['font-tight tracking-[-0.01em] text-[15px] text-ink truncate', win ? 'font-bold' : 'font-medium'].join(' ')}>
          {label}
        </span>
      </div>
      <span className="flex items-center gap-2 flex-shrink-0 ml-3">
        {win && <span className="w-[5px] h-[5px] rounded-full bg-accent flex-shrink-0" aria-hidden="true" />}
        <span className={['tabular leading-none font-tight tracking-[-0.04em] text-[24px]', win ? 'font-bold text-ink' : 'font-medium text-muted'].join(' ')}>
          {side.score ?? '–'}
        </span>
      </span>
    </div>
  );
}

// ─── WUL recent game card ─────────────────────────────────────────────────────

export function WulRecentCard({ game, champion = false }: { game: WulGame; champion?: boolean }) {
  const { away, home } = game;
  const awayWin = away.score !== null && home.score !== null && away.score > home.score;
  const homeWin = away.score !== null && home.score !== null && home.score > away.score;

  const cardClass = [
    'block bg-surface border rounded-md px-4 py-3.5 transition-colors duration-150',
    champion ? 'border-accent ring-1 ring-accent/40 hover:border-accent' : 'border-border hover:border-ink',
    'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  ].join(' ');

  return (
    <div className="w-full sm:max-w-[360px]">
      <Link href={`/wul/g/${wulGameHref(game.id)}`} className={cardClass}>
        {champion && (
          <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
            <TrophyIcon />
            <span>Championship</span>
          </div>
        )}
        {game.gameDate && (
          <div className="mb-2.5 text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight tabular">
            {formatCardDate(game.gameDate)}
          </div>
        )}
        <WulScoreRow side={away} win={awayWin} lose={homeWin} />
        <div className="h-px bg-hairline my-1" />
        <WulScoreRow side={home} win={homeWin} lose={awayWin} />
      </Link>
    </div>
  );
}

function WulScoreRow({
  side,
  win,
  lose,
}: {
  side: WulGame['away'];
  win: boolean;
  lose: boolean;
}) {
  const teamForLogo: Pick<import('@/lib/wul/data').WulTeam, 'id' | 'abbr' | 'logoUrl' | 'accentColor'> = {
    id: side.teamId,
    abbr: side.abbrev,
    logoUrl: side.logoUrl,
    accentColor: side.accentColor,
  };
  const label = [side.city, side.mascot].filter(Boolean).join(' ') || side.abbrev;
  return (
    <div className={['flex items-center justify-between py-1.5', lose ? 'opacity-60' : ''].join(' ')}>
      <div className="flex items-center gap-2.5 min-w-0">
        <WulTeamLogo team={teamForLogo} size={26} />
        <span className={['font-tight tracking-[-0.01em] text-[15px] text-ink truncate', win ? 'font-bold' : 'font-medium'].join(' ')}>
          {label}
        </span>
      </div>
      <span className="flex items-center gap-2 flex-shrink-0 ml-3">
        {win && <span className="w-[5px] h-[5px] rounded-full bg-accent flex-shrink-0" aria-hidden="true" />}
        <span className={['tabular leading-none font-tight tracking-[-0.04em] text-[24px]', win ? 'font-bold text-ink' : 'font-medium text-muted'].join(' ')}>
          {side.score ?? '–'}
        </span>
      </span>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatCardDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
