'use client';

// Unified page chrome for every non-home route — single layout regardless of
// theme. The light/dark toggle swaps CSS variables only, not the layout itself.
//
// Desktop (lg+): AppRail (52px, top) + GamesSubnav (44px, secondary bar with
//   sub-page tabs + league switcher) + main column, full-width (no sidebar).
// Mobile (<lg): AppRail (top, carries league switcher via gamesSlotMobile) + content + MobileBottomNav.
//   The league pill lives IN the AppRail on mobile — no separate below-rail strip.

import { Suspense } from 'react';
import { AppRail } from '@/components/app-rail';
import { GamesSubnav } from '@/components/games-subnav';
import { LeagueTabs } from '@/components/league-tabs';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { MobileLeagueSelect } from '@/components/mobile-league-select';
import { useLeague } from '@/lib/use-league';
import { Breadcrumbs, type Crumb } from '@/components/breadcrumbs';

// Hooks like useSearchParams() must be wrapped in Suspense for Next 14
// static prerendering — otherwise the whole tree falls back to CSR and
// the build errors out. We use empty fallbacks since the chrome is
// always interactive and these never block first paint meaningfully.
const SUSPENSE_FALLBACK = null;

interface AppShellProps {
  /** Override the slim top bar's right-edge content. Defaults to a stateful
   * <LeagueTabs> so /scores can pass its own controlled instance if it wants
   * to share state with elsewhere on the page. */
  topNavSlot?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Lean wrapper used directly by pages that render their own hero/header
 * (FeedPage, GameDetail). Pages that want the standard title/eyebrow row
 * should use `PageShell` instead — it composes AppShell + PageHeader.
 */
export function AppShell({ topNavSlot, children }: AppShellProps) {
  // Each tab slot consumes useSearchParams (either via useLeague or via
  // a router push) — wrap in Suspense so prerendering succeeds.
  const tab = (
    <Suspense fallback={SUSPENSE_FALLBACK}>
      {topNavSlot ?? <DefaultLeagueTabs />}
    </Suspense>
  );

  // On mobile the league switcher lives inside the header as a compact
  // dropdown (saves vertical space + thumb-friendly). The desktop pill
  // tabs stay on lg+. Custom topNavSlot wins on both sizes — when a
  // caller passes one (e.g. /players/{id} passes an empty span to hide
  // the switcher entirely because the unified profile combines leagues),
  // we render that slot everywhere.
  const mobileTab = topNavSlot ? (
    <Suspense fallback={SUSPENSE_FALLBACK}>{topNavSlot}</Suspense>
  ) : (
    <Suspense fallback={SUSPENSE_FALLBACK}>
      <MobileLeagueSelect />
    </Suspense>
  );

  return (
    // h-screen + flex-col: AppRail (flex-shrink-0) + GamesSubnav (flex-shrink-0)
    // then the content area gets the remaining height via flex-1.
    <div className="h-screen bg-bg text-ink flex flex-col">
      {/* Global top app rail — present on every breakpoint.
          gamesSlotMobile threads the mobile league control into the rail on <lg.
          gamesSlot is kept in the interface but the rail no longer renders it on
          desktop — the league switcher moved to GamesSubnav below the rail. */}
      <AppRail gamesSlotMobile={mobileTab} />

      {/* ── Desktop secondary nav bar (lg+) ── sits directly under the 52px rail.
          Receives the same `tab` node AppRail previously used for gamesSlot.
          flex-shrink-0 keeps it from being compressed by the scrolling main. */}
      <GamesSubnav leagueSlot={tab} />

      {/* ── Mobile (<lg) ── */}
      <div className="lg:hidden flex-1 overflow-y-auto pb-[88px]">
        {children}
        <Suspense fallback={SUSPENSE_FALLBACK}>
          <MobileBottomNav />
        </Suspense>
      </div>

      {/* ── Desktop (lg+) ── no sidebar; content goes full-width. ── */}
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}

function DefaultLeagueTabs() {
  // Backed by ?league=… in the URL so the active league survives navigation.
  // Every page that uses AppShell without overriding topNavSlot now reads
  // + writes the same state.
  const [active, setActive] = useLeague();
  return <LeagueTabs active={active} onChange={setActive} />;
}

interface PageShellProps {
  /** Big page title shown above content. */
  title: string;
  /** Short caption between the title and content. */
  subtitle?: string;
  /** Small uppercase eyebrow above the title (e.g., "UFA · 2026 Season"). */
  eyebrow?: string;
  /** Optional right-side controls in the page header (filter dropdowns, year selector, etc.). */
  controls?: React.ReactNode;
  /** Optional override for the top-bar slot. Defaults to the league switcher. */
  topNavSlot?: React.ReactNode;
  /** Optional breadcrumb trail rendered above the title. Shallowest first;
   *  last entry is the current page (rendered as plain text). */
  breadcrumbs?: Crumb[];
  children: React.ReactNode;
}

export function PageShell({
  title,
  subtitle,
  eyebrow,
  controls,
  topNavSlot,
  breadcrumbs,
  children,
}: PageShellProps) {
  return (
    <AppShell topNavSlot={topNavSlot}>
      <div className="px-5 pt-4 pb-12 lg:px-14 lg:pt-8 lg:pb-14 lg:max-w-[1080px] lg:mx-auto">
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs crumbs={breadcrumbs} />}
        <PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} controls={controls} />
        {children}
      </div>
    </AppShell>
  );
}

function PageHeader({
  title,
  subtitle,
  eyebrow,
  controls,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  controls?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 mb-5 lg:mb-7">
      <div>
        {eyebrow && (
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted mb-2 font-tight">
            {eyebrow}
          </div>
        )}
        <h1 className="m-0 font-tight text-[36px] lg:text-[56px] font-bold tracking-[-0.04em] leading-none text-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted font-medium font-tight mt-2 text-[13px] lg:text-[15px]">
            {subtitle}
          </p>
        )}
      </div>
      {controls && <div className="flex items-center gap-3 flex-wrap">{controls}</div>}
    </div>
  );
}
