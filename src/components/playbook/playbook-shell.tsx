'use client';

// The Playbook's own chrome — intentionally NOT the games AppShell.
// Per the V2 reorg: this is treated as a separate sub-app inside the same
// codebase. No league switcher (irrelevant), playbook-specific left nav,
// authenticated user avatar in the top right.
//
// Layout:
//   Desktop (lg+): AppRail (top, global) + 240px sidebar (intra-Playbook) + sticky 56px top bar + scrollable main.
//   Mobile (<lg): AppRail (top, global) + compact intra-app header (team + section) + content.
//
// The global AppRail owns: logo, app switcher, search, theme toggle, account chip.
// PlaybookShell owns: TeamSwitcher, Plays/Film subnav.

import Link from 'next/link';
import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { AppRail } from '@/components/app-rail';
import { ThemeToggle } from '@/components/theme-toggle';
import { TeamSwitcher } from './team-switcher';
import { PlayList } from './play-list';
import type { Team } from '@/lib/playbook/teams';
import type { Play } from '@/lib/playbook/types';
import type { CopyDestination } from './playbook-app';

interface PlaybookShellProps {
  teams: Team[];
  currentTeamID?: string;
  onSwitchTeam: (id: string) => void;
  /** Label for the desktop top bar's left edge. When omitted, the top bar is
   *  not rendered at all (e.g. the play editor, which already shows the scope
   *  in the sidebar TeamSwitcher and a breadcrumb in its own header). */
  pageTitle?: string;
  /** Renders indented under the "Plays" nav item on desktop. Use for things
   *  like the saved-plays list — only mounted on lg+. */
  playsNavExtras?: React.ReactNode;
  /** Mobile header "All plays" dropdown. When provided, a full plays manager
   *  (select / new / delete / copy) renders on the top header row next to the
   *  scope pill (mobile only). Omitted on routes with no play list. */
  plays?: Play[];
  currentPlayID?: string;
  onSelectPlay?: (id: string) => void;
  onCreatePlay?: () => void;
  onDeletePlay?: (id: string) => void;
  copyTargets?: CopyDestination[];
  onCopyPlay?: (playID: string, target: CopyDestination) => void;
  children: React.ReactNode;
}

const NAV: Array<{ label: string; href: string; match: string; tag?: 'beta' | 'soon' }> = [
  { label: 'Plays', href: '/playbook', match: '/playbook' },
  { label: 'Film', href: '/playbook/film', match: '/playbook/film', tag: 'soon' },
];

export function PlaybookShell({
  teams,
  currentTeamID,
  onSwitchTeam,
  pageTitle,
  playsNavExtras,
  plays,
  currentPlayID,
  onSelectPlay,
  onCreatePlay,
  onDeletePlay,
  copyTargets,
  onCopyPlay,
  children,
}: PlaybookShellProps) {
  const pathname = usePathname() ?? '/playbook';
  const currentTeam = teams.find((t) => t.id === currentTeamID);
  // Mobile scope dropdown — held in a ref so a scope switch can force it shut
  // (picking a scope inside should dismiss the whole panel, not leave it open).
  const scopeDetailsRef = useRef<HTMLDetailsElement | null>(null);

  return (
    <div className="h-[100dvh] bg-bg text-ink flex flex-col">
      {/* Global top app rail */}
      <AppRail />

      {/* ── Mobile (<lg) ───────────────────────────────────────────────── */}
      <div className="lg:hidden flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-hairline bg-bg">
          {/* Left: scope + plays pickers on one row */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Scope chip — a rounded-md tile (not a full pill) so the square
                team/ME badge sits flush inside it. Opens the full switcher. */}
            <details ref={scopeDetailsRef} className="relative">
              <summary
                aria-label={`Current scope: ${currentTeam?.name ?? 'Personal'}`}
                className={[
                  'list-none cursor-pointer inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-md border border-border bg-surface',
                  'max-w-[46vw] hover:border-ink transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center w-6 h-6 rounded text-[9px] font-bold tracking-[0.04em] text-white flex-shrink-0"
                  style={{ background: currentTeam?.color ?? 'rgb(var(--ink))' }}
                >
                  {currentTeam?.shortName ?? 'ME'}
                </span>
                <span className="min-w-0 flex flex-col leading-none">
                  <span className="text-[11px] font-bold text-ink font-tight truncate">
                    {currentTeam?.name ?? 'Personal'}
                  </span>
                  <span className="text-[8px] font-bold tracking-[0.16em] uppercase text-faint font-tight mt-0.5">
                    {currentTeam ? currentTeam.role : 'My plays'}
                  </span>
                </span>
                <ChevronGlyph />
              </summary>
              <div className="absolute left-0 top-full mt-1 z-30 w-64 border border-border bg-bg rounded-md p-2 shadow-lg">
                <TeamSwitcher
                  teams={teams}
                  currentID={currentTeamID}
                  onSwitch={(id) => {
                    onSwitchTeam(id);
                    // Auto-close the whole scope panel after a pick (the inner
                    // TeamSwitcher closes its own <details>, but this outer one
                    // wrapping it would otherwise stay open).
                    if (scopeDetailsRef.current) scopeDetailsRef.current.open = false;
                  }}
                />
              </div>
            </details>

            {/* All-plays dropdown — sits on the same row as the scope. Only
                rendered when the host route supplies a play list. */}
            {plays && plays.length > 0 && onSelectPlay && (
              <PlaysDropdown
                plays={plays}
                currentPlayID={currentPlayID}
                onSelectPlay={onSelectPlay}
                onCreatePlay={onCreatePlay}
                onDeletePlay={onDeletePlay}
                copyTargets={copyTargets}
                onCopyPlay={onCopyPlay}
              />
            )}
          </div>

          {/* Right: Plays/Film section switcher, pushed to the screen edge. */}
          <details className="relative flex-shrink-0">
            <summary
              aria-label="Playbook sections"
              className={[
                'list-none cursor-pointer flex items-center gap-1 px-2.5 py-2 rounded-md border border-border bg-surface',
                'text-ink hover:border-ink transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              <PlaybookGlyph size={12} />
            </summary>
            <div className="absolute right-0 top-full mt-1 z-30 w-44 border border-border bg-bg rounded-md p-1.5 shadow-lg">
              <PlaybookSubnav pathname={pathname} />
            </div>
          </details>
        </header>

        {children}
      </div>

      {/* ── Desktop (lg+) ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 flex flex-col px-5 pt-5 pb-6 bg-bg border-r border-hairline">
          {/* Team switcher — sits at top so user always sees "who they're
              acting as" immediately. */}
          <TeamSwitcher teams={teams} currentID={currentTeamID} onSwitch={onSwitchTeam} />

          {/* Playbook section header */}
          <div className="flex items-center gap-2 mt-7 mb-3 px-1">
            <PlaybookGlyph size={11} />
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
              Playbook
            </span>
          </div>

          {/* Sub-nav. When a page passes `playsNavExtras` we render that
              indented under the Plays item — currently used for the saved
              plays list on the editor. */}
          <nav className="flex flex-col gap-0.5" aria-label="Playbook sections">
            <PlaybookSubnav pathname={pathname} playsExtras={playsNavExtras} />
          </nav>

          <div className="flex-1" />

          {/* Bottom: theme toggle + version */}
          <div className="flex flex-col gap-2.5 pt-3 border-t border-hairline">
            <ThemeToggle />
            <span className="text-[10px] font-bold tracking-[0.16em] text-faint uppercase font-tight">
              v0.1 · 2026 season
            </span>
          </div>
        </aside>

        {/* Main column. The top bar uses `sticky top-0` so it stays pinned
            inside main's scroll container as the user reads down the page. */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          {pageTitle && (
            <div className="sticky top-0 z-10 flex-shrink-0 h-[56px] px-6 flex items-center border-b border-hairline bg-bg">
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
                {pageTitle}
              </span>
            </div>
          )}
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}

function PlaybookSubnav({
  pathname,
  playsExtras,
}: {
  pathname: string;
  playsExtras?: React.ReactNode;
}) {
  const isActive = (m: string) => pathname === m || pathname.startsWith(`${m}/`);
  return (
    <>
      {NAV.map((item, idx) => {
        const active = isActive(item.match) && item.match !== '/playbook'
          ? true
          : pathname === '/playbook' && item.match === '/playbook';
        const disabled = item.tag === 'soon';
        const inner = (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.tag === 'beta' && (
              <span className="text-[8px] font-bold tracking-[0.16em] text-accent uppercase">
                Beta
              </span>
            )}
            {item.tag === 'soon' && (
              <span className="text-[8px] font-bold tracking-[0.16em] text-faint uppercase">
                Soon
              </span>
            )}
          </>
        );
        const cls = [
          'flex items-center gap-2 w-full text-left px-3 py-[9px] rounded-md text-[13px] font-tight',
          'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors duration-150',
          active
            ? 'font-bold text-ink bg-surface border-border'
            : disabled
              ? 'font-medium text-faint border-transparent cursor-not-allowed opacity-60'
              : 'font-medium text-muted border-transparent hover:text-ink hover:bg-surface',
        ].join(' ');

        // After the Plays item (idx 0), inject the optional extras slot.
        const extrasAfter =
          idx === 0 && playsExtras ? (
            <div className="pl-2 mt-1 mb-2 border-l border-hairline ml-3">{playsExtras}</div>
          ) : null;

        if (disabled) {
          return (
            <span key={item.href} className={cls} aria-disabled="true">
              {inner}
            </span>
          );
        }
        return (
          <div key={item.href}>
            <Link href={item.href} className={cls} aria-current={active ? 'page' : undefined}>
              {inner}
            </Link>
            {extrasAfter}
          </div>
        );
      })}
    </>
  );
}

/**
 * Mobile "All plays" dropdown for the header row. The summary shows the play
 * count + current play; the panel hosts the full PlayList (select / new /
 * delete / copy-to, with step-0 thumbnails) — the same manager the desktop
 * sidebar uses. Selecting or creating closes the panel; delete/copy keep it
 * open so the user can act on several plays in a row. Mobile only.
 */
function PlaysDropdown({
  plays,
  currentPlayID,
  onSelectPlay,
  onCreatePlay,
  onDeletePlay,
  copyTargets,
  onCopyPlay,
}: {
  plays: Play[];
  currentPlayID?: string;
  onSelectPlay: (id: string) => void;
  onCreatePlay?: () => void;
  onDeletePlay?: (id: string) => void;
  copyTargets?: CopyDestination[];
  onCopyPlay?: (playID: string, target: CopyDestination) => void;
}) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };
  const current = plays.find((p) => p.id === currentPlayID);

  return (
    <details ref={ref} className="relative min-w-0">
      <summary
        aria-label="Switch play"
        className={[
          'list-none cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface',
          'max-w-[38vw] hover:border-ink transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <span className="min-w-0 flex flex-col leading-none">
          <span className="text-[8px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
            {plays.length === 1 ? '1 play' : `${plays.length} plays`}
          </span>
          <span className="text-[11px] font-bold text-ink font-tight truncate mt-0.5">
            {current?.name || 'Untitled'}
          </span>
        </span>
        <ChevronGlyph />
      </summary>

      {/* Full-width sheet pinned just under the sticky header. A dropdown
          anchored to the trigger (which sits mid-header) would push the
          PlayList's Del/copy actions off the right edge on a phone; spanning
          the viewport with small side margins keeps every row fully visible. */}
      <div className="fixed left-2 right-2 top-[104px] z-30 border border-border bg-bg rounded-md p-3 shadow-lg max-h-[70vh] overflow-y-auto">
        <PlayList
          plays={plays}
          currentID={currentPlayID}
          onSelect={(id) => {
            onSelectPlay(id);
            close();
          }}
          onCreate={() => {
            onCreatePlay?.();
            close();
          }}
          onDelete={(id) => onDeletePlay?.(id)}
          copyTargets={copyTargets ?? []}
          onCopy={(playID, target) => onCopyPlay?.(playID, target)}
        />
      </div>
    </details>
  );
}

function ChevronGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-faint flex-shrink-0"
      aria-hidden="true"
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}

function PlaybookGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
      <line x1="4" y1="1.5" x2="4" y2="10.5" strokeDasharray="1.2 1.2" />
      <line x1="8" y1="1.5" x2="8" y2="10.5" strokeDasharray="1.2 1.2" />
    </svg>
  );
}
