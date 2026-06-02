'use client';

// Global persistent top app rail — sits above EVERY screen in the app.
//
// Desktop (lg+): logo · [220px buffer] · sub-app switchers (GAMES / PLAYBOOK / FANTASY) · [spacer] · gamesSlot(if games) · SearchTrigger · ThemeToggle · AccountChip
// Mobile (<lg):  logo · active-app dropdown · [spacer] · gamesSlotMobile(if games) · ThemeToggle · AccountChip
//   The dropdown shows the current sub-app as a trigger (e.g. "GAMES ▾") and
//   lists the other sub-apps in the menu. SearchTrigger is omitted on mobile
//   to keep the rail within 375px — search is still reachable elsewhere.
//   The league switcher (MobileLeagueSelect) lives IN the rail on mobile,
//   right of the spacer, via gamesSlotMobile. No separate below-rail strip.
//
// Active sub-app is derived from the current pathname. The rail owns the logo
// and the account/theme controls; the inner shells (AppShell, PlaybookShell)
// must NOT render duplicate copies of those controls on desktop.
//
// gamesSlot: optional node for the DESKTOP league control (lg+ only, games sub-app only).
// gamesSlotMobile: optional node for the MOBILE league control (<lg only, games sub-app only).
// AppShell passes both; other shells pass nothing.

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccountChip } from '@/components/auth/account-chip';
import { SearchTrigger } from '@/components/search-trigger';

// ─── Sub-app definitions ──────────────────────────────────────────────────────

type SubApp = 'games' | 'playbook' | 'fantasy';

interface AppLink {
  id: SubApp;
  label: string;
  href: string;
  tag?: 'beta' | 'soon';
}

const APP_LINKS: AppLink[] = [
  { id: 'games',    label: 'GAMES',    href: '/scores' },
  { id: 'playbook', label: 'PLAYBOOK', href: '/playbook', tag: 'beta' },
  { id: 'fantasy',  label: 'FANTASY',  href: '/fantasy',  tag: 'soon' },
];

// Map pathname prefixes → active sub-app. Order matters: more specific first.
const APP_PREFIX_MAP: Array<[string, SubApp]> = [
  ['/playbook', 'playbook'],
  ['/fantasy',  'fantasy'],
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
            : 'text-muted border-b-2 border-transparent',
        ].join(' ')}
      >
        {activeLink ? activeLink.label : 'Menu'}
        {/* Active badge (beta/soon on the trigger itself) */}
        {activeLink?.tag === 'beta' && (
          <sup className="text-[7px] font-bold tracking-[0.14em] text-accent ml-0.5 align-super leading-none">
            BETA
          </sup>
        )}
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
                'text-muted hover:text-ink hover:bg-surface',
                'transition-colors duration-150 no-underline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              {link.label}
              {link.tag === 'beta' && (
                <sup className="text-[7px] font-bold tracking-[0.14em] text-accent ml-0.5 align-super leading-none">
                  BETA
                </sup>
              )}
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

  // Show each games slot only on actual Games pages (not home, not other sub-apps)
  const showGamesSlot = activeApp === 'games' && gamesSlot;
  const showGamesSlotMobile = activeApp === 'games' && gamesSlotMobile;

  return (
    <header
      className="sticky top-0 z-50 flex items-center gap-2 lg:gap-4 px-4 lg:px-6 h-[52px] border-b border-hairline bg-bg/95 backdrop-blur"
      aria-label="App navigation"
    >
      {/* Logo — occupies a fixed-width zone on desktop so the sub-app links
          begin flush with the main content column. The sidebar's right border
          sits at 220px from the viewport edge; the rail's lg:px-6 (24px) +
          this 180px zone + the header's gap-4 (16px) = 220px, landing the
          first app link exactly on the content column's left edge.
          On mobile (<lg) the width collapses to auto to keep the rail tight. */}
      <div className="flex-shrink-0 flex items-center lg:w-[180px]">
        <Link href="/" aria-label="The Layout — home" className="flex-shrink-0">
          <LogoStrikeInline
            accentColor="rgb(var(--accent))"
            theme={theme === 'broadcast' ? 'dark' : 'light'}
            size={0.9}
          />
        </Link>
      </div>

      {/* Sub-app switcher — desktop: inline three-link nav, mobile: dropdown */}

      {/* Desktop inline switcher (lg+) — UNCHANGED */}
      <nav
        aria-label="Sub-app switcher"
        className="hidden lg:flex items-center gap-0.5"
      >
        {APP_LINKS.map((link) => {
          const isActive = activeApp === link.id;
          const isSoon = link.tag === 'soon';

          if (isSoon) {
            return (
              <span
                key={link.id}
                aria-disabled="true"
                title="Coming soon"
                className={[
                  'relative inline-flex items-center px-3 py-1 rounded text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
                  'text-faint cursor-not-allowed select-none',
                ].join(' ')}
              >
                {link.label}
                <sup className="text-[7px] font-bold tracking-[0.14em] text-faint ml-1 align-super leading-none">
                  SOON
                </sup>
              </span>
            );
          }

          return (
            <Link
              key={link.id}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'relative inline-flex items-center px-3 py-1 rounded text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
                'transition-colors duration-150 no-underline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                // Active: accent underline + full ink color
                isActive
                  ? 'text-ink border-b-2 border-accent pb-[2px]'
                  : 'text-muted hover:text-ink border-b-2 border-transparent pb-[2px]',
              ].join(' ')}
            >
              {link.label}
              {link.tag === 'beta' && (
                <sup className="text-[7px] font-bold tracking-[0.14em] text-accent ml-1 align-super leading-none">
                  BETA
                </sup>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Mobile dropdown switcher (<lg) */}
      <div className="flex lg:hidden items-center">
        <MobileSubAppDropdown activeApp={activeApp} />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* League switcher slot — desktop only, games sub-app only */}
      {showGamesSlot && (
        <div className="hidden lg:flex items-center">
          {gamesSlot}
        </div>
      )}

      {/* League switcher slot — mobile only, games sub-app only.
          MobileLeagueSelect is content-width (~60px) and its dropdown uses
          absolute z-[60] so it escapes the rail without clipping.
          Width math at 375px (px-4 → 343px usable, gap-2):
            logo ~95px + sub-app ~70px + spacer + league ~60px + ThemeToggle ~30px + AccountChip ~30px
            = ~285px fixed + 4×8px gaps = ~317px — clear 343px budget. */}
      {showGamesSlotMobile && (
        <div className="flex lg:hidden items-center">
          {gamesSlotMobile}
        </div>
      )}

      {/* Right controls.
          SearchTrigger is hidden on mobile (<lg) — the rail at 375px fits:
          logo + sub-app dropdown + spacer + league pill + ThemeToggle + AccountChip.
          Adding search would push it over. Search remains available on desktop. */}
      <div className="flex items-center gap-2">
        <div className="hidden lg:flex">
          <SearchTrigger size={30} />
        </div>
        <ThemeToggle />
        <AccountChip size={30} />
      </div>
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
