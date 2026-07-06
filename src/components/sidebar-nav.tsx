'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DEFAULT_LEAGUE,
  buildLeagueQs,
  inferLeagueFromPath,
  parseDivisionParam,
  parseLeagueParam,
  parseLevelParam,
} from '@/lib/league';

interface NavItem {
  label: string;
  href: string;
  /** Path prefix used to mark item active for any nested route. */
  match: string;
  /** Additional path prefixes that should also mark this item active. */
  aliases?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'The Games',   href: '/scores',   match: '/scores',   aliases: ['/g', '/usau/events'] },
  { label: 'Schedule',    href: '/schedule', match: '/schedule' },
  { label: 'Teams',       href: '/teams',    match: '/teams',    aliases: ['/usau/teams'] },
  { label: 'Players',     href: '/players',  match: '/players' },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === '/') return pathname === '/';
  const matches = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(item.match)) return true;
  return item.aliases?.some(matches) ?? false;
}

/**
 * Games sub-app left sidebar — intra-Games navigation only.
 * Logo / account / theme are owned by the global AppRail; this sidebar
 * focuses solely on [The Games, Schedule, Teams, Players].
 * ThemeToggle is retained at the bottom for ergonomics on desktop.
 */
export function SidebarNav() {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  // Active league + division for nav links: explicit query params win,
  // else infer from path. Sidebar links carry both so navigating
  // /scores -> /teams -> /schedule stays in the same league + division.
  const activeLeague = searchParams.get('league')
    ? parseLeagueParam(searchParams.get('league'))
    : (inferLeagueFromPath(pathname) ?? DEFAULT_LEAGUE);
  const activeDivision = parseDivisionParam(searchParams.get('div'));
  const activeLevel = parseLevelParam(searchParams.get('level'));
  const leagueQs = buildLeagueQs(activeLeague, activeDivision, activeLevel);

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col px-6 pt-6 pb-8 bg-bg border-r border-hairline">
      {/* Section label */}
      <div className="px-1 mb-3">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
          Games
        </span>
      </div>

      <nav className="flex flex-col gap-0.5" aria-label="Games navigation">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={`${item.href}${leagueQs}`}
              className={[
                'w-full text-left px-3 py-[9px] rounded-md text-[13px] cursor-pointer transition-colors duration-150',
                'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                active
                  ? 'font-bold text-ink bg-surface border-border font-tight'
                  : 'font-medium text-muted bg-transparent border-transparent hover:text-ink font-tight',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-3">
        <ThemeToggle />
        <span className="text-[10px] font-bold tracking-[0.16em] text-faint uppercase font-tight">
          v0.1 · 2026 season
        </span>
      </div>
    </aside>
  );
}
