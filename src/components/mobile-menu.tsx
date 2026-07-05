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
  const [theme, setTheme] = useTheme();

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
  // Shared classes for the main accordion rows (≥48px touch target).
  const rowBase = [
    'flex items-center justify-between w-full px-5',
    'min-h-[52px] text-left cursor-pointer',
    'text-[12px] font-bold tracking-[0.14em] uppercase font-tight',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
  ].join(' ');

  const subRowBase = [
    'flex items-center justify-between w-full px-8',
    'min-h-[48px] text-left cursor-pointer',
    'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
  ].join(' ');

  const pageRowBase = [
    'flex items-center w-full px-12',
    'min-h-[44px] text-left',
    'text-[11px] font-bold tracking-[0.12em] uppercase font-tight no-underline',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
  ].join(' ');

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
        {/* Header row */}
        <div className="flex items-center justify-between px-5 h-[52px] flex-shrink-0 border-b border-hairline">
          <span className="text-[11px] font-bold tracking-[0.18em] uppercase font-tight text-muted">
            Menu
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className={[
              'inline-flex items-center justify-center w-11 h-11 rounded-full',
              'text-ink hover:bg-surface transition-colors duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              '-mr-2',
            ].join(' ')}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Nav list */}
        <nav aria-label="Primary navigation" className="flex-1 pb-8">

          {/* ── GAMES accordion row ──────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setGamesOpen((v) => !v)}
            aria-expanded={gamesOpen}
            className={[
              rowBase,
              activeApp === 'games' ? 'text-ink' : 'text-ink hover:bg-surface',
              'border-b border-hairline',
            ].join(' ')}
          >
            <span className="flex items-center gap-2">
              The League
              {activeApp === 'games' && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" aria-hidden="true" />
              )}
            </span>
            <ChevronDown
              className={[
                'flex-shrink-0 text-muted transition-transform duration-150',
                gamesOpen ? 'rotate-180' : '',
              ].join(' ')}
            />
          </button>

          {/* GAMES expanded: league list */}
          {gamesOpen && (
            <div className="border-b border-hairline bg-surface/50">
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
                        'text-ink hover:bg-surface no-underline w-full',
                        'border-b border-hairline last:border-0',
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
                        'border-b border-hairline last:border-0',
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
                        'text-ink hover:bg-surface w-full',
                        'border-b border-hairline last:border-0',
                      ].join(' ')}
                    >
                      {league.label}
                      <ChevronDown
                        className={[
                          'flex-shrink-0 text-muted transition-transform duration-150',
                          isLeagueOpen ? 'rotate-180' : '',
                        ].join(' ')}
                      />
                    </button>

                    {/* Sub-pages for this league. WUL + WFDF have their own
                        /wul/* and /wfdf/* routes and take no ?league= qs. */}
                    {isLeagueOpen && (
                      <div className="bg-bg">
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
                                  ? 'text-accent'
                                  : 'text-ink hover:bg-surface',
                                'border-b border-hairline last:border-0',
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

          {/* ── PLAYBOOK row — direct link ───────────────────────────── */}
          <Link
            href="/playbook"
            onClick={onClose}
            aria-current={activeApp === 'playbook' ? 'page' : undefined}
            className={[
              rowBase,
              activeApp === 'playbook' ? 'text-ink' : 'text-ink hover:bg-surface',
              'border-b border-hairline',
            ].join(' ')}
          >
            <span className="flex items-center gap-2">
              PLAYBOOK
              {activeApp === 'playbook' && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" aria-hidden="true" />
              )}
            </span>
          </Link>

          {/* ── FANTASY row — direct link (beta) ────────────────────── */}
          <Link
            href="/fantasy"
            onClick={onClose}
            aria-current={activeApp === 'fantasy' ? 'page' : undefined}
            className={[
              rowBase,
              activeApp === 'fantasy' ? 'text-ink' : 'text-ink hover:bg-surface',
              'border-b border-hairline no-underline',
            ].join(' ')}
          >
            <span className="flex items-center gap-2">
              FANTASY
              <sup className="text-[8px] font-bold tracking-[0.14em] text-accent leading-none">
                BETA
              </sup>
              {activeApp === 'fantasy' && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" aria-hidden="true" />
              )}
            </span>
          </Link>

          {/* ── 12-0 row — direct link ───────────────────────────────── */}
          <Link
            href="/12-0"
            onClick={onClose}
            aria-current={activeApp === 'twelve-oh' ? 'page' : undefined}
            className={[
              rowBase,
              activeApp === 'twelve-oh' ? 'text-ink' : 'text-ink hover:bg-surface',
              'border-b border-hairline',
            ].join(' ')}
          >
            <span className="flex items-center gap-2">
              12-0
              {activeApp === 'twelve-oh' && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" aria-hidden="true" />
              )}
            </span>
          </Link>

          {/* ── Theme toggle row ─────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'field' ? 'broadcast' : 'field')}
            className={[rowBase, 'text-ink hover:bg-surface', 'border-b border-hairline'].join(' ')}
            aria-label={`Switch to ${theme === 'field' ? 'Broadcast' : 'Field'} theme`}
          >
            <span>Theme</span>
            <span className="flex items-center gap-2 text-muted normal-case tracking-normal">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase font-tight">
                {theme === 'field' ? 'Field' : 'Broadcast'}
              </span>
              {theme === 'field' ? (
                // Sun (Field/light)
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <circle cx="8" cy="8" r="3" />
                  <line x1="8" y1="1" x2="8" y2="3" /><line x1="8" y1="13" x2="8" y2="15" />
                  <line x1="1" y1="8" x2="3" y2="8" /><line x1="13" y1="8" x2="15" y2="8" />
                  <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" /><line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
                  <line x1="12.95" y1="3.05" x2="11.54" y2="4.46" /><line x1="4.46" y1="11.54" x2="3.05" y2="12.95" />
                </svg>
              ) : (
                // Moon (Broadcast/dark)
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z" />
                </svg>
              )}
            </span>
          </button>

        </nav>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
