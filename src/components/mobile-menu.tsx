'use client';

// Full-screen overlay navigation menu for mobile (<lg).
// Rendered via createPortal to document.body so it escapes the sticky rail's
// stacking context (backdrop-blur on the rail creates a new compositing layer
// that would trap any z-index set on a descendant).
//
// Three-layer accordion structure:
//   Layer 1 — sub-apps: GAMES (expandable) · PLAYBOOK (link) · FANTASY (disabled)
//   Layer 2 — leagues: UFA (expandable) · USAU (expandable) · WUL (direct link) · PUL (disabled)
//   Layer 3 — sub-pages: Scores · Schedule · Teams · Players (links with ?league=qs)
//
// Accordion default-open state: opens to the branch that matches the current URL
// so a user in USAU Teams sees GAMES→USAU expanded with Teams highlighted.

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

// ─── Types ─────────────────────────────────────────────────────────────────────

type SubApp = 'games' | 'playbook' | 'fantasy' | 'twelve-oh';

type MegaLeagueId = 'ufa' | 'usau' | 'wul' | 'pul';

interface MegaLeague {
  id: MegaLeagueId;
  label: string;
  real: boolean;
}

const MEGA_LEAGUES: MegaLeague[] = [
  { id: 'ufa',  label: 'UFA',  real: true  },
  { id: 'usau', label: 'USAU', real: true  },
  { id: 'pul',  label: 'PUL',  real: true  }, // real=true: expandable with 4 sub-page links
  { id: 'wul',  label: 'WUL',  real: false }, // WUL: direct link only
];

// WUL navigates directly. PUL is now expandable (real=true above).
const MEGA_LEAGUE_DIRECT_HREFS: Partial<Record<MegaLeagueId, string>> = {
  wul: '/wul/teams',
};

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
  const initialLeagueOpen: MegaLeagueId | null = initialGamesOpen
    ? (urlLeague === 'usau' ? 'usau' : urlLeague === 'pul' ? 'pul' : 'ufa')
    : null;

  const [gamesOpen, setGamesOpen] = useState(initialGamesOpen);
  const [openLeague, setOpenLeague] = useState<MegaLeagueId | null>(initialLeagueOpen);

  // Re-derive accordion state when pathname changes (e.g., navigating while menu open).
  useEffect(() => {
    const app = detectSubApp(pathname);
    setGamesOpen(app === 'games');
    if (app === 'games') {
      const league = searchParams.get('league')
        ? parseLeagueParam(searchParams.get('league'))
        : (inferLeagueFromPath(pathname) ?? 'ufa');
      setOpenLeague(league === 'usau' ? 'usau' : league === 'pul' ? 'pul' : 'ufa');
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
    // Backdrop — tap outside to close.
    <div
      className={[
        'fixed inset-0 z-[100]',
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

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={[
          'absolute inset-0 flex flex-col bg-bg overflow-y-auto',
          // Slide in from the top; respect reduced-motion.
          'transition-transform motion-reduce:transition-none',
          open ? 'translate-y-0' : '-translate-y-full',
        ].join(' ')}
        style={{ transitionDuration: '180ms', transitionTimingFunction: 'ease-out' }}
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
              GAMES
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

                    {/* Sub-pages for this league */}
                    {isLeagueOpen && (
                      <div className="bg-bg">
                        {GAMES_NAV_ITEMS.map((item) => {
                          const active = isGamesNavActive(pathname, item);
                          const qs = leagueQsFor(league.id);
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

          {/* ── FANTASY row — disabled ───────────────────────────────── */}
          <div
            aria-disabled="true"
            className={[
              rowBase,
              'text-faint cursor-not-allowed select-none border-b border-hairline',
            ].join(' ')}
          >
            <span className="flex items-center gap-2">
              FANTASY
              <sup className="text-[8px] font-bold tracking-[0.14em] text-faint leading-none">
                SOON
              </sup>
            </span>
          </div>

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

        </nav>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
