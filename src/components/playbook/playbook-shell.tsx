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
import { usePathname } from 'next/navigation';
import { AppRail } from '@/components/app-rail';
import { ThemeToggle } from '@/components/theme-toggle';
import { TeamSwitcher } from './team-switcher';
import type { Team } from '@/lib/playbook/teams';

interface PlaybookShellProps {
  teams: Team[];
  currentTeamID?: string;
  onSwitchTeam: (id: string) => void;
  /** Optional override for the top bar's left edge — defaults to the page name. */
  pageTitle?: string;
  /** Renders indented under the "Plays" nav item on desktop. Use for things
   *  like the saved-plays list — only mounted on lg+. */
  playsNavExtras?: React.ReactNode;
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
  pageTitle = 'The Playbook',
  playsNavExtras,
  children,
}: PlaybookShellProps) {
  const pathname = usePathname() ?? '/playbook';
  const currentTeam = teams.find((t) => t.id === currentTeamID);

  return (
    <div className="h-[100dvh] bg-bg text-ink flex flex-col">
      {/* Global top app rail */}
      <AppRail />

      {/* ── Mobile (<lg) ───────────────────────────────────────────────── */}
      <div className="lg:hidden flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-hairline bg-bg">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Scope pill — compact tap target that opens the full switcher. */}
            <details className="relative">
              <summary
                aria-label={`Current scope: ${currentTeam?.name ?? 'Personal'}`}
                className={[
                  'list-none cursor-pointer inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full border border-border bg-surface',
                  'text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-ink max-w-[120px]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold tracking-[0.04em] text-white flex-shrink-0"
                  style={{ background: currentTeam?.color ?? 'rgb(var(--ink))' }}
                >
                  {currentTeam?.shortName ?? 'ME'}
                </span>
                <span className="truncate">{currentTeam?.name ?? 'Personal'}</span>
              </summary>
              <div className="absolute left-0 top-full mt-1 z-30 w-64 border border-border bg-bg rounded-md p-2 shadow-lg">
                <TeamSwitcher teams={teams} currentID={currentTeamID} onSwitch={onSwitchTeam} />
              </div>
            </details>
            {/* Playbook section dropdown */}
            <details className="relative">
              <summary
                className={[
                  'list-none cursor-pointer flex items-center gap-1 px-2 py-1.5 rounded-full border border-border bg-surface',
                  'text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-ink',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                ].join(' ')}
              >
                <PlaybookGlyph size={10} />
              </summary>
              <div className="absolute left-0 top-full mt-1 z-30 w-44 border border-border bg-bg rounded-md p-1.5 shadow-lg">
                <PlaybookSubnav pathname={pathname} />
              </div>
            </details>
          </div>
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
          <div className="sticky top-0 z-10 flex-shrink-0 h-[56px] px-6 flex items-center border-b border-hairline bg-bg">
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
              {pageTitle}
            </span>
          </div>
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

function PlaybookGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
      <line x1="4" y1="1.5" x2="4" y2="10.5" strokeDasharray="1.2 1.2" />
      <line x1="8" y1="1.5" x2="8" y2="10.5" strokeDasharray="1.2 1.2" />
    </svg>
  );
}
