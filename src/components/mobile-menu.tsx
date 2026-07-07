'use client';

// Right-side slide-in navigation panel — shared by mobile AND desktop. The
// hamburger (right of the account chip) opens it; it slides in from the right
// edge. Rendered via createPortal to document.body so it escapes the sticky
// rail's stacking context (backdrop-blur on the rail creates a new compositing
// layer that would trap any z-index set on a descendant).
//
// Three-layer accordion structure:
//   Layer 1 — sub-apps: The League (expandable) · PLAYBOOK · FANTASY · 12-0
//   Layer 2 — leagues: UFA · USAU · WUL · PUL · WFDF (expandable / direct)
//   Layer 3 — sub-pages: Scores · Schedule · Teams · Players (links with ?league=qs)
// Plus a Theme toggle row at the foot.
//
// Accordion default-open state: opens to the branch that matches the current URL
// so a user in USAU Teams sees The League→USAU expanded with Teams highlighted.
//
// Layer 2 → Layer 3 presentation differs by breakpoint:
//   MOBILE (<md): tapping a league row expands an INLINE sub-dropdown directly
//     beneath that row — tab links only, no team grids. See the
//     `isOpen && <div className="md:hidden">` block inside the league .map()
//     below.
//   DESKTOP (md+): tapping/hovering a league row opens the side-by-side
//     LeagueFlyout panel (header + tab links + team grid), rendered in a
//     `hidden md:flex` container after the main nav list.
// Both breakpoints share the same `flyoutLeague` state and the
// `LeagueFlyoutBody` tab-links component so that markup isn't duplicated.
//
// USAU is the one exception on BOTH breakpoints: instead of a single shared
// tab-link row, it renders `UsauLevelAccordion` — each competition level
// (Club/College D-I/College D-III/Masters/Grand Masters) is its own
// expandable row. Desktop additionally passes a `renderExtra` prop so CLUB
// and COLLEGE_D1 (the two levels with a cheap preview source) show a Top
// Teams grid under their links; mobile omits `renderExtra` (links only).

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  buildLeagueQs,
  parseDivisionParam,
  parseLevelParam,
  levelLabel,
  USAU_LEVELS,
  type UsauLevel,
} from '@/lib/league';
import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';
import { activeTeams } from '@/lib/ufa/teams';
import { allWulTeams, type WulTeamMeta } from '@/lib/wul/teams';
import { TeamLogo } from '@/components/team-logo';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';

// ─── Types ─────────────────────────────────────────────────────────────────────

type SubApp = 'games' | 'playbook' | 'fantasy' | 'twelve-oh';

type MegaLeagueId = 'ufa' | 'usau' | 'wul' | 'pul' | 'wfdf';

interface MegaLeague {
  id: MegaLeagueId;
  label: string;
  real: boolean;
}

const MEGA_LEAGUES: MegaLeague[] = [
  { id: 'ufa',  label: 'UFA',  real: true  },
  { id: 'usau', label: 'USAU', real: true  },
  { id: 'pul',  label: 'PUL',  real: true  }, // real=true: expandable with 4 sub-page links
  { id: 'wul',  label: 'WUL',  real: true  }, // real=true: expandable, but Teams-only (no scores/schedule/players yet)
  { id: 'wfdf', label: 'WFDF', real: true  }, // event-scoped hub (Events/Scores/Teams/Players under /wfdf/*)
];

// ─── League fly-out preview data (ported from the old desktop mega-menu) ──────
// The fly-out panel shows each league's sub-pages + a team grid. UFA + WUL grids
// are static (in-memory); USAU + PUL + WFDF are lazy-fetched when first previewed.

const WUL_TEAMS_LIST: WulTeamMeta[] = allWulTeams();
type TopUsauTeam = { id: string; name: string; nationalsPlacement: number | null };
type UsauDivision = 'Men' | 'Women' | 'Mixed';
type UsauTeamsByDivision = Record<UsauDivision, TopUsauTeam[]>;
// College D-I preview rows (from the official-rankings reader) — same shape
// as TopUsauTeam but keyed by rank instead of nationals placement.
type TopCollegeTeam = { id: string; name: string; rank: number };
type UsauCollegeTeamsByDivision = { Men: TopCollegeTeam[]; Women: TopCollegeTeam[] };
type TopPulTeam = { id: string; name: string; city: string; logoUrl: string | null };
type WfdfMenuEvent = { slug: string; name: string; year: number };

const UFA_DIVISIONS = ['East', 'Central', 'South', 'West'] as const;
type UfaDivision = (typeof UFA_DIVISIONS)[number];
const UFA_BY_DIVISION: Record<UfaDivision, ReturnType<typeof activeTeams>> = (() => {
  const grouped: Record<UfaDivision, ReturnType<typeof activeTeams>> = {
    East: [], Central: [], South: [], West: [],
  };
  for (const team of activeTeams()) {
    if (team.division && team.division in grouped) {
      grouped[team.division as UfaDivision].push(team);
    }
  }
  for (const div of UFA_DIVISIONS) {
    grouped[div].sort((a, b) => (a.city ?? '').localeCompare(b.city ?? ''));
  }
  return grouped;
})();

// Direct-link leagues navigate on tap instead of expanding.
// (None today — WFDF now expands into its own /wfdf/* sub-pages.)
const MEGA_LEAGUE_DIRECT_HREFS: Partial<Record<MegaLeagueId, string>> = {};

// WFDF section — event-scoped hub. All pages live under /wfdf/* (no ?league= qs),
// same no-qs treatment as WUL.
const WFDF_NAV_ITEMS: GamesNavItem[] = [
  { label: 'Events',  href: '/wfdf/events',  match: '/wfdf/events' },
  { label: 'Scores',  href: '/wfdf/scores',  match: '/wfdf/scores' },
  { label: 'Teams',   href: '/wfdf/teams',   match: '/wfdf/teams' },
  { label: 'Players', href: '/wfdf/players', match: '/wfdf/players' },
];

interface GamesNavItem {
  label: string;
  href: string;
  match: string;
  aliases?: string[];
}

const GAMES_NAV_ITEMS: GamesNavItem[] = [
  { label: 'Scores',   href: '/scores',   match: '/scores',   aliases: ['/g', '/usau/events'] },
  { label: 'Schedule', href: '/schedule', match: '/schedule' },
  { label: 'Teams',    href: '/teams',    match: '/teams',    aliases: ['/usau/teams'] },
  { label: 'Players',  href: '/players',  match: '/players' },
];

// WUL section — all four pages route through the shared ?league=wul routes (same
// pattern as PUL). Schedule shows WUL's multi-season history (the source has no
// future fixtures, so it's an archive). Game detail lives at /wul/g/* (aliased
// under Scores so it stays highlighted on a matchup page).
const WUL_NAV_ITEMS: GamesNavItem[] = [
  { label: 'Scores',   href: '/scores?league=wul',   match: '/scores',   aliases: ['/wul/scores', '/wul/g'] },
  { label: 'Schedule', href: '/schedule?league=wul', match: '/schedule' },
  { label: 'Teams',    href: '/teams?league=wul',    match: '/teams',    aliases: ['/wul/teams'] },
  { label: 'Players',  href: '/players?league=wul',  match: '/players',  aliases: ['/wul/players'] },
];

function isGamesNavActive(pathname: string, item: GamesNavItem): boolean {
  if (item.match === '/') return pathname === '/';
  const matches = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(item.match)) return true;
  return item.aliases?.some(matches) ?? false;
}

// ─── APP_PREFIX_MAP (mirrors app-rail.tsx) ─────────────────────────────────────
const APP_PREFIX_MAP: Array<[string, SubApp]> = [
  ['/playbook', 'playbook'],
  ['/fantasy',  'fantasy'],
  ['/12-0',     'twelve-oh'],
  ['/scores',   'games'],
  ['/schedule', 'games'],
  ['/teams',    'games'],
  ['/players',  'games'],
  ['/g/',       'games'],
  ['/g',        'games'],
  ['/usau',     'games'],
  ['/pul',      'games'],
  ['/wul',      'games'],
  ['/wfdf',     'games'],
];

function detectSubApp(pathname: string): SubApp | null {
  for (const [prefix, app] of APP_PREFIX_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return app;
  }
  return null;
}

// ─── SVG icons ─────────────────────────────────────────────────────────────────

function ChevronDown({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      width="10"
      height="10"
    >
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      width="16"
      height="16"
    >
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  );
}

// Per-sub-app line icons (20×20, 1.6 stroke) — give each top-level menu row a
// scannable glyph. Kept simple + on-brand (disc, clipboard, trophy, spark).
function SubAppIcon({ app, className = '' }: { app: SubApp; className?: string }) {
  const common = {
    className,
    width: 19,
    height: 19,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (app) {
    case 'games': // The League — a flying disc
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="9" ry="4.2" />
          <path d="M4.2 10.5c1.4 1.2 4.3 2 7.8 2s6.4-.8 7.8-2" />
        </svg>
      );
    case 'playbook': // clipboard with a play line
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4h6v2H9z" />
          <path d="M8.5 11l3 3 4-5" />
        </svg>
      );
    case 'twelve-oh': // trophy (12-0 = the perfect season)
      return (
        <svg {...common}>
          <path d="M7 4h10v4a5 5 0 01-10 0V4z" />
          <path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" />
          <path d="M12 13v4M9 20h6M10 20l.5-3h3l.5 3" />
        </svg>
      );
    case 'fantasy': // spark / star burst
      return (
        <svg {...common}>
          <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" />
        </svg>
      );
  }
}

// A top-level direct-link menu row: icon tile · label (· beta) · chevron.
function SubAppRow({
  app,
  href,
  label,
  badge,
  active,
  rowBase,
  iconTile,
  onClose,
}: {
  app: SubApp;
  href: string;
  label: string;
  badge?: string;
  active: boolean;
  rowBase: string;
  iconTile: (active: boolean) => string;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      aria-current={active ? 'page' : undefined}
      className={[
        rowBase,
        active ? 'text-ink bg-[rgb(var(--accent)/0.08)]' : 'text-ink hover:bg-surface',
      ].join(' ')}
    >
      <span className={iconTile(active)}>
        <SubAppIcon app={app} />
      </span>
      <span className="flex-1 flex items-center gap-1.5">
        {label}
        {badge && (
          <sup className="text-[8px] font-bold tracking-[0.14em] text-accent leading-none">
            {badge}
          </sup>
        )}
      </span>
      {/* Trailing chevron — subtle affordance that shifts toward the accent on
          hover (group-hover from rowBase). */}
      <svg
        className="w-3 h-3 flex-shrink-0 text-faint group-hover:text-accent transition-colors duration-150"
        viewBox="0 0 10 10"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

// ─── League fly-out content (pages + team grid) ──────────────────────────────
// Ported from the old desktop mega-menu's right pane. Renders one league's
// sub-page link row + team grid, adapted to the narrower fly-out panel.

interface FlyoutLeagueData {
  usau: { teams: UsauTeamsByDivision | null; loading: boolean; error: boolean };
  usauCollege: { teams: UsauCollegeTeamsByDivision | null; loading: boolean; error: boolean };
  pul: { teams: TopPulTeam[] | null; loading: boolean; error: boolean };
  wfdf: { events: WfdfMenuEvent[] | null; loading: boolean; error: boolean };
}

const gridLinkClass =
  'flex items-center gap-2 px-1.5 py-1.5 rounded-md text-[12px] font-medium font-tight text-ink transition-colors duration-150 no-underline hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

// ── Shared body: sub-page tab links ─────────────────────────────────────────
// Used by the DESKTOP fly-out AND the MOBILE inline sub-dropdown for every
// league EXCEPT USAU. USAU's competition-level filter (Club/College D-I/
// College D-III/Masters/Grand Masters) instead renders as its own accordion —
// UsauLevelAccordion — on BOTH breakpoints: mobile because a horizontal chip
// row above a shared tab row didn't read as "this row's own filter" once
// stacked vertically in the mobile menu's nested-accordion structure, and
// desktop for the same nesting reason once it needed to hold a Top Teams
// preview per division too (see UsauLevelAccordion + its renderExtra prop).
// This component no longer has a USAU-specific branch — callers never pass
// league="usau" here anymore. Team grids for other leagues are desktop-only
// and live in LeagueFlyout, NOT here.
function LeagueFlyoutBody({
  league,
  pathname,
  leagueQsFor,
  onClose,
  // Sub-nav links stack VERTICALLY (one per row) — a horizontal pill row
  // wraps unpredictably in narrow panels (PLAYERS was falling onto its own
  // row on phones and in the 340px desktop fly-out).
  tabRowBase = 'flex flex-col gap-0.5 mb-2.5 pb-3 border-b border-hairline',
  tabLinkBase,
}: {
  league: MegaLeagueId;
  pathname: string;
  leagueQsFor: (id: MegaLeagueId) => string;
  onClose: () => void;
  /** Wrapper classes for the tab-link row — lets callers adjust indentation. */
  tabRowBase?: string;
  /** Per-link classes — defaults to the desktop fly-out treatment. */
  tabLinkBase?: string;
}) {
  // Sub-page link set: WUL + WFDF use their own routes (no ?league= qs).
  const navItems =
    league === 'wul' ? WUL_NAV_ITEMS : league === 'wfdf' ? WFDF_NAV_ITEMS : GAMES_NAV_ITEMS;
  const noQs = league === 'wul' || league === 'wfdf';

  const linkClass =
    tabLinkBase ??
    [
      'flex items-center w-full px-3 min-h-[42px] rounded-md',
      'text-[11px] font-bold tracking-[0.1em] uppercase font-tight',
      'transition-colors duration-150 no-underline',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
    ].join(' ');

  return (
    <div className={tabRowBase}>
      {navItems.map((item) => {
        const active = isGamesNavActive(pathname, item);
        const qs = noQs ? '' : leagueQsFor(league);
        return (
          <Link
            key={item.href}
            href={`${item.href}${qs}`}
            role="menuitem"
            aria-current={active ? 'page' : undefined}
            onClick={onClose}
            className={[
              linkClass,
              active ? 'text-accent bg-[rgb(var(--accent)/0.1)]' : 'text-ink hover:bg-surface',
            ].join(' ')}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

// ── USAU's per-division accordion — shared by MOBILE inline dropdown AND
// DESKTOP fly-out ──────────────────────────────────────────────────────────
// USAU is the one league with a competition-level filter, and it reads better
// as its own vertically-stacked accordion (one division per row, tap to
// reveal its content) than as a horizontal chip row sitting above a single
// shared tab-link row — chips floating above an unrelated-looking link row
// don't read as "this row's filter." Mobile uses this with `renderExtra`
// omitted (links only); desktop passes `renderExtra` to append each
// division's Top Teams preview (where a cheap source exists) after the links,
// reusing the exact same accordion shape instead of two parallel markups.
// One division open at a time; defaults to whichever matches the current
// ?level=.
function UsauLevelAccordion({
  pathname,
  urlDivision,
  expandedLevel,
  onToggleLevel,
  onClose,
  renderExtra,
}: {
  pathname: string;
  urlDivision: ReturnType<typeof parseDivisionParam>;
  expandedLevel: UsauLevel | null;
  onToggleLevel: (level: UsauLevel) => void;
  onClose: () => void;
  /** Desktop-only: renders a division's Top Teams preview below its links. */
  renderExtra?: (level: UsauLevel) => React.ReactNode;
}) {
  const divisionRowBase = [
    'flex items-center justify-between w-full pl-3 pr-3',
    'min-h-[44px] text-left cursor-pointer rounded-md',
    'text-[11px] font-bold tracking-[0.12em] uppercase font-tight',
    'transition-colors duration-150 no-underline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
  ].join(' ');

  const linkClass = [
    'flex items-center w-full px-3 min-h-[44px] rounded-md',
    'text-[11px] font-bold tracking-[0.1em] uppercase font-tight',
    'transition-colors duration-150 no-underline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
  ].join(' ');

  return (
    <div className="flex flex-col gap-0.5">
      {USAU_LEVELS.map((level) => {
        const isExpanded = expandedLevel === level;
        // CLUB is the default level — buildLeagueQs omits it from the qs.
        const qs = buildLeagueQs('usau', urlDivision, level);
        return (
          <div key={level}>
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => onToggleLevel(level)}
              className={[
                divisionRowBase,
                isExpanded ? 'text-ink bg-surface' : 'text-ink hover:bg-surface',
              ].join(' ')}
            >
              {levelLabel(level)}
              <ChevronDown
                className={[
                  'flex-shrink-0 transition-transform duration-200',
                  isExpanded ? 'rotate-180 text-accent' : 'text-faint',
                ].join(' ')}
              />
            </button>

            {isExpanded && (
              <div className="pl-3 pt-1 pb-1.5">
                <div className="flex flex-col gap-0.5">
                  {GAMES_NAV_ITEMS.map((item) => {
                    const active = isGamesNavActive(pathname, item);
                    return (
                      <Link
                        key={item.href}
                        href={`${item.href}${qs}`}
                        role="menuitem"
                        aria-current={active ? 'page' : undefined}
                        onClick={onClose}
                        className={[
                          linkClass,
                          active ? 'text-accent bg-[rgb(var(--accent)/0.1)]' : 'text-ink hover:bg-surface',
                        ].join(' ')}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
                {renderExtra?.(level)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Desktop-only fly-out: header + shared body + team grids. Rendered by the
// caller inside a `hidden md:flex` wrapper — mobile never mounts this.
function LeagueFlyout({
  league,
  pathname,
  urlDivision,
  leagueQsFor,
  onBack,
  onClose,
  usau,
  usauCollege,
  pul,
  wfdf,
  usauLevel,
  onUsauLevelChange,
}: {
  league: MegaLeagueId;
  pathname: string;
  urlDivision: ReturnType<typeof parseDivisionParam>;
  leagueQsFor: (id: MegaLeagueId) => string;
  onBack: () => void;
  onClose: () => void;
  usauLevel: UsauLevel;
  onUsauLevelChange: (level: UsauLevel) => void;
} & FlyoutLeagueData) {
  const label = MEGA_LEAGUES.find((l) => l.id === league)?.label ?? '';

  return (
    <div className="flex flex-col">
      {/* Fly-out header: back arrow + league name. */}
      <div className="flex items-center gap-2 px-4 h-[52px] flex-shrink-0 border-b border-hairline sticky top-0 bg-bg z-10">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-surface transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent -ml-1"
        >
          <svg width="14" height="14" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-[12px] font-bold tracking-[0.14em] uppercase font-tight text-ink">
          {label}
        </span>
      </div>

      <div className="p-4">
        {/* ── USAU: per-division accordion (Club/College D-I/College D-III/
            Masters/Grand Masters), each expanding to its 4 page links PLUS a
            Top Teams preview where a cheap source exists (Club, College D-I).
            Replaces the old horizontal chip row + single shared tab row —
            see UsauLevelAccordion for why. Every other league keeps the
            original LeagueFlyoutBody (tabs only) + its own team grid below. ── */}
        {league === 'usau' ? (
          <UsauLevelAccordion
            pathname={pathname}
            urlDivision={urlDivision}
            expandedLevel={usauLevel}
            onToggleLevel={onUsauLevelChange}
            onClose={onClose}
            renderExtra={(level) => {
              if (level === 'CLUB') {
                return (
                  <div className="mt-2.5">
                    <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint mb-1.5">Top Teams</p>
                    {usau.loading && <GridSkeleton />}
                    {!usau.loading && usau.error && <LoadError href="/teams?league=usau" onClose={onClose} />}
                    {!usau.loading && !usau.error && usau.teams && (
                      <div className="flex flex-col gap-2.5">
                        {(['Men', 'Women', 'Mixed'] as const).map((div) => {
                          const teams = usau.teams![div];
                          if (!teams || teams.length === 0) return null;
                          return (
                            <div key={div}>
                              <p className="text-[9px] font-bold tracking-[0.12em] uppercase text-muted mb-1">{div}</p>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                {teams.map((team) => (
                                  <Link key={team.id} href={`/usau/teams/${team.id}`} role="menuitem" onClick={onClose} className={gridLinkClass}>
                                    <span className="text-[10px] font-bold text-faint tabular w-4 text-right flex-shrink-0">
                                      {team.nationalsPlacement ?? ''}
                                    </span>
                                    <UsauTeamLogo name={team.name} genderDivision={div} size={20} />
                                    <span className="truncate">{team.name}</span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              if (level === 'COLLEGE_D1') {
                return (
                  <div className="mt-2.5">
                    <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint mb-1.5">Top Teams</p>
                    {usauCollege.loading && <GridSkeleton />}
                    {!usauCollege.loading && usauCollege.error && (
                      <LoadError href="/teams?league=usau&level=college-d1" onClose={onClose} />
                    )}
                    {!usauCollege.loading && !usauCollege.error && usauCollege.teams && (
                      <div className="flex flex-col gap-2.5">
                        {(['Men', 'Women'] as const).map((div) => {
                          const teams = usauCollege.teams![div];
                          if (!teams || teams.length === 0) return null;
                          return (
                            <div key={div}>
                              <p className="text-[9px] font-bold tracking-[0.12em] uppercase text-muted mb-1">{div}</p>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                {teams.map((team) => (
                                  <Link key={team.id} href={`/usau/teams/${team.id}`} role="menuitem" onClick={onClose} className={gridLinkClass}>
                                    <span className="text-[10px] font-bold text-faint tabular w-4 text-right flex-shrink-0">
                                      {team.rank}
                                    </span>
                                    <UsauTeamLogo name={team.name} genderDivision={div} competitionLevel="COLLEGE_D1" size={20} />
                                    <span className="truncate">{team.name}</span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              // COLLEGE_D3 / MASTERS / GRAND_MASTERS: no cheap Top Teams
              // source yet — links only, same as before.
              return null;
            }}
          />
        ) : (
          <LeagueFlyoutBody
            league={league}
            pathname={pathname}
            leagueQsFor={leagueQsFor}
            onClose={onClose}
          />
        )}

        {/* ── UFA: 4-division team grid (2 cols in the narrow panel) ── */}
        {league === 'ufa' && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {UFA_DIVISIONS.map((div) => (
              <div key={div}>
                <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint mb-1.5 px-1">
                  {div}
                </p>
                <ul className="space-y-0.5">
                  {UFA_BY_DIVISION[div].map((team) => (
                    <li key={team.id}>
                      <Link href={`/teams/${team.id}`} role="menuitem" onClick={onClose} className={gridLinkClass}>
                        <TeamLogo team={team} size={20} />
                        <span className="truncate">{team.city}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* ── PUL: team grid (lazy) ── */}
        {league === 'pul' && (
          <div>
            <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint mb-1.5">Teams</p>
            {pul.loading && <GridSkeleton />}
            {!pul.loading && pul.error && <LoadError href="/teams?league=pul" onClose={onClose} />}
            {!pul.loading && !pul.error && pul.teams && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {pul.teams.map((team) => (
                  <Link key={team.id} href={`/pul/teams/${team.id}`} role="menuitem" onClick={onClose} className={gridLinkClass}>
                    <PulTeamLogoMini logoUrl={team.logoUrl} city={team.city} />
                    <span className="truncate">{team.city}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── WUL: franchise grid (static) ── */}
        {league === 'wul' && (
          <div>
            <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint mb-1.5">Teams</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {WUL_TEAMS_LIST.map((team) => (
                <Link key={team.id} href={`/wul/teams/${team.id}`} role="menuitem" onClick={onClose} className={gridLinkClass}>
                  <WulTeamLogoMini team={team} />
                  <span className="truncate">{team.city}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── WFDF: recent events (lazy) ── */}
        {league === 'wfdf' && (
          <div>
            <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint mb-1.5">Recent Events</p>
            {wfdf.loading && <GridSkeleton />}
            {!wfdf.loading && wfdf.error && <LoadError href="/wfdf/events" onClose={onClose} />}
            {!wfdf.loading && !wfdf.error && wfdf.events && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {wfdf.events.map((e) => (
                  <Link key={e.slug} href={`/wfdf/events/${e.slug}`} role="menuitem" onClick={onClose} className={gridLinkClass}>
                    <span className="text-[10px] font-bold text-faint tabular w-8 text-right flex-shrink-0">{e.year}</span>
                    <span className="truncate">{e.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-7 rounded bg-surface animate-pulse" />
      ))}
    </div>
  );
}

function LoadError({ href, onClose }: { href: string; onClose: () => void }) {
  return (
    <div className="py-3 text-[12px] text-muted">
      Couldn&apos;t load —{' '}
      <Link
        href={href}
        onClick={onClose}
        className="text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
      >
        browse all
      </Link>
    </div>
  );
}

// PUL/WUL mini team logos (20px) — inline renderers matching the old mega-menu.
function PulTeamLogoMini({ logoUrl, city }: { logoUrl: string | null; city: string }) {
  const size = 20;
  if (logoUrl) {
    return (
      <span
        className="inline-flex items-center justify-center flex-shrink-0 overflow-hidden rounded-sm bg-white border border-[rgb(var(--ink)/0.08)]"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="object-contain" style={{ width: size * 0.84, height: size * 0.84 }} />
      </span>
    );
  }
  const initials = city.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 rounded-sm"
      style={{ width: size, height: size, background: '#1d2535' }}
      aria-hidden="true"
    >
      <span className="font-display font-bold text-white" style={{ fontSize: 7, letterSpacing: '0.03em' }}>
        {initials}
      </span>
    </span>
  );
}

function WulTeamLogoMini({ team }: { team: WulTeamMeta }) {
  const size = 20;
  if (team.logo) {
    return (
      <span
        className="inline-flex items-center justify-center flex-shrink-0 overflow-hidden rounded-sm bg-white border border-[rgb(var(--ink)/0.08)]"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={team.logo} alt="" className="object-contain" style={{ width: size * 0.84, height: size * 0.84 }} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 relative overflow-hidden rounded-sm"
      style={{ width: size, height: size, background: team.primary }}
      aria-hidden="true"
    >
      <span className="absolute inset-0" style={{ background: team.accent, opacity: 0.15 }} />
      <span className="relative z-10 font-display font-bold text-white" style={{ fontSize: 7, letterSpacing: '0.03em' }}>
        {team.abbr}
      </span>
    </span>
  );
}

// ─── MobileMenu ────────────────────────────────────────────────────────────────

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  /** Ref to the hamburger button so we can return focus on close. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function MobileMenu({ open, onClose, triggerRef }: MobileMenuProps) {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [theme] = useTheme();

  // SSR guard — createPortal is browser-only.
  useEffect(() => { setMounted(true); }, []);

  // ── Derive initial expanded state from URL ──────────────────────────────
  const activeApp = detectSubApp(pathname);
  // Division persists onto the fly-out's UFA/USAU sub-page links via leagueQsFor.
  const urlDivision = parseDivisionParam(searchParams.get('div'));
  // USAU competition-level FILTER for the flyout's sub-tab row. Seeded from
  // the URL on open; purely local state afterward (selecting a chip doesn't
  // navigate — only the tab links below pick it up).
  const [usauLevel, setUsauLevel] = useState<UsauLevel>(() => parseLevelParam(searchParams.get('level')));

  // MOBILE-ONLY: which USAU division row is expanded in the inline
  // sub-dropdown accordion (UsauMobileLevelList). Independent of usauLevel
  // above (that one drives the DESKTOP chip row) but defaults to the same
  // URL-derived level so a user arriving at ?level=college-d1 sees College
  // D-I pre-expanded on mobile too. One division open at a time; null = all
  // collapsed (reachable by tapping the open division again).
  const [usauMobileExpandedLevel, setUsauMobileExpandedLevel] = useState<UsauLevel | null>(
    () => parseLevelParam(searchParams.get('level')),
  );

  // "The League" section is expanded by default when on a games page.
  const initialGamesOpen = activeApp === 'games';
  const [gamesOpen, setGamesOpen] = useState(initialGamesOpen);

  // ── League fly-out (the left panel showing a league's pages + team grid) ──
  // Set by hovering (desktop) or tapping (mobile) a league row. null = closed.
  const [flyoutLeague, setFlyoutLeague] = useState<MegaLeagueId | null>(null);
  const flyoutMountedRef = useRef(true);
  useEffect(() => () => { flyoutMountedRef.current = false; }, []);

  // Lazy team/event data for the fly-out grids (USAU / PUL / WFDF). UFA + WUL
  // grids are static (module-level). Fetched once when their league is first
  // previewed; cached for the component's lifetime.
  const [usauTeams, setUsauTeams] = useState<UsauTeamsByDivision | null>(null);
  const [usauLoading, setUsauLoading] = useState(false);
  const [usauError, setUsauError] = useState(false);
  const usauFetchedRef = useRef(false);

  // College D-I "Top Teams" preview — fed by the cheap usau_rankings reader
  // (listOfficialUsauRankings), NOT the club RPC. Fetched lazily the first
  // time COLLEGE_D1 is selected in the flyout, then cached for the
  // component's lifetime same as the club fetch above.
  const [usauCollegeTeams, setUsauCollegeTeams] = useState<UsauCollegeTeamsByDivision | null>(null);
  const [usauCollegeLoading, setUsauCollegeLoading] = useState(false);
  const [usauCollegeError, setUsauCollegeError] = useState(false);
  const usauCollegeFetchedRef = useRef(false);

  const [pulTeams, setPulTeams] = useState<TopPulTeam[] | null>(null);
  const [pulLoading, setPulLoading] = useState(false);
  const [pulError, setPulError] = useState(false);
  const pulFetchedRef = useRef(false);

  const [wfdfEvents, setWfdfEvents] = useState<WfdfMenuEvent[] | null>(null);
  const [wfdfLoading, setWfdfLoading] = useState(false);
  const [wfdfError, setWfdfError] = useState(false);
  const wfdfFetchedRef = useRef(false);

  const fetchUsauTeams = useCallback(async () => {
    if (usauFetchedRef.current) return;
    usauFetchedRef.current = true;
    setUsauLoading(true);
    try {
      const { listTopUsauTeams } = await import('@/lib/usau/data');
      const [men, women, mixed] = await Promise.all([
        listTopUsauTeams({ genderDivision: 'Men', limit: 8 }),
        listTopUsauTeams({ genderDivision: 'Women', limit: 8 }),
        listTopUsauTeams({ genderDivision: 'Mixed', limit: 8 }),
      ]);
      if (flyoutMountedRef.current) setUsauTeams({ Men: men, Women: women, Mixed: mixed });
    } catch {
      if (flyoutMountedRef.current) setUsauError(true);
    } finally {
      if (flyoutMountedRef.current) setUsauLoading(false);
    }
  }, []);

  const fetchUsauCollegeTeams = useCallback(async () => {
    if (usauCollegeFetchedRef.current) return;
    usauCollegeFetchedRef.current = true;
    setUsauCollegeLoading(true);
    try {
      const { listOfficialUsauRankings } = await import('@/lib/usau/data');
      const [men, women] = await Promise.all([
        listOfficialUsauRankings('College-Men', 8),
        listOfficialUsauRankings('College-Women', 8),
      ]);
      if (flyoutMountedRef.current) {
        setUsauCollegeTeams({
          Men: men.teams.map((t) => ({ id: t.id, name: t.name, rank: t.rank })),
          Women: women.teams.map((t) => ({ id: t.id, name: t.name, rank: t.rank })),
        });
      }
    } catch {
      if (flyoutMountedRef.current) setUsauCollegeError(true);
    } finally {
      if (flyoutMountedRef.current) setUsauCollegeLoading(false);
    }
  }, []);

  const fetchPulTeams = useCallback(async () => {
    if (pulFetchedRef.current) return;
    pulFetchedRef.current = true;
    setPulLoading(true);
    try {
      const { listTopPulTeams } = await import('@/lib/pul/data');
      const teams = await listTopPulTeams();
      if (flyoutMountedRef.current) setPulTeams(teams);
    } catch {
      if (flyoutMountedRef.current) setPulError(true);
    } finally {
      if (flyoutMountedRef.current) setPulLoading(false);
    }
  }, []);

  const fetchWfdfEvents = useCallback(async () => {
    if (wfdfFetchedRef.current) return;
    wfdfFetchedRef.current = true;
    setWfdfLoading(true);
    try {
      const { listEvents } = await import('@/lib/wfdf/data');
      const events = await listEvents();
      const trimmed = events.slice(0, 8).map((e) => ({ slug: e.slug, name: e.name, year: e.year }));
      if (flyoutMountedRef.current) setWfdfEvents(trimmed);
    } catch {
      if (flyoutMountedRef.current) setWfdfError(true);
    } finally {
      if (flyoutMountedRef.current) setWfdfLoading(false);
    }
  }, []);

  // Team grids (the thing these fetches feed) only render on md+ — the
  // mobile inline sub-dropdown shows just chips/tabs/caption. Skip the
  // network calls entirely on narrow viewports so opening a league on
  // mobile doesn't fetch data nothing will display.
  const isDesktopViewport = useCallback(() => {
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
  }, []);

  // Open the fly-out for a league + kick its lazy fetch. USAU's top-teams
  // source depends on which level is currently selected (e.g. deep-linking
  // in with ?level=college-d1 already selected before the flyout opens).
  const openFlyout = useCallback((id: MegaLeagueId) => {
    setFlyoutLeague(id);
    if (!isDesktopViewport()) return;
    if (id === 'usau') {
      if (usauLevel === 'COLLEGE_D1') fetchUsauCollegeTeams();
      else if (usauLevel === 'CLUB') fetchUsauTeams();
    } else if (id === 'pul') fetchPulTeams();
    else if (id === 'wfdf') fetchWfdfEvents();
  }, [usauLevel, isDesktopViewport, fetchUsauTeams, fetchUsauCollegeTeams, fetchPulTeams, fetchWfdfEvents]);

  // Expanding a division row inside the USAU flyout (DESKTOP — used as
  // UsauLevelAccordion's onToggleLevel there) — pure filter/expand state, no
  // navigation. Lazily kicks the CLUB or College D-I fetch the first time
  // that division is expanded (each fetch has its own ref guard, so this is
  // a no-op if already loaded — e.g. CLUB was already fetched eagerly by
  // openFlyout on initial flyout open). Desktop only: both fetches feed team
  // grids that only render on md+.
  const handleUsauLevelChange = useCallback((level: UsauLevel) => {
    setUsauLevel(level);
    if (!isDesktopViewport()) return;
    if (level === 'CLUB') fetchUsauTeams();
    else if (level === 'COLLEGE_D1') fetchUsauCollegeTeams();
  }, [fetchUsauTeams, fetchUsauCollegeTeams, isDesktopViewport]);

  // MOBILE-ONLY: toggling a division row in UsauMobileLevelList. Pure
  // accordion state — no data fetch (mobile never shows the team grids that
  // fetch feeds), no navigation. Tapping the already-expanded division
  // collapses it; tapping another switches to it (one open at a time).
  const handleUsauMobileLevelToggle = useCallback((level: UsauLevel) => {
    setUsauMobileExpandedLevel((prev) => (prev === level ? null : level));
  }, []);

  // Close the fly-out whenever the main menu closes or the route changes.
  useEffect(() => { if (!open) setFlyoutLeague(null); }, [open]);
  useEffect(() => { setFlyoutLeague(null); }, [pathname]);

  // Re-derive "The League" expansion when the pathname changes (e.g. navigating
  // while the menu is open). The per-league fly-out closes on nav (see above).
  useEffect(() => {
    setGamesOpen(detectSubApp(pathname) === 'games');
  }, [pathname]);

  // ── Body scroll lock ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ── Focus management ────────────────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      // Small delay lets the portal render before focusing.
      const id = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(id);
    } else {
      // Return focus to the hamburger trigger.
      triggerRef.current?.focus();
    }
  }, [open, triggerRef]);

  // ── Esc to close ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  // ── league qs helper (mirrors GamesDropdown) ────────────────────────────
  // USAU carries both the gender division (from the URL, unrelated to this
  // task) and the competition level (the flyout's own filter state below).
  function leagueQsFor(lid: MegaLeagueId): string {
    if (lid === 'usau') return buildLeagueQs('usau', urlDivision, usauLevel);
    if (lid === 'pul') return buildLeagueQs('pul', null);
    return buildLeagueQs('ufa', urlDivision);
  }

  // ── Row helpers ─────────────────────────────────────────────────────────
  // Top-level rows are rounded "cards" (the nav wrapper adds px-3 + gap). ≥52px
  // touch target. Icon tile + label + trailing affordance.
  const rowBase = [
    'group flex items-center gap-3 w-full pl-2.5 pr-3.5',
    'min-h-[56px] rounded-xl text-left cursor-pointer',
    'text-[13px] font-bold tracking-[0.1em] uppercase font-tight',
    'transition-colors duration-150 no-underline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  ].join(' ');

  // Nested league rows (inside the expanded "The League" card).
  const subRowBase = [
    'flex items-center justify-between w-full pl-5 pr-4',
    'min-h-[46px] text-left cursor-pointer rounded-lg',
    'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
    'transition-colors duration-150 no-underline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
  ].join(' ');

  const pageRowBase = [
    'flex items-center w-full pl-9 pr-4',
    'min-h-[42px] text-left rounded-md',
    'text-[11px] font-semibold tracking-[0.1em] uppercase font-tight no-underline',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
  ].join(' ');

  // Icon tile — the rounded square that holds each sub-app's glyph. Active rows
  // get an accent-filled tile; resting rows a subtle surface tile that tints on
  // hover (group-hover).
  function iconTile(active: boolean): string {
    return [
      'inline-flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0',
      'transition-colors duration-150',
      active
        ? 'bg-accent text-accent-ink'
        : 'bg-[rgb(var(--ink)/0.05)] text-muted group-hover:bg-[rgb(var(--ink)/0.09)] group-hover:text-ink',
    ].join(' ');
  }

  if (!mounted) return null;

  const panel = (
    // Backdrop — tap outside to close. overflow-hidden keeps the off-screen
    // (translate-x-full) closed panel from creating a horizontal scrollbar.
    <div
      className={[
        'fixed inset-0 z-[100] overflow-hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      ].join(' ')}
      aria-hidden={!open}
    >
      {/* Dim layer */}
      <div
        className={[
          'absolute inset-0 bg-ink/50 transition-opacity',
          open ? 'opacity-100' : 'opacity-0',
          // Skip transition when reduced motion is preferred.
          'motion-reduce:transition-none',
        ].join(' ')}
        style={{ transitionDuration: '150ms' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — two geometries by breakpoint:
          - MOBILE (<md): rolls DOWN from the top as a full-width dropdown
            sheet with a height cap + rounded bottom (translate-y animation).
          - DESKTOP (md+): the original right-anchored 360px side drawer
            sliding in from the right (translate-x animation). The league
            fly-out's md:right-[360px] positioning depends on this. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={[
          // Mobile: top roll-down sheet.
          'absolute top-0 inset-x-0 w-full max-h-[calc(100dvh-1rem)]',
          'rounded-b-2xl border-b border-hairline',
          // Desktop: right side drawer (original geometry).
          'md:inset-y-0 md:left-auto md:right-0 md:max-w-[360px] md:max-h-none',
          'md:rounded-none md:border-b-0 md:border-l',
          'flex flex-col bg-bg overflow-y-auto shadow-2xl',
          // Mobile animates translate-y, desktop translate-x — both compose
          // into one transform, so the md: overrides neutralize the other axis.
          'transition-transform motion-reduce:transition-none',
          open
            ? 'translate-y-0 translate-x-0'
            : '-translate-y-full md:translate-y-0 md:translate-x-full',
        ].join(' ')}
        style={{ transitionDuration: '240ms', transitionTimingFunction: 'ease-out' }}
      >
        {/* Accent glow bleeding down from the top-right — gives the panel a
            branded, lit feel instead of a flat white sheet. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{
            background:
              'radial-gradient(120% 80% at 100% 0%, rgb(var(--accent) / 0.14), transparent 70%)',
          }}
        />

        {/* Header — logo + eyebrow, close button. */}
        <div className="relative flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
          <div className="flex flex-col gap-1.5">
            <LogoStrikeInline
              accentColor="rgb(var(--accent))"
              theme={theme === 'broadcast' ? 'dark' : 'light'}
              size={0.8}
            />
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase font-tight text-faint">
              Menu
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className={[
              'inline-flex items-center justify-center w-10 h-10 rounded-full self-start',
              'bg-surface border border-hairline text-muted',
              'hover:text-ink hover:border-ink transition-colors duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              '-mr-1',
            ].join(' ')}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Nav list */}
        <nav aria-label="Primary navigation" className="relative flex-1 px-3 pb-8 flex flex-col gap-1.5">

          {/* ── THE LEAGUE accordion row ─────────────────────────────── */}
          <button
            type="button"
            onClick={() => setGamesOpen((v) => !v)}
            aria-expanded={gamesOpen}
            className={[
              rowBase,
              activeApp === 'games'
                ? 'text-ink bg-[rgb(var(--accent)/0.08)]'
                : 'text-ink hover:bg-surface',
            ].join(' ')}
          >
            <span className={iconTile(activeApp === 'games')}>
              <SubAppIcon app="games" />
            </span>
            <span className="flex-1">The League</span>
            <ChevronDown
              className={[
                'flex-shrink-0 text-muted transition-transform duration-200',
                gamesOpen ? 'rotate-180' : '',
              ].join(' ')}
            />
          </button>

          {/* THE LEAGUE expanded: league list. Each league is a FLY-OUT trigger
              — hover (desktop) or tap (mobile) opens the left panel showing that
              league's pages + team grid. Inset card w/ a left accent spine. */}
          {gamesOpen && (
            <div className="ml-3 mb-1 pl-2 border-l-2 border-accent/25 flex flex-col gap-0.5">
              {MEGA_LEAGUES.map((league) => {
                if (!league.real) {
                  return (
                    <div
                      key={league.id}
                      aria-disabled="true"
                      className={[subRowBase, 'text-faint cursor-not-allowed select-none'].join(' ')}
                    >
                      {league.label}
                      <sup className="text-[8px] font-bold tracking-[0.14em] text-faint leading-none ml-1">
                        SOON
                      </sup>
                    </div>
                  );
                }
                const isOpen = flyoutLeague === league.id;
                return (
                  <div key={league.id}>
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isOpen}
                      // Desktop: hover/focus opens the side fly-out. Mobile:
                      // tap toggles the inline sub-dropdown below this row.
                      // The hover/focus handlers MUST be desktop-gated —
                      // touch taps synthesize mouseenter+focus BEFORE click,
                      // so ungated they'd open the dropdown and the click's
                      // toggle would immediately close it again (tap = no-op).
                      onMouseEnter={() => { if (isDesktopViewport()) openFlyout(league.id); }}
                      onFocus={() => { if (isDesktopViewport()) openFlyout(league.id); }}
                      onClick={() => (isOpen ? setFlyoutLeague(null) : openFlyout(league.id))}
                      className={[
                        subRowBase,
                        isOpen ? 'text-ink bg-surface' : 'text-ink hover:bg-surface',
                        'w-full',
                      ].join(' ')}
                    >
                      {league.label}
                      {/* Desktop: left-pointing chevron — the fly-out opens to
                          the side. Mobile: down chevron that flips 180° when
                          expanded — the sub-dropdown opens BELOW this row. */}
                      <svg
                        className={[
                          'hidden md:block w-3 h-3 flex-shrink-0 transition-colors duration-150',
                          isOpen ? 'text-accent' : 'text-faint',
                        ].join(' ')}
                        viewBox="0 0 10 10"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <ChevronDown
                        className={[
                          'md:hidden flex-shrink-0 transition-transform duration-200',
                          isOpen ? 'rotate-180 text-accent' : 'text-faint',
                        ].join(' ')}
                      />
                    </button>

                    {/* ── MOBILE inline sub-dropdown ──────────────────────
                        Renders directly beneath the row instead of the side
                        fly-out (which is desktop-only, see below). USAU gets
                        its own per-division accordion (UsauLevelAccordion,
                        no renderExtra — links only, no team grids on mobile);
                        every other league gets the shared LeagueFlyoutBody. */}
                    {isOpen && (
                      <div className="md:hidden pl-5 pr-2 pt-1 pb-2">
                        {league.id === 'usau' ? (
                          <UsauLevelAccordion
                            pathname={pathname}
                            urlDivision={urlDivision}
                            expandedLevel={usauMobileExpandedLevel}
                            onToggleLevel={handleUsauMobileLevelToggle}
                            onClose={onClose}
                          />
                        ) : (
                          <LeagueFlyoutBody
                            league={league.id}
                            pathname={pathname}
                            leagueQsFor={leagueQsFor}
                            onClose={onClose}
                            tabRowBase="flex flex-col gap-0.5"
                            tabLinkBase={[
                              'flex items-center w-full px-3 min-h-[44px] rounded-md',
                              'text-[11px] font-bold tracking-[0.1em] uppercase font-tight',
                              'transition-colors duration-150 no-underline',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                            ].join(' ')}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PLAYBOOK ─────────────────────────────────────────────── */}
          <SubAppRow
            app="playbook"
            href="/playbook"
            label="Playbook"
            active={activeApp === 'playbook'}
            rowBase={rowBase}
            iconTile={iconTile}
            onClose={onClose}
          />

          {/* ── 12-0 ─────────────────────────────────────────────────── */}
          <SubAppRow
            app="twelve-oh"
            href="/12-0"
            label="12-0"
            active={activeApp === 'twelve-oh'}
            rowBase={rowBase}
            iconTile={iconTile}
            onClose={onClose}
          />

          {/* ── FANTASY (beta) ───────────────────────────────────────── */}
          <SubAppRow
            app="fantasy"
            href="/fantasy"
            label="Fantasy"
            badge="BETA"
            active={activeApp === 'fantasy'}
            rowBase={rowBase}
            iconTile={iconTile}
            onClose={onClose}
          />

        </nav>
      </div>

      {/* ── LEAGUE FLY-OUT — DESKTOP ONLY ───────────────────────────────────
          MOBILE (<md): no overlay — the league's pages render INLINE below
          the row it belongs to (see the sub-dropdown in the accordion above).
          DESKTOP (md+): sits just left of the 360px main drawer (360 + 340 =
          700px fits comfortably). Shows the previewed league's sub-pages +
          team grid — the old mega-menu content. */}
      {flyoutLeague && (
        <div
          role="menu"
          aria-label={`${MEGA_LEAGUES.find((l) => l.id === flyoutLeague)?.label ?? ''} navigation`}
          className={[
            'hidden md:flex md:flex-col bg-bg overflow-y-auto shadow-2xl',
            'absolute z-[1]',
            // Desktop: full-height column beside the right drawer (original).
            'md:inset-y-0 md:left-auto md:right-[360px] md:w-[340px] md:max-h-none',
            'md:rounded-none md:border-b-0 md:border-l',
            'motion-reduce:animate-none',
          ].join(' ')}
          style={{ animation: 'gamesDropdownIn 160ms ease-out both' }}
        >
          <LeagueFlyout
            league={flyoutLeague}
            pathname={pathname}
            urlDivision={urlDivision}
            leagueQsFor={leagueQsFor}
            onBack={() => setFlyoutLeague(null)}
            onClose={onClose}
            usau={{ teams: usauTeams, loading: usauLoading, error: usauError }}
            usauCollege={{ teams: usauCollegeTeams, loading: usauCollegeLoading, error: usauCollegeError }}
            pul={{ teams: pulTeams, loading: pulLoading, error: pulError }}
            wfdf={{ events: wfdfEvents, loading: wfdfLoading, error: wfdfError }}
            usauLevel={usauLevel}
            onUsauLevelChange={handleUsauLevelChange}
          />
        </div>
      )}
    </div>
  );

  return createPortal(panel, document.body);
}
