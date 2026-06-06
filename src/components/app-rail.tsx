'use client';

// Global persistent top app rail — sits above EVERY screen in the app.
//
// Desktop (lg+): logo · GAMES▾ (dropdown) · SearchBar · [spacer] · PLAYBOOK · 12-0 · FANTASY · ThemeToggle · AccountChip
//   GAMES is a hover+click dropdown listing Scores/Schedule/Teams/Players.
//   PLAYBOOK + 12-0 + FANTASY live on the right side with the SearchBar/Theme/Account.
//   The desktop league switcher (LeagueTabs) has moved to GamesSubnav — the
//   secondary bar rendered under the rail on Games pages. gamesSlot is no
//   longer rendered in the rail on desktop.
//
// Mobile (<lg):  logo · [spacer] · hamburger button · AccountChip
//   Tapping the hamburger opens the MobileMenu full-screen overlay which
//   provides the 3-layer accordion: sub-apps → leagues → sub-pages.
//   The SearchBar is desktop-only. ThemeToggle on mobile lives inside the
//   AccountChip dropdown (both signed-in and signed-out states).
//
// Active sub-app is derived from the current pathname. The rail owns the logo
// and the account/theme controls; the inner shells (AppShell, PlaybookShell)
// must NOT render duplicate copies of those controls on desktop.
//
// gamesSlot: UNUSED on desktop (league switcher moved to GamesSubnav). Kept in
//   the interface for backward compat but no longer rendered in the rail.
// gamesSlotMobile: optional node for the MOBILE league control (<lg only, games sub-app only).
// AppShell passes both; other shells pass nothing.

import Link from 'next/link';
import { Suspense, useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccountChip } from '@/components/auth/account-chip';
import { SearchBar } from '@/components/search-bar';
import { MobileMenu } from '@/components/mobile-menu';
import {
  DEFAULT_LEAGUE,
  buildLeagueQs,
  inferLeagueFromPath,
  parseDivisionParam,
  parseLeagueParam,
} from '@/lib/league';
import { activeTeams } from '@/lib/ufa/teams';
import { TeamLogo } from '@/components/team-logo';
import type { RankedTeam } from '@/lib/usau/data';

// ─── Sub-app definitions ──────────────────────────────────────────────────────

type SubApp = 'games' | 'playbook' | 'fantasy' | 'twelve-oh';

interface AppLink {
  id: SubApp;
  label: string;
  href: string;
  tag?: 'beta' | 'soon';
}

const APP_LINKS: AppLink[] = [
  { id: 'games',     label: 'GAMES',    href: '/scores' },
  { id: 'playbook',  label: 'PLAYBOOK', href: '/playbook' },
  { id: 'fantasy',   label: 'FANTASY',  href: '/fantasy',  tag: 'soon' },
  { id: 'twelve-oh', label: '12-0',     href: '/12-0' },
];

// Map pathname prefixes → active sub-app. Order matters: more specific first.
const APP_PREFIX_MAP: Array<[string, SubApp]> = [
  ['/playbook', 'playbook'],
  ['/fantasy',  'fantasy'],
  ['/12-0',     'twelve-oh'],
  // Games sub-app: /scores /schedule /teams /players /g /usau
  ['/scores',   'games'],
  ['/schedule', 'games'],
  ['/teams',    'games'],
  ['/players',  'games'],
  ['/g/',       'games'],
  ['/g',        'games'],
  ['/usau',     'games'],
];

function detectSubApp(pathname: string): SubApp | null {
  for (const [prefix, app] of APP_PREFIX_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return app;
  }
  // Home page: no active sub-app — all links show resting state
  return null;
}

// ─── Games sub-page nav items (mirrors GamesSubnav / SidebarNav) ─────────────

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

function isGamesNavActive(pathname: string, item: GamesNavItem): boolean {
  if (item.match === '/') return pathname === '/';
  const matches = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(item.match)) return true;
  return item.aliases?.some(matches) ?? false;
}

// ─── Mega-menu league list ─────────────────────────────────────────────────────
// Defined locally — intentionally NOT added to LeagueId or LEAGUES in data.ts
// (WUL/PUL don't belong in the league-switching system until they're built).

type MegaLeagueId = 'ufa' | 'usau' | 'wul' | 'pul';

interface MegaLeague {
  id: MegaLeagueId;
  label: string;
  real: boolean;   // true = navigable; false = "coming soon" placeholder
}

const MEGA_LEAGUES: MegaLeague[] = [
  { id: 'ufa',  label: 'UFA',  real: true  },
  { id: 'usau', label: 'USAU', real: true  },
  { id: 'wul',  label: 'WUL',  real: false },
  { id: 'pul',  label: 'PUL',  real: false },
];

// ─── UFA division order + labels ──────────────────────────────────────────────

const UFA_DIVISIONS = ['East', 'Central', 'South', 'West'] as const;
type UfaDivision = (typeof UFA_DIVISIONS)[number];

// Build the static UFA team grid once at module load (no fetch needed).
const UFA_BY_DIVISION: Record<UfaDivision, ReturnType<typeof activeTeams>> = (() => {
  const grouped: Record<UfaDivision, ReturnType<typeof activeTeams>> = {
    East: [], Central: [], South: [], West: [],
  };
  for (const team of activeTeams()) {
    if (team.division && team.division in grouped) {
      grouped[team.division as UfaDivision].push(team);
    }
  }
  // Sort each division alphabetically by city for a predictable order.
  for (const div of UFA_DIVISIONS) {
    grouped[div].sort((a, b) => (a.city ?? '').localeCompare(b.city ?? ''));
  }
  return grouped;
})();

// ─── GAMES dropdown (desktop only) ───────────────────────────────────────────
// Opens on hover (mouseenter on the wrapping group) and on click/keyboard.
// Closes on: mouse-leave the group, Esc, click-away, navigation.
//
// On desktop this renders the ESPN-style two-pane mega-menu:
//   LEFT  — league rail (UFA/USAU real; WUL/PUL disabled "SOON")
//   RIGHT — sub-page links row + team grid for the previewed league.
// Mobile (<lg) keeps the existing MobileSubAppDropdown; this component
// renders nothing on mobile (`hidden lg:flex`).

interface GamesDropdownProps {
  activeApp: SubApp | null;
  pathname: string;
}

function GamesDropdown({ activeApp, pathname }: GamesDropdownProps) {
  const [open, setOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // URL-inferred league/division — used to build sub-page links so the active
  // league persists when the user clicks into Scores/Teams/etc.
  const urlLeague = searchParams.get('league')
    ? parseLeagueParam(searchParams.get('league'))
    : (inferLeagueFromPath(pathname) ?? DEFAULT_LEAGUE);
  const urlDivision = parseDivisionParam(searchParams.get('div'));

  // `previewLeague` controls ONLY which right-pane content is shown — it does
  // NOT navigate. Hovering a league row sets it; clicking a sub-page/team link
  // navigates (with that league's qs) and closes the menu.
  const [previewLeague, setPreviewLeague] = useState<MegaLeagueId>(
    urlLeague === 'usau' ? 'usau' : 'ufa',
  );

  // USAU top-16 teams — fetched lazily once when the dropdown first opens (or
  // first time USAU is hovered). Cached in state for the session lifetime of
  // this component instance (the rail is mounted once at the top of every page
  // so this is effectively app-session caching).
  const [usauTeams, setUsauTeams] = useState<RankedTeam[] | null>(null);
  const [usauLoading, setUsauLoading] = useState(false);
  const [usauError, setUsauError] = useState(false);
  const usauFetchedRef = useRef(false); // guard against double-fetch

  const usauMountedRef = useRef(true);
  useEffect(() => () => { usauMountedRef.current = false; }, []);

  const fetchUsauTeams = useCallback(async () => {
    if (usauFetchedRef.current) return;
    usauFetchedRef.current = true;
    setUsauLoading(true);
    try {
      const { listRankedTeams } = await import('@/lib/usau/data');
      const { teams } = await listRankedTeams({ competitionLevel: 'CLUB', genderDivision: 'Men' });
      if (usauMountedRef.current) setUsauTeams(teams.slice(0, 16));
    } catch {
      if (usauMountedRef.current) setUsauError(true);
    } finally {
      if (usauMountedRef.current) setUsauLoading(false);
    }
  }, []);

  const isActive = activeApp === 'games';

  // Reset preview league to match URL when the dropdown opens.
  const handleOpen = useCallback(() => {
    setPreviewLeague(urlLeague === 'usau' ? 'usau' : 'ufa');
    setOpen(true);
  }, [urlLeague]);

  // Lazily trigger USAU fetch when dropdown opens with USAU previewed, or when
  // user hovers USAU for the first time.
  useEffect(() => {
    if (open && previewLeague === 'usau') {
      fetchUsauTeams();
    }
  }, [open, previewLeague, fetchUsauTeams]);

  // Close on Esc.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  }, []);

  // Close on click outside.
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, handleKeyDown, handleClickOutside]);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Build the league qs for a given mega-league's sub-page links.
  // WUL/PUL are not real LeagueIds so we only build qs for ufa/usau.
  function leagueQsFor(lid: MegaLeagueId): string {
    if (lid === 'usau') return buildLeagueQs('usau', urlDivision);
    return buildLeagueQs('ufa', urlDivision);
  }

  return (
    <div
      ref={groupRef}
      className="relative hidden lg:flex items-center"
      onMouseEnter={handleOpen}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Trigger button */}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Games navigation"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className={[
          'inline-flex items-center gap-1 px-3 py-1 rounded',
          'text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          isActive
            ? 'text-ink border-b-2 border-accent pb-[2px]'
            : 'text-ink border-b-2 border-transparent pb-[2px]',
        ].join(' ')}
      >
        GAMES
        {/* Inline SVG chevron — rotates when open */}
        <svg
          className={[
            'w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150',
            open ? 'rotate-180' : '',
          ].join(' ')}
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── Mega-menu panel ─────────────────────────────────────────────────
          Outer wrapper: top-full + pt-1.5 hover bridge (keeps mouse path
          continuous from trigger to panel). Visible card inside.
          Width capped at 680px; sits left-aligned under the GAMES trigger
          which is near the left edge so right-overflow is not a concern. */}
      {open && (
        <div
          className="absolute left-0 top-full z-[60] pt-1.5"
          style={{ animation: 'gamesDropdownIn 150ms ease-out both' }}
        >
          <div
            role="menu"
            aria-label="Games navigation"
            className="w-[680px] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-bg shadow-lg overflow-hidden flex"
          >
            {/* ── LEFT: league rail ──────────────────────────────────────── */}
            <div
              className="w-[148px] flex-shrink-0 border-r border-hairline py-2"
              role="group"
              aria-label="Leagues"
            >
              {MEGA_LEAGUES.map((league) => {
                const isPreview = previewLeague === league.id;
                const isDisabled = !league.real;

                if (isDisabled) {
                  return (
                    <div
                      key={league.id}
                      aria-disabled="true"
                      className="flex items-center justify-between px-4 py-2.5 text-faint cursor-not-allowed select-none"
                    >
                      <span className="text-[12px] font-bold tracking-[0.12em] uppercase font-tight">
                        {league.label}
                      </span>
                      <sup className="text-[8px] font-bold tracking-[0.12em] text-faint leading-none">
                        SOON
                      </sup>
                    </div>
                  );
                }

                return (
                  <button
                    key={league.id}
                    type="button"
                    role="menuitem"
                    aria-pressed={isPreview}
                    onMouseEnter={() => {
                      setPreviewLeague(league.id);
                      if (league.id === 'usau') fetchUsauTeams();
                    }}
                    onFocus={() => {
                      setPreviewLeague(league.id);
                      if (league.id === 'usau') fetchUsauTeams();
                    }}
                    className={[
                      'w-full flex items-center justify-between px-4 py-2.5 text-left',
                      'text-[12px] font-bold tracking-[0.12em] uppercase font-tight',
                      'transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                      isPreview
                        ? 'bg-surface text-ink'
                        : 'text-ink hover:bg-surface',
                    ].join(' ')}
                  >
                    {league.label}
                    {/* Right-pointing chevron on the active league */}
                    <svg
                      className={[
                        'w-2.5 h-2.5 flex-shrink-0 transition-opacity duration-150',
                        isPreview ? 'opacity-100' : 'opacity-0',
                      ].join(' ')}
                      viewBox="0 0 10 10"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3.5 2L6.5 5L3.5 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                );
              })}
            </div>

            {/* ── RIGHT: content pane ────────────────────────────────────── */}
            <div className="flex-1 min-w-0 p-4">
              {/* Sub-page link row — always visible for real leagues */}
              {(previewLeague === 'ufa' || previewLeague === 'usau') && (
                <div className="flex items-center gap-1 mb-4 pb-3 border-b border-hairline">
                  {GAMES_NAV_ITEMS.map((item) => {
                    const active = isGamesNavActive(pathname, item);
                    const qs = leagueQsFor(previewLeague);
                    return (
                      <Link
                        key={item.href}
                        href={`${item.href}${qs}`}
                        role="menuitem"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setOpen(false)}
                        className={[
                          'px-3 py-1.5 rounded',
                          'text-[11px] font-bold tracking-[0.12em] uppercase font-tight',
                          'transition-colors duration-150 no-underline',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          active
                            ? 'text-ink bg-surface'
                            : 'text-ink hover:bg-surface',
                        ].join(' ')}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* ── UFA: 4-division team grid ──────────────────────────── */}
              {previewLeague === 'ufa' && (
                <div className="grid grid-cols-4 gap-x-4 gap-y-0">
                  {UFA_DIVISIONS.map((div) => (
                    <div key={div}>
                      <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint mb-1.5 px-1">
                        {div}
                      </p>
                      <ul className="space-y-0.5">
                        {UFA_BY_DIVISION[div].map((team) => (
                          <li key={team.id}>
                            <Link
                              href={`/teams/${team.id}`}
                              role="menuitem"
                              onClick={() => setOpen(false)}
                              className={[
                                'flex items-center gap-2 px-1 py-1 rounded',
                                'text-[12px] font-medium font-tight text-ink',
                                'transition-colors duration-150 no-underline',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                                'hover:bg-surface',
                              ].join(' ')}
                            >
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

              {/* ── USAU: top-16 teams (lazy fetch) ──────────────────── */}
              {previewLeague === 'usau' && (
                <div>
                  <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint mb-1.5">
                    Top Teams
                  </p>
                  {usauLoading && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-7 rounded bg-surface animate-pulse"
                        />
                      ))}
                    </div>
                  )}
                  {!usauLoading && usauError && (
                    <div className="py-3 text-[12px] text-muted">
                      Couldn&apos;t load teams —{' '}
                      <Link
                        href="/teams?league=usau"
                        onClick={() => setOpen(false)}
                        className="text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                      >
                        browse all
                      </Link>
                    </div>
                  )}
                  {!usauLoading && !usauError && usauTeams && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      {usauTeams.map((team) => (
                        <Link
                          key={team.id}
                          href={`/usau/teams/${team.id}`}
                          role="menuitem"
                          onClick={() => setOpen(false)}
                          className={[
                            'flex items-center gap-2 px-1 py-1 rounded',
                            'text-[12px] font-medium font-tight text-ink',
                            'transition-colors duration-150 no-underline',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                            'hover:bg-surface',
                          ].join(' ')}
                        >
                          <span className="text-[10px] font-bold text-faint tabular w-4 text-right flex-shrink-0">
                            {team.nationalsPlacement ?? ''}
                          </span>
                          <span className="truncate">{team.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── WUL / PUL: coming soon ──────────────────────────── */}
              {(previewLeague === 'wul' || previewLeague === 'pul') && (
                <div className="flex items-center justify-center py-8 text-center">
                  <p className="text-[13px] text-muted leading-relaxed">
                    Coming soon —{' '}
                    <span className="font-bold text-ink">
                      {previewLeague === 'wul' ? 'WUL' : 'PUL'}
                    </span>{' '}
                    support is on the way.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rail internals ───────────────────────────────────────────────────────────

interface RailInnerProps {
  gamesSlot?: React.ReactNode;
  gamesSlotMobile?: React.ReactNode;
}

// ─── Mobile sub-app dropdown ──────────────────────────────────────────────────

// The <details>/<summary> dropdown for <lg screens. Pattern mirrors the
// playbook-shell mobile team-switcher for consistency and zero-JS operation.

interface MobileSubAppDropdownProps {
  activeApp: SubApp | null;
}

function MobileSubAppDropdown({ activeApp }: MobileSubAppDropdownProps) {
  // Trigger label: the current sub-app, or "MENU" on the home page where no
  // sub-app is active.
  const activeLink = activeApp
    ? (APP_LINKS.find((l) => l.id === activeApp) ?? APP_LINKS[0])
    : null;
  // Menu items: every app EXCEPT the one we're currently in. On home
  // (activeApp null) that means all three are listed — including GAMES — so
  // the user can actually navigate into Games from the launcher.
  const menuLinks = APP_LINKS.filter((l) => l.id !== activeApp);

  return (
    <details className="relative">
      {/* Trigger — shows active sub-app label + chevron. min-h-[44px] ensures
          the touch target meets the 44px minimum even though the visual is
          tighter. list-none + webkit marker hide removes the default marker. */}
      <summary
        aria-label={activeLink ? `Current section: ${activeLink.label}. Tap to switch.` : 'Open menu'}
        className={[
          'list-none [&::-webkit-details-marker]:hidden cursor-pointer',
          'inline-flex items-center gap-1 min-h-[44px] px-2',
          'text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          // Underline only when genuinely inside a sub-app; on home (no active
          // app) the trigger is a neutral "MENU" launcher.
          activeLink
            ? 'text-ink border-b-2 border-accent'
            : 'text-ink border-b-2 border-transparent',
        ].join(' ')}
      >
        {activeLink ? activeLink.label : 'Menu'}
        {/* Active badge (soon on the trigger itself; beta tag no longer used) */}
        {activeLink?.tag === 'soon' && (
          <sup className="text-[7px] font-bold tracking-[0.14em] text-faint ml-0.5 align-super leading-none">
            SOON
          </sup>
        )}
        {/* Chevron */}
        <svg
          className="w-2.5 h-2.5 text-current ml-0.5 flex-shrink-0"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>

      {/* Dropdown menu — z-[60] clears the rail's own z-50 so nothing clips it.
          The sticky header has no overflow:hidden so absolute children escape. */}
      <div className="absolute left-0 top-full mt-1 z-[60] min-w-[140px] border border-border bg-bg rounded-md p-1.5 shadow-lg">
        {menuLinks.map((link) => {
          const isSoon = link.tag === 'soon';

          if (isSoon) {
            return (
              <span
                key={link.id}
                aria-disabled="true"
                title="Coming soon"
                className={[
                  'flex items-center gap-1.5 px-3 py-2 rounded',
                  'text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
                  'text-faint cursor-not-allowed select-none',
                ].join(' ')}
              >
                {link.label}
                <sup className="text-[7px] font-bold tracking-[0.14em] text-faint ml-0.5 align-super leading-none">
                  SOON
                </sup>
              </span>
            );
          }

          return (
            <Link
              key={link.id}
              href={link.href}
              className={[
                'flex items-center gap-1.5 px-3 py-2 rounded',
                'text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
                'text-ink hover:bg-surface',
                'transition-colors duration-150 no-underline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </details>
  );
}

// ─── Rail inner ───────────────────────────────────────────────────────────────

function RailInner({ gamesSlot, gamesSlotMobile }: RailInnerProps) {
  const pathname = usePathname() ?? '/';
  const activeApp = detectSubApp(pathname);
  const [theme] = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // gamesSlotMobile is no longer rendered in the mobile rail — league
  // selection now lives inside the MobileMenu overlay. The prop is kept
  // in the interface so AppShell doesn't need to change.
  void gamesSlotMobile; // intentionally unused on mobile

  // Close mobile menu on route change.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className={[
        'sticky top-0 z-50 flex items-center gap-2 lg:gap-4 h-[52px] border-b border-hairline bg-bg/95 backdrop-blur',
        // Mobile: tighter horizontal padding so logo + hamburger + account
        // fit comfortably at 360px (24px padding total → 336px usable).
        // Desktop keeps the original px-6.
        'px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] lg:px-6',
      ].join(' ')}
      aria-label="App navigation"
    >
      {/* Logo — fixed-width zone on desktop provides a clean left anchor for
          the GAMES dropdown. On mobile (<lg) width collapses to auto.
          flex-shrink-0 prevents squeezing at narrow widths. */}
      <div className="flex-shrink-0 flex items-center lg:w-[180px]">
        <Link href="/" aria-label="The Layout — home" className="flex-shrink-0">
          <LogoStrikeInline
            accentColor="rgb(var(--accent))"
            theme={theme === 'broadcast' ? 'dark' : 'light'}
            size={0.9}
          />
        </Link>
      </div>

      {/* Desktop: GAMES hover+click dropdown (lg+) */}
      <GamesDropdown activeApp={activeApp} pathname={pathname} />

      {/* Search bar — desktop only, sits immediately right of GAMES. */}
      <div className="hidden lg:flex flex-shrink-0 ml-1">
        <SearchBar />
      </div>

      {/* Spacer — absorbs all available slack. On mobile this pushes the
          hamburger + account to the far right. */}
      <div className="flex-1 min-w-0" />

      {/* Right controls — PLAYBOOK · 12-0 · FANTASY · ThemeToggle (desktop) · hamburger (mobile) · AccountChip
          (SearchBar moved left, beside the GAMES dropdown) */}
      <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">

        {/* PLAYBOOK — desktop only, active underline when in playbook sub-app */}
        <Link
          href="/playbook"
          aria-current={activeApp === 'playbook' ? 'page' : undefined}
          className={[
            'hidden lg:inline-flex items-center px-3 py-1 rounded',
            'text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
            'transition-colors duration-150 no-underline',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            activeApp === 'playbook'
              ? 'text-ink border-b-2 border-accent pb-[2px]'
              : 'text-ink border-b-2 border-transparent pb-[2px]',
          ].join(' ')}
        >
          PLAYBOOK
        </Link>

        {/* 12-0 — desktop only, active underline when in 12-0 sub-app */}
        <Link
          href="/12-0"
          aria-current={activeApp === 'twelve-oh' ? 'page' : undefined}
          className={[
            'hidden lg:inline-flex items-center px-3 py-1 rounded',
            'text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
            'transition-colors duration-150 no-underline',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            activeApp === 'twelve-oh'
              ? 'text-ink border-b-2 border-accent pb-[2px]'
              : 'text-ink border-b-2 border-transparent pb-[2px]',
          ].join(' ')}
        >
          12-0
        </Link>

        {/* FANTASY — desktop only, non-navigable (coming soon) */}
        <span
          aria-disabled="true"
          title="Coming soon"
          className={[
            'hidden lg:inline-flex items-center px-3 py-1 rounded',
            'text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
            'text-faint cursor-not-allowed select-none',
          ].join(' ')}
        >
          FANTASY
          <sup className="text-[7px] font-bold tracking-[0.14em] text-faint ml-1 align-super leading-none">
            SOON
          </sup>
        </span>

        {/* ThemeToggle — desktop only. Mobile theme lives in AccountChip. */}
        <div className="hidden lg:flex">
          <ThemeToggle />
        </div>

        {/* Hamburger — mobile only (<lg). Opens the MobileMenu overlay. */}
        <button
          ref={hamburgerRef}
          type="button"
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
          aria-haspopup="dialog"
          onClick={() => setMobileMenuOpen(true)}
          className={[
            'flex lg:hidden items-center justify-center w-11 h-11 rounded-full flex-shrink-0',
            'text-ink hover:bg-surface transition-colors duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          {/* 3-line hamburger SVG */}
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
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12" x2="14" y2="12" />
          </svg>
        </button>

        <AccountChip size={30} />
      </div>

      {/* Mobile full-screen overlay menu — portalled to document.body */}
      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        triggerRef={hamburgerRef}
      />
    </header>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

interface AppRailProps {
  /**
   * Optional node rendered between the spacer and right controls on DESKTOP
   * (lg+) — visible only when the active sub-app is 'games'.
   * AppShell passes the resolved desktop LeagueTabs here. Other shells omit it.
   */
  gamesSlot?: React.ReactNode;
  /**
   * Optional node rendered between the spacer and right controls on MOBILE
   * (<lg) — visible only when the active sub-app is 'games'.
   * AppShell passes the resolved MobileLeagueSelect here. Other shells omit it.
   * The dropdown uses absolute z-[60] so it escapes the sticky rail correctly.
   */
  gamesSlotMobile?: React.ReactNode;
}

/**
 * Persistent top app rail rendered above every page.
 * Wraps the pathname-reading internals in Suspense so Next 14 static
 * prerendering succeeds without bailing the whole tree to CSR.
 */
export function AppRail({ gamesSlot, gamesSlotMobile }: AppRailProps = {}) {
  return (
    <Suspense fallback={<AppRailSkeleton />}>
      <RailInner gamesSlot={gamesSlot} gamesSlotMobile={gamesSlotMobile} />
    </Suspense>
  );
}

/** Stable skeleton matched to the real rail height so content doesn't shift. */
function AppRailSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-50 h-[52px] border-b border-hairline bg-bg"
    />
  );
}
