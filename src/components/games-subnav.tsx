'use client';

// Desktop (lg+) page-switcher for the Games sub-app — Scores · Schedule ·
// Teams · Players (and the Fantasy / WFDF variants). Lives INSIDE the top
// AppRail now, not in a separate bar underneath it. Two independent pieces,
// both rendered by app-rail.tsx's RailInner in different zones:
//   - GamesPageSwitcherPills — the pill <nav>, rendered in the rail's
//     absolutely-centered zone (true center, regardless of side-zone widths).
//   - GamesLeagueSlot — the league switcher, rendered in the rail's normal
//     right-hand flex zone, to the left of Account/hamburger (NOT centered).
// Both independently re-derive the same active-page/gating logic from
// usePathname (mirrors the existing pattern in mobile-bottom-nav.tsx, which
// also duplicates this gating rather than sharing state via context).
//
// Active detection + league query-string logic is UNCHANGED from the old
// below-rail GamesSubnav — only the rendering location and split into two
// pieces changed (no more h-56px bar div wrapping both).

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  DEFAULT_LEAGUE,
  buildLeagueQs,
  inferLeagueFromPath,
  parseDivisionParam,
  parseLeagueParam,
  parseLevelParam,
} from '@/lib/league';

// ─── Nav items (mirrors SidebarNav.NAV_ITEMS) ─────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  match: string;
  aliases?: string[];
  /** Rendered greyed-out, non-navigable — a "coming soon" placeholder tab. */
  soon?: boolean;
}

// "Scores" replaces "The Games" for the horizontal tab treatment — shorter fits
// the bar better and matches the secondary-nav vocabulary (ESPN: "Scores").
const NAV_ITEMS: NavItem[] = [
  { label: 'Scores',   href: '/scores',   match: '/scores',   aliases: ['/g', '/usau/events'] },
  { label: 'Schedule', href: '/schedule', match: '/schedule' },
  { label: 'Teams',    href: '/teams',    match: '/teams',    aliases: ['/usau/teams'] },
  { label: 'Players',  href: '/players',  match: '/players' },
];

// Fantasy is its own sub-app: it gets a Fantasy-specific secondary nav instead
// of the league (Scores/Schedule/Teams/Players) tabs, and no league switcher.
const FANTASY_NAV_ITEMS: NavItem[] = [
  { label: 'Leaderboard', href: '/fantasy',      match: '/fantasy' },
  { label: 'My Team',     href: '/fantasy/team', match: '/fantasy/team' },
  { label: 'My League',   href: '#',             match: '__none__', soon: true },
];

// WFDF is event-scoped — its pages live under /wfdf/* with no ?league= param, so
// it gets its own secondary-nav items (Events/Scores/Teams/Players) and no
// league switcher, same treatment as the Fantasy sub-app.
const WFDF_NAV_ITEMS: NavItem[] = [
  { label: 'Events',  href: '/wfdf/events',  match: '/wfdf/events' },
  { label: 'Scores',  href: '/wfdf/scores',  match: '/wfdf/scores' },
  { label: 'Teams',   href: '/wfdf/teams',   match: '/wfdf/teams',   aliases: ['/wfdf/teams'] },
  { label: 'Players', href: '/wfdf/players', match: '/wfdf/players', aliases: ['/wfdf/players'] },
];

// The landing (/fantasy) IS the leaderboard, and /fantasy/team is nested under
// it — so plain prefix matching would light up BOTH tabs on /fantasy/team.
// Use exact/segment-aware matching for the fantasy tabs.
function isFantasyActive(pathname: string, item: NavItem): boolean {
  if (item.match === '/fantasy') {
    // Leaderboard active only on the exact landing, not the nested team pages.
    return pathname === '/fantasy';
  }
  if (item.match === '/fantasy/team') {
    return pathname === '/fantasy/team' || pathname.startsWith('/fantasy/team/');
  }
  return false;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === '/') return pathname === '/';
  const matches = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(item.match)) return true;
  return item.aliases?.some(matches) ?? false;
}

// Route prefixes that ARE league pages — the only ones that get the
// Scores/Schedule/Teams/Players secondary nav. Everything else (admin,
// settings, playbook, 12-0, home, reset-password, etc.) gets NO subnav.
const LEAGUE_PREFIXES = [
  '/scores',
  '/schedule',
  '/teams',
  '/players',
  '/g', // UFA game detail
  '/usau', // usau events/teams
  '/wul',
  '/pul',
  '/wfdf', // WFDF Worlds — event-scoped hub
];

function isLeaguePage(pathname: string): boolean {
  return LEAGUE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// ─── Pill nav (centered zone) — needs hooks, wrapped in Suspense by parent ────

function GamesPageSwitcherPillsInner() {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();

  // Fantasy sub-app: its own secondary nav, no league switcher.
  const isFantasy = pathname === '/fantasy' || pathname.startsWith('/fantasy/');
  // WFDF: event-scoped hub — own secondary nav, no ?league= qs, no switcher.
  const isWfdf = pathname === '/wfdf' || pathname.startsWith('/wfdf/');

  // The page switcher belongs ONLY to league pages and the fantasy sub-app.
  // On everything else (admin, settings, playbook, 12-0, home, …) render
  // nothing — no stray league tabs where they don't apply.
  if (!isFantasy && !isLeaguePage(pathname)) return null;

  // Preserve active league + division across sub-page navigations — same
  // logic as SidebarNav. (Not used on Fantasy / WFDF pages, which carry no qs.)
  const activeLeague = searchParams.get('league')
    ? parseLeagueParam(searchParams.get('league'))
    : (inferLeagueFromPath(pathname) ?? DEFAULT_LEAGUE);
  const activeDivision = parseDivisionParam(searchParams.get('div'));
  const activeLevel = parseLevelParam(searchParams.get('level'));
  const leagueQs = buildLeagueQs(activeLeague, activeDivision, activeLevel);

  // Sub-app pages (Fantasy, WFDF) carry no league query string; standard
  // league pages get the ?league= qs on every link.
  const noQs = isFantasy || isWfdf;
  const items = isFantasy ? FANTASY_NAV_ITEMS : isWfdf ? WFDF_NAV_ITEMS : NAV_ITEMS;

  return (
    <nav
      className="flex items-center gap-0.5 bg-ink/5 rounded-full p-0.5"
      aria-label={isFantasy ? 'Fantasy pages' : isWfdf ? 'WFDF pages' : 'Games pages'}
    >
      {items.map((item) => {
        // "Coming soon" placeholder — greyed out, non-navigable.
        if (item.soon) {
          return (
            <span
              key={item.label}
              aria-disabled="true"
              className={[
                'relative inline-flex items-center gap-1.5 h-7 px-3 rounded-full',
                'text-[10.5px] font-bold tracking-[0.08em] uppercase',
                'text-faint cursor-not-allowed select-none',
              ].join(' ')}
            >
              {item.label}
              <span className="text-[8px] tracking-[0.12em] text-faint/80 normal-case font-bold">
                Soon
              </span>
            </span>
          );
        }

        const active = isFantasy ? isFantasyActive(pathname, item) : isActive(pathname, item);
        // Fantasy + WFDF links carry no league query string.
        const href = noQs ? item.href : `${item.href}${leagueQs}`;
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'relative inline-flex items-center h-7 px-3 rounded-full',
              'text-[10.5px] font-bold tracking-[0.08em] uppercase',
              'transition-colors duration-150 no-underline whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active
                ? 'bg-ink text-bg'
                : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Desktop page-switcher pills (Scores/Schedule/Teams/Players, or the Fantasy/
 * WFDF equivalents) — rendered in AppRail's absolutely-centered zone on
 * Games/Fantasy/WFDF pages. Renders nothing on pages where the switcher
 * doesn't apply (isLeaguePage gate above). Does NOT include the league
 * switcher slot — that renders separately via GamesLeagueSlot, in the rail's
 * right-hand zone (next to Account), per the centered-pills / right-aligned
 * league-slot layout.
 */
export function GamesPageSwitcherPills() {
  return (
    <Suspense fallback={null}>
      <GamesPageSwitcherPillsInner />
    </Suspense>
  );
}

// ─── League slot (right zone) — needs hooks, wrapped in Suspense by parent ───

interface GamesLeagueSlotInnerProps {
  leagueSlot: React.ReactNode;
}

function GamesLeagueSlotInner({ leagueSlot }: GamesLeagueSlotInnerProps) {
  const pathname = usePathname() ?? '/';

  const isFantasy = pathname === '/fantasy' || pathname.startsWith('/fantasy/');
  const isWfdf = pathname === '/wfdf' || pathname.startsWith('/wfdf/');

  // Same gate as the pills: only league pages (not Fantasy/WFDF, not admin/
  // settings/playbook/etc.) show a league slot at all.
  if (!isLeaguePage(pathname) || isFantasy || isWfdf) return null;
  if (!leagueSlot) return null;

  return <div className="flex items-center">{leagueSlot}</div>;
}

interface GamesLeagueSlotProps {
  /**
   * The resolved league control from AppShell — the topNavSlot override
   * (e.g. an empty span to hide the switcher on /players/[id]), or null on
   * standard league pages.
   */
  leagueSlot: React.ReactNode;
}

/**
 * Right-hand league switcher slot, rendered in AppRail next to Account (NOT
 * part of the centered pill group) — hidden on Fantasy + WFDF pages (not part
 * of the ?league= switching system) and on non-league pages.
 */
export function GamesLeagueSlot({ leagueSlot }: GamesLeagueSlotProps) {
  return (
    <Suspense fallback={null}>
      <GamesLeagueSlotInner leagueSlot={leagueSlot} />
    </Suspense>
  );
}
