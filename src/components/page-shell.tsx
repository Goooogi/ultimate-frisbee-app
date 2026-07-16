'use client';

// Unified page chrome for every non-home route — single layout regardless of
// theme. The light/dark toggle swaps CSS variables only, not the layout itself.
//
// Desktop (lg+): AppRail (52px, top — now carries the Scores/Schedule/Teams/
//   Players page-switcher pills, centered in the rail, plus the league slot
//   in its right-hand zone) + main column, full-width (no sidebar, no
//   second bar — the old below-rail GamesSubnav is gone).
// Mobile (<lg): AppRail (top, carries league switcher via gamesSlotMobile) + content + MobileBottomNav.
//   The league pill lives IN the AppRail on mobile — no separate below-rail strip.

import { Suspense, useEffect, useRef, useState } from 'react';
import { AppRail } from '@/components/app-rail';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { Breadcrumbs, type Crumb } from '@/components/breadcrumbs';
import { SiteFooter } from '@/components/site-footer';

// Hooks like useSearchParams() must be wrapped in Suspense for Next 14
// static prerendering — otherwise the whole tree falls back to CSR and
// the build errors out. We use empty fallbacks since the chrome is
// always interactive and these never block first paint meaningfully.
const SUSPENSE_FALLBACK = null;

interface AppShellProps {
  /** Optional content for the slim top bar's right edge. The in-page league
   * switcher was retired (league switching lives in the AppRail mega-menu), so
   * this defaults to empty; pass a node only if a page needs its own control. */
  topNavSlot?: React.ReactNode;
  /** Hide the SiteFooter on mobile (<lg) only. Desktop keeps it. Fantasy uses
   *  this — its own bottom nav + tall content leave no room for the footer on
   *  a phone, and it reads as clutter there. */
  hideFooterMobile?: boolean;
  children: React.ReactNode;
}

/**
 * Lean wrapper used directly by pages that render their own hero/header
 * (FeedPage, GameDetail). Pages that want the standard title/eyebrow row
 * should use `PageShell` instead — it composes AppShell + PageHeader.
 */
export function AppShell({ topNavSlot, hideFooterMobile, children }: AppShellProps) {
  // The in-page league switcher has been retired — league switching now lives
  // in the "The League" mega-menu in the top AppRail, so showing pills/dropdown
  // here too is redundant. We only render a top-nav slot when a page explicitly
  // passes one (some pages still use it for their own controls, e.g. an empty
  // span to hide the switcher on /players/[id]). With no slot, AppRail's
  // GamesLeagueSlot renders nothing and only the page-switcher pills show.
  const tab = topNavSlot ? (
    <Suspense fallback={SUSPENSE_FALLBACK}>{topNavSlot}</Suspense>
  ) : null;

  // Mobile mirrors desktop: only a caller-provided slot renders; no default
  // league dropdown.
  const mobileTab = topNavSlot ? (
    <Suspense fallback={SUSPENSE_FALLBACK}>{topNavSlot}</Suspense>
  ) : null;

  return (
    // h-screen + flex-col: AppRail (flex-shrink-0, now the only chrome bar)
    // then the content area gets the remaining height via flex-1.
    <div className="h-screen bg-bg text-ink flex flex-col">
      {/* Global top app rail — present on every breakpoint. AppRail always
          renders the Scores/Schedule/Teams/Players page-switcher pills
          (centered, self-gating) on lg+; gamesSlot threads this page's
          resolved league-slot node into the rail's right-hand zone —
          replaces the old below-rail GamesSubnav bar entirely.
          gamesSlotMobile threads the mobile league control into the rail on <lg. */}
      <AppRail
        gamesSlot={tab}
        gamesSlotMobile={mobileTab}
      />

      {/* ── Mobile (<lg) ── SiteFooter scrolls up from below the content and
          sits above the floating hub nav's reserved space. The hub floats
          bottom-3 (12px) off the screen edge and is ~64px tall (44px tap
          target + py-2.5 padding), so content needs more clearance than the
          old flush bar (which only reserved its own height). */}
      <div className="lg:hidden flex-1 overflow-y-auto pb-[calc(max(env(safe-area-inset-bottom),0.75rem)+96px)]">
        {children}
        {!hideFooterMobile && <SiteFooter />}
        <Suspense fallback={SUSPENSE_FALLBACK}>
          <MobileBottomNav />
        </Suspense>
      </div>

      {/* ── Desktop (lg+) ── no sidebar; content goes full-width. The footer
          rides at the bottom of the scrolling main so it clears short pages
          (flex-1 content) yet scrolls into view on tall ones. ── */}
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </main>
      </div>
    </div>
  );
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
  /** Optional content for the top-bar slot. Empty by default (the league
   *  switcher was retired — see AppShell). */
  topNavSlot?: React.ReactNode;
  /** Optional breadcrumb trail rendered above the title. Shallowest first;
   *  last entry is the current page (rendered as plain text). */
  breadcrumbs?: Crumb[];
  /** When set, a slim name bar sticks to the top on mobile once the page's
   *  big <h1> title scrolls out of view — so long stat tables (player
   *  profiles) never lose their "whose stats are these" context. Desktop
   *  is unaffected (plenty of vertical space there already). */
  stickyName?: string;
  /** Hide the SiteFooter on mobile (<lg) only; desktop keeps it. See AppShell. */
  hideFooterMobile?: boolean;
  children: React.ReactNode;
}

export function PageShell({
  title,
  subtitle,
  eyebrow,
  controls,
  topNavSlot,
  breadcrumbs,
  stickyName,
  hideFooterMobile,
  children,
}: PageShellProps) {
  return (
    <AppShell topNavSlot={topNavSlot} hideFooterMobile={hideFooterMobile}>
      <div className="px-5 pt-4 pb-12 lg:px-14 lg:pt-8 lg:pb-14 lg:max-w-[1080px] lg:mx-auto">
        {stickyName && <StickyName name={stickyName} />}
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs crumbs={breadcrumbs} />}
        <PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} controls={controls} />
        {stickyName && <StickySentinel />}
        {children}
      </div>
    </AppShell>
  );
}

// AppShell renders `children` twice (once per breakpoint's scroll pane), so a
// single ref/state pair in PageShell can only ever attach to one of the two
// mounted copies — whichever wins is effectively random, and the desktop copy
// (permanently `lg:hidden`, zero-size) breaks the observer if it wins. Each of
// these renders as its own self-contained instance instead, so both the
// mobile and desktop copies work correctly independently.
const STICKY_NAME_ID = 'page-shell-sticky-sentinel';

function StickySentinel() {
  return <div id={STICKY_NAME_ID} aria-hidden="true" />;
}

function StickyName({ name }: { name: string }) {
  const [titleVisible, setTitleVisible] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // The sentinel is a sibling further down this same subtree — find it
    // within this instance's own DOM branch, not the other breakpoint's copy.
    const el = bar.parentElement?.querySelector<HTMLDivElement>(`#${STICKY_NAME_ID}`);
    if (!el) return;
    const root = bar.closest('.overflow-y-auto');
    const observer = new IntersectionObserver(([entry]) => setTitleVisible(entry.isIntersecting), {
      root,
      // Fires as soon as the title crosses under the sticky 52px app rail.
      rootMargin: '-52px 0px 0px 0px',
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={barRef}
      aria-hidden={titleVisible}
      className={[
        'lg:hidden sticky top-[52px] z-40 overflow-hidden',
        'bg-bg/95 backdrop-blur shadow-soft',
        'transition-[max-height,opacity] duration-150',
        titleVisible ? 'max-h-0 opacity-0' : 'max-h-11 opacity-100',
      ].join(' ')}
    >
      <span className="block px-5 py-2.5 font-tight text-[15px] font-bold tracking-[-0.01em] text-ink truncate">
        {name}
      </span>
    </div>
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
          <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent mb-2 font-sans">
            {eyebrow}
          </div>
        )}
        <h1 className="m-0 font-display italic text-[36px] lg:text-[56px] font-bold tracking-[-0.02em] leading-[0.95] text-ink">
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
