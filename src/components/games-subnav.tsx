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
}

// "Scores" replaces "The Games" for the horizontal tab treatment — shorter fits
// the bar better and matches the secondary-nav vocabulary (ESPN: "Scores").
const NAV_ITEMS: NavItem[] = [
  { label: 'Scores',   href: '/scores',   match: '/scores',   aliases: ['/g', '/usau/events'] },
  { label: 'Schedule', href: '/schedule', match: '/schedule' },
  { label: 'Teams',    href: '/teams',    match: '/teams',    aliases: ['/usau/teams'] },
  { label: 'Players',  href: '/players',  match: '/players' },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === '/') return pathname === '/';
  const matches = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(item.match)) return true;
  return item.aliases?.some(matches) ?? false;
}

// ─── Inner (needs hooks — wrapped in Suspense by parent) ──────────────────────

interface GamesSubnavInnerProps {
  leagueSlot: React.ReactNode;
}

function GamesSubnavInner({ leagueSlot }: GamesSubnavInnerProps) {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();

  // Preserve active league + division across sub-page navigations — same
  // logic as SidebarNav.
  const activeLeague = searchParams.get('league')
    ? parseLeagueParam(searchParams.get('league'))
    : (inferLeagueFromPath(pathname) ?? DEFAULT_LEAGUE);
  const activeDivision = parseDivisionParam(searchParams.get('div'));
  const leagueQs = buildLeagueQs(activeLeague, activeDivision);

  return (
    <div
      className={[
        'hidden lg:flex items-center justify-between',
        'h-[44px] px-6 border-b border-hairline bg-bg',
        // flex-shrink-0 keeps the bar from being squeezed by the main scroll column
        'flex-shrink-0',
      ].join(' ')}
      aria-label="Games section navigation"
    >
      {/* Left: sub-page tabs */}
      <nav className="flex items-center gap-1" aria-label="Games pages">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={`${item.href}${leagueQs}`}
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

      {/* Right: league switcher slot (LeagueTabs, topNavSlot override, or empty) */}
      {leagueSlot && (
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
