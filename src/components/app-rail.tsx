'use client';

// Global persistent top app rail — sits above EVERY screen in the app.
//
// Desktop (lg+): logo · [spacer] · page-switcher pills (absolutely centered) ·
//                [spacer] · SearchBar · league slot · Account · hamburger
// Mobile (<lg):  logo · [spacer] · search · Account · hamburger
//
// All primary nav (The League / Playbook / 12-0 / Fantasy / Theme) lives in the
// slide-in MobileMenu panel opened by the hamburger — on every breakpoint. The
// SearchBar is desktop-only; on mobile a search button opens the SearchModal.
//
// Active sub-app is derived from the current pathname. The rail owns the logo
// and the account controls; the inner shells (AppShell, PlaybookShell) must NOT
// render duplicate copies of those controls on desktop.
//
// The Games sub-app's page-SWITCHER (Scores/Schedule/Teams/Players) moved OUT
// of this rail to the floating liquid-glass bottom bar (MobileBottomNav →
// FloatingTabBar), which now renders on every breakpoint. What remains here:
//   - GamesLeagueSlot: fed by the `gamesSlot` prop (the resolved leagueSlot
//     node from AppShell), rendered in the normal right-hand flex zone next
//     to Account. The league switcher is NOT a tab switcher, so it stays.
// gamesSlotMobile: kept in the props for backward compat but no longer
//   rendered — league selection now lives inside the MobileMenu overlay.

import Link from 'next/link';
import { Suspense, useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';
import { AccountChip } from '@/components/auth/account-chip';
import { SearchBar } from '@/components/search-bar';
import { SearchModal, SearchGlyph } from '@/components/search-modal';
import { MobileMenu } from '@/components/mobile-menu';
import { GamesLeagueSlot } from '@/components/games-subnav';

// ─── Sub-app definitions ──────────────────────────────────────────────────────

type SubApp = 'games' | 'playbook' | 'fantasy' | 'twelve-oh';

// Map pathname prefixes → active sub-app. Order matters: more specific first.
const APP_PREFIX_MAP: Array<[string, SubApp]> = [
  ['/playbook', 'playbook'],
  ['/fantasy',  'fantasy'],
  ['/12-0',     'twelve-oh'],
  ['/utcg',     'twelve-oh'],  // UTCG shares the "Mini Games" grouping with 12-0
  // Games sub-app: /scores /schedule /teams /players /g /usau
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
  // Home page: no active sub-app — all links show resting state
  return null;
}

// ─── Rail internals ───────────────────────────────────────────────────────────

interface RailInnerProps {
  gamesSlot?: React.ReactNode;
  gamesSlotMobile?: React.ReactNode;
}


function RailInner({ gamesSlot, gamesSlotMobile }: RailInnerProps) {
  const pathname = usePathname() ?? '/';
  const activeApp = detectSubApp(pathname);
  const [theme] = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
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
      {/* LEFT zone — logo + desktop search. flex-1 (equal weight to the RIGHT
          zone) so the CENTER zone's midpoint lands on the true viewport center.
          min-w-0 lets it shrink rather than shove the center off-axis. */}
      <div className="flex-1 min-w-0 flex items-center gap-2 lg:gap-4">
        {/* Logo — fixed anchor. flex-shrink-0 prevents squeezing at narrow widths. */}
        <div className="flex-shrink-0 flex items-center">
          <Link href="/" aria-label="The Layout — home" className="flex-shrink-0">
            <LogoStrikeInline
              accentColor="rgb(var(--accent))"
              theme={theme === 'broadcast' ? 'dark' : 'light'}
              size={0.9}
            />
          </Link>
        </div>

        {/* Search bar — desktop only. All primary nav (The League / Playbook /
            12-0 / Fantasy / Theme) now lives in the slide-in panel behind the
            hamburger, so search takes the lead slot on the rail. */}
        <div className="hidden lg:flex flex-shrink-0">
          <SearchBar />
        </div>
      </div>

      {/* The page-switcher (Scores/Schedule/Teams/Players, or Fantasy/WFDF)
          moved OUT of the rail to the floating liquid-glass bottom bar
          (MobileBottomNav → FloatingTabBar), which now renders on every
          breakpoint. The league switcher stays in the RIGHT zone below. */}

      {/* RIGHT zone — Search (mobile) · League slot (desktop) · Account ·
          Hamburger. flex-1 justify-end: equal weight to the LEFT zone so the
          CENTER pills stay viewport-centered. The League / Playbook / 12-0 /
          Fantasy / Theme all live in the slide-in panel the hamburger opens. */}
      <div className="flex-1 min-w-0 flex items-center justify-end gap-2 lg:gap-3">

        {/* Search — mobile only (<lg). Opens the full-screen SearchModal,
            reusing the same searchAll() logic as the desktop SearchBar. */}
        <button
          type="button"
          aria-label="Open search"
          onClick={() => setMobileSearchOpen(true)}
          className={[
            'flex lg:hidden items-center justify-center w-11 h-11 rounded-full flex-shrink-0',
            'text-ink hover:bg-surface transition-colors duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          <SearchGlyph size={17} />
        </button>

        {/* League switcher — desktop only, sits to the right of the centered
            pills (NOT centered itself). Renders nothing on Fantasy/WFDF/
            non-league pages, or when the caller passes no leagueSlot. */}
        <div className="hidden lg:flex">
          <GamesLeagueSlot leagueSlot={gamesSlot} />
        </div>

        {/* Account chip — sits to the LEFT of the hamburger. */}
        <AccountChip size={30} />

        {/* Hamburger — ALL breakpoints, right of the account chip. Opens the
            right-side slide-in nav panel. */}
        <button
          ref={hamburgerRef}
          type="button"
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
          aria-haspopup="dialog"
          onClick={() => setMobileMenuOpen(true)}
          className={[
            'inline-flex items-center justify-center w-11 h-11 rounded-full flex-shrink-0',
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
      </div>

      {/* Mobile full-screen search overlay — same SearchModal the desktop
          topbar uses; portalled to document.body. */}
      <SearchModal open={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />

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
   * Optional league-switcher node rendered on DESKTOP (lg+) in the right-hand
   * controls zone (next to Account) — NOT centered. AppShell passes the
   * resolved `tab`/topNavSlot node here (e.g. an empty span to hide the
   * switcher on /players/[id]). The Scores/Schedule/Teams/Players pills
   * always render separately in the centered zone regardless of this prop
   * (see GamesPageSwitcherPills, self-gating). Other shells (Playbook, home)
   * omit this prop entirely, which also correctly renders no league slot.
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
