'use client';

// Unified page chrome for every non-home route — single layout regardless of
// theme. The light/dark toggle in the sidebar swaps CSS variables only, not
// the layout itself.
//
// Desktop (lg+): SidebarNav rail + main column. A slim top bar above the main
// content hosts the league switcher (UFA / USAU / INTL) and any other slot a
// caller passes via `topNavSlot`.
// Mobile (<lg): compact header with logo + theme toggle, then page title +
// children. The league switcher renders here too in a slim band.

import { Suspense } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';
import { ThemeToggle } from '@/components/theme-toggle';
import { SidebarNav } from '@/components/sidebar-nav';
import { LeagueTabs } from '@/components/league-tabs';
import { AccountChip } from '@/components/auth/account-chip';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { MobileLeagueSelect } from '@/components/mobile-league-select';
import { SearchTrigger } from '@/components/search-trigger';
import { useLeague } from '@/lib/use-league';

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
  const [theme] = useTheme();
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
  // caller passes one (e.g. /players/{id} uses PlayerLeagueTabs to
  // override navigation), we render that slot everywhere.
  const mobileTab = topNavSlot ? (
    <Suspense fallback={SUSPENSE_FALLBACK}>{topNavSlot}</Suspense>
  ) : (
    <Suspense fallback={SUSPENSE_FALLBACK}>
      <MobileLeagueSelect />
    </Suspense>
  );

  return (
    <>
      {/* ── Mobile (<lg) ── */}
      <div className="lg:hidden min-h-screen bg-bg text-ink pb-[88px]">
        <MobileHeader theme={theme} leagueSlot={mobileTab} />
        {children}
        <Suspense fallback={SUSPENSE_FALLBACK}>
          <MobileBottomNav />
        </Suspense>
      </div>

      {/* ── Desktop (lg+) ── */}
      <div className="hidden lg:flex h-screen overflow-hidden bg-bg text-ink">
        <Suspense fallback={SUSPENSE_FALLBACK}>
          <SidebarNav />
        </Suspense>
        <main className="flex-1 overflow-y-auto flex flex-col">
          {/* Top bar: league tabs stay visually centered (absolute), avatar
              anchors the right edge so the chrome matches the home page. */}
          <div className="relative flex-shrink-0 h-[60px] px-8 flex items-center border-b border-hairline bg-bg">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto">{tab}</div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <SearchTrigger size={32} />
              <AccountChip size={32} />
            </div>
          </div>
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </>
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
  children: React.ReactNode;
}

export function PageShell({
  title,
  subtitle,
  eyebrow,
  controls,
  topNavSlot,
  children,
}: PageShellProps) {
  return (
    <AppShell topNavSlot={topNavSlot}>
      <div className="px-5 pt-4 pb-12 lg:px-14 lg:pt-8 lg:pb-14 lg:max-w-[1080px] lg:mx-auto">
        <PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} controls={controls} />
        {children}
      </div>
    </AppShell>
  );
}

function MobileHeader({
  theme,
  leagueSlot,
}: {
  theme: 'field' | 'broadcast';
  leagueSlot: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-hairline">
      <Link href="/" aria-label="The Layout — home" className="flex-shrink-0">
        <LogoStrikeInline
          accentColor="rgb(var(--accent))"
          theme={theme === 'broadcast' ? 'dark' : 'light'}
          size={0.95}
        />
      </Link>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {leagueSlot}
        <SearchTrigger size={28} />
        <ThemeToggle />
        <AccountChip size={28} />
      </div>
    </header>
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
