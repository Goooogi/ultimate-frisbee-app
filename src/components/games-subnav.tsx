'use client';

// Secondary nav bar for the Games sub-app — desktop only (hidden lg:flex).
// Sits directly beneath the 52px AppRail and above content.
// Left: Scores · Schedule · Teams · Players tabs (accent underline + ink on active).
// Right: leagueSlot — whatever AppShell computed (LeagueTabs, topNavSlot override,
//   or empty span when the caller hides the switcher on e.g. /players/[uuid]).
//
// Active detection mirrors SidebarNav exactly: prefix match + aliases.
// League query string is preserved on every link via buildLeagueQs.

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  DEFAULT_LEAGUE,
  buildLeagueQs,
  inferLeagueFromPath,
  parseDivisionParam,
  parseLeagueParam,
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

// ─── Inner (needs hooks — wrapped in Suspense by parent) ──────────────────────

interface GamesSubnavInnerProps {
  leagueSlot: React.ReactNode;
}

function GamesSubnavInner({ leagueSlot }: GamesSubnavInnerProps) {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();

  // Fantasy sub-app: its own secondary nav, no league switcher.
  const isFantasy = pathname === '/fantasy' || pathname.startsWith('/fantasy/');
  // WFDF: event-scoped hub — own secondary nav, no ?league= qs, no switcher.
  const isWfdf = pathname === '/wfdf' || pathname.startsWith('/wfdf/');

  // The secondary nav belongs ONLY to league pages and the fantasy sub-app.
  // On everything else (admin, settings, playbook, 12-0, home, …) render
  // nothing — no stray league tabs where they don't apply.
  if (!isFantasy && !isLeaguePage(pathname)) return null;

  // Preserve active league + division across sub-page navigations — same
  // logic as SidebarNav. (Not used on Fantasy / WFDF pages, which carry no qs.)
  const activeLeague = searchParams.get('league')
    ? parseLeagueParam(searchParams.get('league'))
    : (inferLeagueFromPath(pathname) ?? DEFAULT_LEAGUE);
  const activeDivision = parseDivisionParam(searchParams.get('div'));
  const leagueQs = buildLeagueQs(activeLeague, activeDivision);

  // Sub-app pages (Fantasy, WFDF) carry no league query string and hide the
  // league switcher; standard league pages get the ?league= qs on every link.
  const noQs = isFantasy || isWfdf;
  const items = isFantasy ? FANTASY_NAV_ITEMS : isWfdf ? WFDF_NAV_ITEMS : NAV_ITEMS;

  return (
    <div
      className={[
        'hidden lg:flex items-center justify-between',
        'h-[44px] px-6 border-b border-hairline bg-bg',
        // flex-shrink-0 keeps the bar from being squeezed by the main scroll column
        'flex-shrink-0',
      ].join(' ')}
      aria-label={
        isFantasy
          ? 'Fantasy section navigation'
          : isWfdf
            ? 'WFDF section navigation'
            : 'Games section navigation'
      }
    >
      {/* Left: sub-page tabs */}
      <nav
        className="flex items-center gap-1"
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
                  'relative inline-flex items-center gap-1.5 h-[44px] px-3',
                  'text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
                  'text-faint border-b-2 border-transparent cursor-not-allowed select-none',
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
                'relative inline-flex items-center h-[44px] px-3',
                'text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
                'transition-colors duration-150 no-underline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                // Active: accent underline. Inactive: full ink (black on light /
                // white on dark) for legibility — the active state is distinguished
                // by the accent border, not by dimming the inactive labels.
                active
                  ? 'text-ink border-b-2 border-accent'
                  : 'text-ink border-b-2 border-transparent',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Right: league switcher slot — hidden on Fantasy + WFDF (not part of
          the ?league= switching system; WFDF is an event-scoped hub). */}
      {!isFantasy && !isWfdf && leagueSlot && (
        <div className="flex items-center">
          {leagueSlot}
        </div>
      )}
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

interface GamesSubnavProps {
  /**
   * The resolved league control from AppShell — LeagueTabs by default, or the
   * topNavSlot override (e.g. an empty span to hide the switcher on /players/[id]).
   * Passed straight through to the right side of the bar.
   */
  leagueSlot: React.ReactNode;
}

/**
 * Secondary navigation bar rendered under AppRail on Games pages (desktop only).
 * AppShell renders this; other shells (PlaybookShell, home) do not.
 */
export function GamesSubnav({ leagueSlot }: GamesSubnavProps) {
  return (
    <Suspense fallback={<GamesSubnavSkeleton />}>
      <GamesSubnavInner leagueSlot={leagueSlot} />
    </Suspense>
  );
}

function GamesSubnavSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="hidden lg:flex h-[44px] border-b border-hairline bg-bg flex-shrink-0"
    />
  );
}
