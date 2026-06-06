'use client';

// Mobile bottom nav for the inner app (Games / Schedule / Teams / Playbook).
//
// On <lg the desktop SidebarNav is hidden and there was no replacement —
// users could get stuck on a /scores page with no way back to /teams or
// /schedule. This component sits fixed at the bottom (above safe-area on
// iOS) and mirrors the SidebarNav's items, preserving the active league
// in the URL so navigating between tabs stays in the same league.

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  DEFAULT_LEAGUE,
  buildLeagueQs,
  inferLeagueFromPath,
  parseDivisionParam,
  parseLeagueParam,
} from '@/lib/league';

interface Tab {
  id: string;
  label: string;
  href: string;
  match: string;
  aliases?: string[];
  icon: 'games' | 'schedule' | 'teams' | 'players';
}

const TABS: Tab[] = [
  { id: 'games',    label: 'Games',    href: '/scores',   match: '/scores',   aliases: ['/g', '/usau/events'], icon: 'games' },
  { id: 'schedule', label: 'Schedule', href: '/schedule', match: '/schedule', icon: 'schedule' },
  { id: 'teams',    label: 'Teams',    href: '/teams',    match: '/teams',    aliases: ['/usau/teams'], icon: 'teams' },
  { id: 'players',  label: 'Players',  href: '/players',  match: '/players',  icon: 'players' },
];

function isActive(pathname: string, tab: Tab): boolean {
  const matches = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(tab.match)) return true;
  return tab.aliases?.some(matches) ?? false;
}

export function MobileBottomNav() {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  // Preserve the active league when switching tabs so navigating
  // /scores?league=usau → /teams stays on the USAU side.
  const activeLeague = searchParams.get('league')
    ? parseLeagueParam(searchParams.get('league'))
    : (inferLeagueFromPath(pathname) ?? DEFAULT_LEAGUE);
  const activeDivision = parseDivisionParam(searchParams.get('div'));
  const leagueQs = buildLeagueQs(activeLeague, activeDivision);

  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg/95 backdrop-blur px-1.5 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] grid grid-cols-4"
    >
      {TABS.map((tab) => {
        const active = isActive(pathname, tab);
        return (
          <Link
            key={tab.id}
            href={`${tab.href}${leagueQs}`}
            aria-current={active ? 'page' : undefined}
            className="flex flex-col items-center gap-1 px-2 py-1 no-underline"
          >
            <Icon kind={tab.icon} active={active} />
            <span
              className={[
                'text-[10px] font-bold tracking-[0.1em] uppercase font-tight',
                // Active tab uses the accent (lime on Broadcast, coral on Field).
                // Inactive uses muted (not faint) so labels stay clearly legible
                // while still reading as secondary to the accent-colored active tab.
                active ? 'text-accent' : 'text-muted',
              ].join(' ')}
            >
              {tab.label}
            </span>
            <span
              aria-hidden="true"
              className={['w-[18px] h-[2px]', active ? 'bg-accent' : 'bg-transparent'].join(' ')}
            />
          </Link>
        );
      })}
    </nav>
  );
}

function Icon({
  kind,
  active,
}: {
  kind: Tab['icon'];
  active: boolean;
}) {
  const c = active ? 'text-ink' : 'text-muted';
  const ball = active ? 'text-accent' : c;
  switch (kind) {
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
  }
}
