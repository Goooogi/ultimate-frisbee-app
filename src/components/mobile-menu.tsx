'use client';

// Right-side slide-in navigation panel — shared by mobile AND desktop. The
// hamburger (right of the account chip) opens it; it slides in from the right
// edge. Rendered via createPortal to document.body so it escapes the sticky
// rail's stacking context (backdrop-blur on the rail creates a new compositing
// layer that would trap any z-index set on a descendant).
//
// Three-layer accordion structure:
//   Layer 1 — sub-apps: The League (expandable) · PLAYBOOK · FANTASY · 12-0
//   Layer 2 — leagues: UFA · USAU · WUL · PUL · WFDF (expandable / direct)
//   Layer 3 — sub-pages: Scores · Schedule · Teams · Players (links with ?league=qs)
// Plus a Theme toggle row at the foot.
//
// Accordion default-open state: opens to the branch that matches the current URL
// so a user in USAU Teams sees The League→USAU expanded with Teams highlighted.

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  buildLeagueQs,
  inferLeagueFromPath,
  parseDivisionParam,
  parseLeagueParam,
} from '@/lib/league';
import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';

// ─── Types ─────────────────────────────────────────────────────────────────────

type SubApp = 'games' | 'playbook' | 'fantasy' | 'twelve-oh';

type MegaLeagueId = 'ufa' | 'usau' | 'wul' | 'pul' | 'wfdf';

interface MegaLeague {
  id: MegaLeagueId;
  label: string;
  real: boolean;
}

const MEGA_LEAGUES: MegaLeague[] = [
  { id: 'ufa',  label: 'UFA',  real: true  },
  { id: 'usau', label: 'USAU', real: true  },
  { id: 'pul',  label: 'PUL',  real: true  }, // real=true: expandable with 4 sub-page links
  { id: 'wul',  label: 'WUL',  real: true  }, // real=true: expandable, but Teams-only (no scores/schedule/players yet)
  { id: 'wfdf', label: 'WFDF', real: true  }, // event-scoped hub (Events/Scores/Teams/Players under /wfdf/*)
];

// Direct-link leagues navigate on tap instead of expanding.
// (None today — WFDF now expands into its own /wfdf/* sub-pages.)
const MEGA_LEAGUE_DIRECT_HREFS: Partial<Record<MegaLeagueId, string>> = {};

// WFDF section — event-scoped hub. All pages live under /wfdf/* (no ?league= qs),
// same no-qs treatment as WUL.
const WFDF_NAV_ITEMS: GamesNavItem[] = [
  { label: 'Events',  href: '/wfdf/events',  match: '/wfdf/events' },
  { label: 'Scores',  href: '/wfdf/scores',  match: '/wfdf/scores' },
  { label: 'Teams',   href: '/wfdf/teams',   match: '/wfdf/teams' },
  { label: 'Players', href: '/wfdf/players', match: '/wfdf/players' },
];

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

// WUL section — all four pages route through the shared ?league=wul routes (same
// pattern as PUL). Schedule shows WUL's multi-season history (the source has no
// future fixtures, so it's an archive). Game detail lives at /wul/g/* (aliased
// under Scores so it stays highlighted on a matchup page).
const WUL_NAV_ITEMS: GamesNavItem[] = [
  { label: 'Scores',   href: '/scores?league=wul',   match: '/scores',   aliases: ['/wul/scores', '/wul/g'] },
  { label: 'Schedule', href: '/schedule?league=wul', match: '/schedule' },
  { label: 'Teams',    href: '/teams?league=wul',    match: '/teams',    aliases: ['/wul/teams'] },
  { label: 'Players',  href: '/players?league=wul',  match: '/players',  aliases: ['/wul/players'] },
];

function isGamesNavActive(pathname: string, item: GamesNavItem): boolean {
  if (item.match === '/') return pathname === '/';
  const matches = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(item.match)) return true;
  return item.aliases?.some(matches) ?? false;
}

// ─── APP_PREFIX_MAP (mirrors app-rail.tsx) ─────────────────────────────────────
const APP_PREFIX_MAP: Array<[string, SubApp]> = [
  ['/playbook', 'playbook'],
  ['/fantasy',  'fantasy'],
  ['/12-0',     'twelve-oh'],
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
  return null;
}

// ─── SVG icons ─────────────────────────────────────────────────────────────────

function ChevronDown({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      width="10"
      height="10"
    >
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
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
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  );
}

// Per-sub-app line icons (20×20, 1.6 stroke) — give each top-level menu row a
// scannable glyph. Kept simple + on-brand (disc, clipboard, trophy, spark).
function SubAppIcon({ app, className = '' }: { app: SubApp; className?: string }) {
  const common = {
    className,
    width: 19,
    height: 19,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (app) {
    case 'games': // The League — a flying disc
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="9" ry="4.2" />
          <path d="M4.2 10.5c1.4 1.2 4.3 2 7.8 2s6.4-.8 7.8-2" />
        </svg>
      );
    case 'playbook': // clipboard with a play line
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4h6v2H9z" />
          <path d="M8.5 11l3 3 4-5" />
        </svg>
      );
    case 'twelve-oh': // trophy (12-0 = the perfect season)
      return (
        <svg {...common}>
          <path d="M7 4h10v4a5 5 0 01-10 0V4z" />
          <path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" />
          <path d="M12 13v4M9 20h6M10 20l.5-3h3l.5 3" />
        </svg>
      );
    case 'fantasy': // spark / star burst
      return (
        <svg {...common}>
          <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" />
        </svg>
      );
  }
}

// A top-level direct-link menu row: icon tile · label (· beta) · chevron.
function SubAppRow({
  app,
  href,
  label,
  badge,
  active,
  rowBase,
  iconTile,
  onClose,
}: {
  app: SubApp;
  href: string;
  label: string;
  badge?: string;
  active: boolean;
  rowBase: string;
  iconTile: (active: boolean) => string;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      aria-current={active ? 'page' : undefined}
      className={[
        rowBase,
        active ? 'text-ink bg-[rgb(var(--accent)/0.08)]' : 'text-ink hover:bg-surface',
      ].join(' ')}
    >
      <span className={iconTile(active)}>
        <SubAppIcon app={app} />
      </span>
      <span className="flex-1 flex items-center gap-1.5">
        {label}
        {badge && (
          <sup className="text-[8px] font-bold tracking-[0.14em] text-accent leading-none">
            {badge}
          </sup>
        )}
      </span>
      {/* Trailing chevron — subtle affordance that shifts toward the accent on
          hover (group-hover from rowBase). */}
      <svg
        className="w-3 h-3 flex-shrink-0 text-faint group-hover:text-accent transition-colors duration-150"
        viewBox="0 0 10 10"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

// ─── MobileMenu ────────────────────────────────────────────────────────────────

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  /** Ref to the hamburger button so we can return focus on close. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function MobileMenu({ open, onClose, triggerRef }: MobileMenuProps) {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [theme] = useTheme();

  // SSR guard — createPortal is browser-only.
  useEffect(() => { setMounted(true); }, []);

  // ── Derive initial expanded state from URL ──────────────────────────────
  const activeApp = detectSubApp(pathname);
  const urlLeague = searchParams.get('league')
    ? parseLeagueParam(searchParams.get('league'))
    : (inferLeagueFromPath(pathname) ?? 'ufa');
  const urlDivision = parseDivisionParam(searchParams.get('div'));

  const initialGamesOpen = activeApp === 'games';
  // Only open the league accordion if we're already in a real games page.
  // Detect by ?league= param; legacy /wul,/pul prefixed paths (now redirects)
  // still resolve via the path check.
  const initialLeagueOpen: MegaLeagueId | null = initialGamesOpen
    ? (pathname.startsWith('/wfdf')
        ? 'wfdf'
        : urlLeague === 'wul' || pathname.startsWith('/wul')
        ? 'wul'
        : urlLeague === 'usau' ? 'usau' : urlLeague === 'pul' || pathname.startsWith('/pul') ? 'pul' : 'ufa')
    : null;

  const [gamesOpen, setGamesOpen] = useState(initialGamesOpen);
  const [openLeague, setOpenLeague] = useState<MegaLeagueId | null>(initialLeagueOpen);

  // Re-derive accordion state when pathname changes (e.g., navigating while menu open).
  useEffect(() => {
    const app = detectSubApp(pathname);
    setGamesOpen(app === 'games');
    if (app === 'games') {
      if (pathname.startsWith('/wfdf')) {
        setOpenLeague('wfdf');
      } else if (pathname.startsWith('/wul')) {
        setOpenLeague('wul');
      } else if (pathname.startsWith('/pul')) {
        setOpenLeague('pul');
      } else {
        const league = searchParams.get('league')
          ? parseLeagueParam(searchParams.get('league'))
          : (inferLeagueFromPath(pathname) ?? 'ufa');
        setOpenLeague(
          league === 'usau' ? 'usau'
            : league === 'pul' ? 'pul'
            : league === 'wul' ? 'wul'
            : 'ufa',
        );
      }
    } else {
      setOpenLeague(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ── Body scroll lock ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ── Focus management ────────────────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      // Small delay lets the portal render before focusing.
      const id = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(id);
    } else {
      // Return focus to the hamburger trigger.
      triggerRef.current?.focus();
    }
  }, [open, triggerRef]);

  // ── Esc to close ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  // ── league qs helper (mirrors GamesDropdown) ────────────────────────────
  function leagueQsFor(lid: MegaLeagueId): string {
    if (lid === 'usau') return buildLeagueQs('usau', urlDivision);
    if (lid === 'pul') return buildLeagueQs('pul', null);
    return buildLeagueQs('ufa', urlDivision);
  }

  // ── Row helpers ─────────────────────────────────────────────────────────
  // Top-level rows are rounded "cards" (the nav wrapper adds px-3 + gap). ≥52px
  // touch target. Icon tile + label + trailing affordance.
  const rowBase = [
    'group flex items-center gap-3 w-full pl-2.5 pr-3.5',
    'min-h-[56px] rounded-xl text-left cursor-pointer',
    'text-[13px] font-bold tracking-[0.1em] uppercase font-tight',
    'transition-colors duration-150 no-underline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  ].join(' ');

  // Nested league rows (inside the expanded "The League" card).
  const subRowBase = [
    'flex items-center justify-between w-full pl-5 pr-4',
    'min-h-[46px] text-left cursor-pointer rounded-lg',
    'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
    'transition-colors duration-150 no-underline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
  ].join(' ');

  const pageRowBase = [
    'flex items-center w-full pl-9 pr-4',
    'min-h-[42px] text-left rounded-md',
    'text-[11px] font-semibold tracking-[0.1em] uppercase font-tight no-underline',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
  ].join(' ');

  // Icon tile — the rounded square that holds each sub-app's glyph. Active rows
  // get an accent-filled tile; resting rows a subtle surface tile that tints on
  // hover (group-hover).
  function iconTile(active: boolean): string {
    return [
      'inline-flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0',
      'transition-colors duration-150',
      active
        ? 'bg-accent text-accent-ink'
        : 'bg-[rgb(var(--ink)/0.05)] text-muted group-hover:bg-[rgb(var(--ink)/0.09)] group-hover:text-ink',
    ].join(' ');
  }

  if (!mounted) return null;

  const panel = (
    // Backdrop — tap outside to close. overflow-hidden keeps the off-screen
    // (translate-x-full) closed panel from creating a horizontal scrollbar.
    <div
      className={[
        'fixed inset-0 z-[100] overflow-hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      ].join(' ')}
      aria-hidden={!open}
    >
      {/* Dim layer */}
      <div
        className={[
          'absolute inset-0 bg-ink/50 transition-opacity',
          open ? 'opacity-100' : 'opacity-0',
          // Skip transition when reduced motion is preferred.
          'motion-reduce:transition-none',
        ].join(' ')}
        style={{ transitionDuration: '150ms' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — anchored to the RIGHT edge, slides in from off-screen right.
          Full-width on phones (max-w caps it into a side panel on wider
          screens). */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={[
          'absolute inset-y-0 right-0 w-full max-w-[360px]',
          'flex flex-col bg-bg overflow-y-auto shadow-2xl border-l border-hairline',
          // Slide in from the right; respect reduced-motion.
          'transition-transform motion-reduce:transition-none',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        style={{ transitionDuration: '220ms', transitionTimingFunction: 'ease-out' }}
      >
        {/* Accent glow bleeding down from the top-right — gives the panel a
            branded, lit feel instead of a flat white sheet. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{
            background:
              'radial-gradient(120% 80% at 100% 0%, rgb(var(--accent) / 0.14), transparent 70%)',
          }}
        />

        {/* Header — logo + eyebrow, close button. */}
        <div className="relative flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
          <div className="flex flex-col gap-1.5">
            <LogoStrikeInline
              accentColor="rgb(var(--accent))"
              theme={theme === 'broadcast' ? 'dark' : 'light'}
              size={0.8}
            />
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase font-tight text-faint">
              Menu
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className={[
              'inline-flex items-center justify-center w-10 h-10 rounded-full self-start',
              'bg-surface border border-hairline text-muted',
              'hover:text-ink hover:border-ink transition-colors duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              '-mr-1',
            ].join(' ')}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Nav list */}
        <nav aria-label="Primary navigation" className="relative flex-1 px-3 pb-8 flex flex-col gap-1.5">

          {/* ── THE LEAGUE accordion row ─────────────────────────────── */}
          <button
            type="button"
            onClick={() => setGamesOpen((v) => !v)}
            aria-expanded={gamesOpen}
            className={[
              rowBase,
              activeApp === 'games'
                ? 'text-ink bg-[rgb(var(--accent)/0.08)]'
                : 'text-ink hover:bg-surface',
            ].join(' ')}
          >
            <span className={iconTile(activeApp === 'games')}>
              <SubAppIcon app="games" />
            </span>
            <span className="flex-1">The League</span>
            <ChevronDown
              className={[
                'flex-shrink-0 text-muted transition-transform duration-200',
                gamesOpen ? 'rotate-180' : '',
              ].join(' ')}
            />
          </button>

          {/* THE LEAGUE expanded: league list — inset card with a left accent
              spine so the nesting reads clearly. */}
          {gamesOpen && (
            <div className="ml-3 mb-1 pl-2 border-l-2 border-accent/25 flex flex-col gap-0.5">
              {MEGA_LEAGUES.map((league) => {
                const isDisabled = !league.real;
                const isLeagueOpen = openLeague === league.id;
                const directHref = MEGA_LEAGUE_DIRECT_HREFS[league.id];

                // Direct-link league (WUL) — navigates on tap, no sub-page expand.
                if (directHref) {
                  return (
                    <Link
                      key={league.id}
                      href={directHref}
                      onClick={onClose}
                      className={[
                        subRowBase,
                        'text-ink hover:bg-surface w-full',
                      ].join(' ')}
                    >
                      {league.label}
                    </Link>
                  );
                }

                if (isDisabled) {
                  return (
                    <div
                      key={league.id}
                      aria-disabled="true"
                      className={[
                        subRowBase,
                        'text-faint cursor-not-allowed select-none',
                      ].join(' ')}
                    >
                      {league.label}
                      <sup className="text-[8px] font-bold tracking-[0.14em] text-faint leading-none ml-1">
                        SOON
                      </sup>
                    </div>
                  );
                }

                return (
                  <div key={league.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenLeague((prev) => (prev === league.id ? null : league.id))
                      }
                      aria-expanded={isLeagueOpen}
                      className={[
                        subRowBase,
                        isLeagueOpen ? 'text-ink bg-surface' : 'text-ink hover:bg-surface',
                        'w-full',
                      ].join(' ')}
                    >
                      {league.label}
                      <ChevronDown
                        className={[
                          'flex-shrink-0 text-muted transition-transform duration-200',
                          isLeagueOpen ? 'rotate-180' : '',
                        ].join(' ')}
                      />
                    </button>

                    {/* Sub-pages for this league. WUL + WFDF have their own
                        /wul/* and /wfdf/* routes and take no ?league= qs. */}
                    {isLeagueOpen && (
                      <div className="flex flex-col gap-0.5 py-0.5">
                        {(league.id === 'wul'
                          ? WUL_NAV_ITEMS
                          : league.id === 'wfdf'
                            ? WFDF_NAV_ITEMS
                            : GAMES_NAV_ITEMS
                        ).map((item) => {
                          const active = isGamesNavActive(pathname, item);
                          const qs = league.id === 'wul' || league.id === 'wfdf' ? '' : leagueQsFor(league.id);
                          return (
                            <Link
                              key={item.href}
                              href={`${item.href}${qs}`}
                              onClick={onClose}
                              aria-current={active ? 'page' : undefined}
                              className={[
                                pageRowBase,
                                active
                                  ? 'text-accent bg-[rgb(var(--accent)/0.07)]'
                                  : 'text-muted hover:text-ink hover:bg-surface',
                              ].join(' ')}
                            >
                              {item.label}
                              {active && (
                                <span className="ml-auto w-1 h-4 rounded-full bg-accent flex-shrink-0" aria-hidden="true" />
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PLAYBOOK ─────────────────────────────────────────────── */}
          <SubAppRow
            app="playbook"
            href="/playbook"
            label="Playbook"
            active={activeApp === 'playbook'}
            rowBase={rowBase}
            iconTile={iconTile}
            onClose={onClose}
          />

          {/* ── 12-0 ─────────────────────────────────────────────────── */}
          <SubAppRow
            app="twelve-oh"
            href="/12-0"
            label="12-0"
            active={activeApp === 'twelve-oh'}
            rowBase={rowBase}
            iconTile={iconTile}
            onClose={onClose}
          />

          {/* ── FANTASY (beta) ───────────────────────────────────────── */}
          <SubAppRow
            app="fantasy"
            href="/fantasy"
            label="Fantasy"
            badge="BETA"
            active={activeApp === 'fantasy'}
            rowBase={rowBase}
            iconTile={iconTile}
            onClose={onClose}
          />

        </nav>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
