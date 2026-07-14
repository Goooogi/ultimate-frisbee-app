'use client';

// Mobile bottom nav for the inner app (Games / Schedule / Teams / Playbook).
//
// On <lg the desktop SidebarNav is hidden and there was no replacement —
// users could get stuck on a /scores page with no way back to /teams or
// /schedule. This component sits fixed at the bottom (above safe-area on
// iOS) and mirrors the SidebarNav's items, preserving the active league
// in the URL so navigating between tabs stays in the same league.
//
// Fantasy and WFDF are self-contained sub-apps (see games-subnav.tsx for the
// desktop equivalent) — they swap in their own tab set with no ?league= qs
// instead of the shared league TABS, so a Fantasy/WFDF user isn't bounced
// back into the league's Games/Schedule/Teams/Players tabs.

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  DEFAULT_LEAGUE,
  buildLeagueQs,
  inferLeagueFromPath,
  parseDivisionParam,
  parseLeagueParam,
  parseLevelParam,
} from '@/lib/league';

interface Tab {
  id: string;
  label: string;
  href: string;
  match: string;
  aliases?: string[];
  icon: 'home' | 'games' | 'schedule' | 'teams' | 'players' | 'leaderboard' | 'myteam' | 'myleague';
  /** Rendered greyed-out, non-navigable — a "coming soon" placeholder tab. */
  soon?: boolean;
}

const TABS: Tab[] = [
  // "Home" tab still opens the games hub (/scores) — the rename is per user
  // feedback; the Recents/Upcoming/Other shortcuts that idea also mentioned are
  // deferred until the destination UX is decided (backlog #8).
  { id: 'games',    label: 'Home',     href: '/scores',   match: '/scores',   aliases: ['/g', '/usau/events'], icon: 'home' },
  { id: 'schedule', label: 'Schedule', href: '/schedule', match: '/schedule', icon: 'schedule' },
  { id: 'teams',    label: 'Teams',    href: '/teams',    match: '/teams',    aliases: ['/usau/teams'], icon: 'teams' },
  { id: 'players',  label: 'Players',  href: '/players',  match: '/players',  icon: 'players' },
];

// WFDF is event-scoped and lives entirely under /wfdf/* (no ?league= param), so
// the shared TABS above would bounce a WFDF user back to UFA. When on any
// /wfdf/* page we swap in WFDF's own tab set so Teams/Players stay in WFDF.
const WFDF_TABS: Tab[] = [
  { id: 'events',  label: 'Events',  href: '/wfdf/events',  match: '/wfdf/events',  icon: 'games' },
  { id: 'scores',  label: 'Scores',  href: '/wfdf/scores',  match: '/wfdf/scores',  icon: 'schedule' },
  { id: 'teams',   label: 'Teams',   href: '/wfdf/teams',   match: '/wfdf/teams',   aliases: ['/wfdf/teams'], icon: 'teams' },
  { id: 'players', label: 'Players', href: '/wfdf/players', match: '/wfdf/players', aliases: ['/wfdf/players'], icon: 'players' },
];

// Fantasy is its own sub-app (mirrors FANTASY_NAV_ITEMS in games-subnav.tsx):
// Leaderboard IS the /fantasy landing page, My Team is nested under /fantasy/team,
// and My League is a "coming soon" placeholder — not yet a real route.
const FANTASY_TABS: Tab[] = [
  { id: 'leaderboard', label: 'Leaderboard', href: '/fantasy',      match: '/fantasy',      icon: 'leaderboard' },
  { id: 'myteam',      label: 'My Team',     href: '/fantasy/team', match: '/fantasy/team', icon: 'myteam' },
  { id: 'myleague',    label: 'My League',   href: '#',             match: '__none__',      icon: 'myleague', soon: true },
];

// The landing (/fantasy) IS the leaderboard, and /fantasy/team is nested under
// it — so plain prefix matching would light up BOTH tabs on /fantasy/team.
// Mirrors isFantasyActive in games-subnav.tsx exactly.
function isFantasyActive(pathname: string, tab: Tab): boolean {
  if (tab.match === '/fantasy') {
    return pathname === '/fantasy';
  }
  if (tab.match === '/fantasy/team') {
    return pathname === '/fantasy/team' || pathname.startsWith('/fantasy/team/');
  }
  return false;
}

function isActive(pathname: string, tab: Tab): boolean {
  const matches = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(tab.match)) return true;
  return tab.aliases?.some(matches) ?? false;
}

export function MobileBottomNav() {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  // WFDF is event-scoped and self-contained under /wfdf/* — its tabs carry no
  // ?league= qs, and using them here keeps Teams/Players inside WFDF instead of
  // bouncing to UFA (inferLeagueFromPath doesn't recognise /wfdf).
  const isWfdf = pathname.startsWith('/wfdf');
  // Fantasy is its own sub-app (see games-subnav.tsx) — same landing-page-IS-
  // the-first-tab shape as the desktop secondary nav, so it needs its own tab
  // set and exact-match active logic instead of the shared TABS/prefix rule.
  const isFantasy = pathname === '/fantasy' || pathname.startsWith('/fantasy/');

  // Preserve the active league when switching tabs so navigating
  // /scores?league=usau → /teams stays on the USAU side.
  const activeLeague = searchParams.get('league')
    ? parseLeagueParam(searchParams.get('league'))
    : (inferLeagueFromPath(pathname) ?? DEFAULT_LEAGUE);
  const activeDivision = parseDivisionParam(searchParams.get('div'));
  const activeLevel = parseLevelParam(searchParams.get('level'));
  const leagueQs = buildLeagueQs(activeLeague, activeDivision, activeLevel);

  const tabs = isFantasy ? FANTASY_TABS : isWfdf ? WFDF_TABS : TABS;
  // Fantasy + WFDF are self-contained sub-apps — no ?league= qs, same as desktop.
  const qs = isFantasy || isWfdf ? '' : leagueQs;

  return (
    <nav
      aria-label="Mobile navigation"
      className={[
        // Floating hub pill (Instagram-style): detached from the screen edges
        // with margins + a bottom gap, rounded-full, elevated with shadow-lift
        // so it clearly reads as floating above the content rather than a
        // flush edge-to-edge bar.
        // Background is a translucent glass fill — bg-bg/25 (very see-through)
        // lets scrolled content show through behind the icons while backdrop-blur
        // keeps them legible in both themes; border softened to border-hairline/60
        // so the pill still reads as a distinct shape without a heavy outline.
        'lg:hidden fixed bottom-[max(env(safe-area-inset-bottom),0.75rem)] inset-x-3 z-40',
        'rounded-full border border-hairline/60 bg-bg/25 backdrop-blur-md shadow-lift',
        'px-2 py-2.5 flex items-center justify-around',
      ].join(' ')}
    >
      {tabs.map((tab) => {
        // "Coming soon" placeholder — faint, non-navigable icon only (mirrors the
        // `soon` treatment in games-subnav.tsx's desktop FANTASY_NAV_ITEMS, minus
        // the label since this pill is icon-only).
        if (tab.soon) {
          return (
            <span
              key={tab.id}
              aria-disabled="true"
              aria-label={`${tab.label} (coming soon)`}
              className="flex items-center justify-center w-11 h-11 rounded-full cursor-not-allowed select-none"
            >
              <Icon kind={tab.icon} active={false} faint />
            </span>
          );
        }

        const active = isFantasy ? isFantasyActive(pathname, tab) : isActive(pathname, tab);
        return (
          <Link
            key={tab.id}
            href={`${tab.href}${qs}`}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
            className={[
              'flex items-center justify-center w-11 h-11 rounded-full no-underline shrink-0',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              // Active tab gets an accent-tinted disc behind its icon so the
              // current page is unmistakable; inactive tabs have no fill (their
              // icon is the same accent hue, dimmed — see Icon()).
              active ? 'bg-accent/15' : '',
            ].join(' ')}
          >
            <Icon kind={tab.icon} active={active} />
          </Link>
        );
      })}
    </nav>
  );
}

function Icon({
  kind,
  active,
  faint = false,
}: {
  kind: Tab['icon'];
  active: boolean;
  /** Renders the icon in the faint (disabled) token instead of muted/ink/accent. */
  faint?: boolean;
}) {
  // Icon-only pill: every icon is accent (orange). The active tab reads full
  // strength; inactive tabs are the same accent hue at reduced opacity, so the
  // whole bar stays on-brand while the active tab (backed by an accent disc,
  // see the Link above) still clearly stands out. "Soon" placeholders stay faint.
  const c = faint ? 'text-faint' : active ? 'text-accent' : 'text-accent/45';
  const ball = c;
  switch (kind) {
    case 'home':
      // House glyph — reads as "home" at a glance, distinct from the disc.
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={c}>
          <path
            d="M3.5 9.5 11 3.5l7.5 6M5 8.5v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'games':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={ball}>
          <ellipse cx="11" cy="11" rx="9" ry="3.2" stroke="currentColor" strokeWidth="1.5" />
          <ellipse cx="11" cy="11" rx="9" ry="9" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        </svg>
      );
    case 'schedule':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={c}>
          <rect x="3" y="4.5" width="16" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 9h16" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 3v3M15 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'teams':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={c}>
          <circle cx="7" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="15" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2.5 18c.7-2.5 2.5-3.5 4.5-3.5s3.8 1 4.5 3.5M11 18c.7-2.5 2.5-3.5 4.5-3.5s3.8 1 4.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'players':
      // Single-person glyph — distinguishes from the multi-person "teams"
      // icon at a glance.
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={c}>
          <circle cx="11" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 19c1-3.5 4-5 7-5s6 1.5 7 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'leaderboard':
      // Podium / ranking bars — three stepped columns, tallest in the middle.
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={ball}>
          <rect x="2.5" y="11" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="8.5" y="5" width="5" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="14.5" y="8.5" width="5" height="10.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case 'myteam':
      // Jersey glyph — distinguishes "my team" from the generic multi-person
      // "teams" icon used in the league tab set.
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={c}>
          <path
            d="M8 3.5 6 5 3 6.5 4.5 10 6.5 9v9.5A1.5 1.5 0 0 0 8 20h6a1.5 1.5 0 0 0 1.5-1.5V9l2 1 1.5-3.5L16 5l-2-1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 3.5c.6.9 1.7 1.5 3 1.5s2.4-.6 3-1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case 'myleague':
      // Shield glyph — "league" as an institution/membership, matching the
      // disabled "coming soon" placeholder tone used on desktop.
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={c}>
          <path
            d="M11 3 4 5.5V10c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V5.5L11 3Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}
