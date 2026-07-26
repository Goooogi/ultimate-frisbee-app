'use client';

// Desktop top nav for the home page. Wordmark · primary links · date · avatar.
// The home page is light-themed and doesn't carry the field/broadcast toggle —
// that's a sub-app concern.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { Today } from '@/lib/today';
import { LogoStrikeInline } from '@/components/logo-strike';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccountChip } from '@/components/auth/account-chip';
import { useTheme } from '@/lib/use-theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { canUseUtcg } from '@/lib/auth/types';

const LINKS: Array<{ label: string; href: string; tag?: 'beta' | 'soon' }> = [
  { label: 'GAMES',     href: '/scores' },
  { label: 'PLAYBOOK',  href: '/playbook' },
  { label: 'FANTASY',   href: '/fantasy',  tag: 'soon' },
  { label: 'STANDINGS', href: '/teams' },
];

// The mini-games, grouped under a "MINI GAMES" dropdown on the home strip.
// UTCG is beta-gated (admins + beta users) — filtered out for everyone else.
const ALL_MINI_GAMES: Array<{ label: string; href: string; blurb: string; utcg?: boolean }> = [
  { label: '12-0', href: '/12-0', blurb: 'Draft the perfect undefeated roster' },
  { label: 'UTCG', href: '/utcg', blurb: 'Collect cards, open packs, build a squad', utcg: true },
];

interface HomeNavProps {
  today: Today;
  weekLabel?: string;
}

export function HomeNav({ today, weekLabel }: HomeNavProps) {
  const pathname = usePathname() ?? '/';
  const [theme] = useTheme();
  const { user } = useAuth();
  const [miniOpen, setMiniOpen] = useState(false);
  const MINI_GAMES = ALL_MINI_GAMES.filter((g) => !g.utcg || canUseUtcg(user?.profile?.role));
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const miniActive = MINI_GAMES.some((g) => isActive(g.href));

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-5 lg:px-12 py-5 border-b border-border bg-bg">
      <Link href="/" aria-label="The Layout — home" className="inline-flex">
        <LogoStrikeInline
          accentColor="rgb(var(--accent))"
          theme={theme === 'broadcast' ? 'dark' : 'light'}
          size={1.05}
        />
      </Link>

      <nav className="hidden md:flex gap-7 items-center" aria-label="Primary">
        {LINKS.map((l) => {
          const active = isActive(l.href);
          const link = (
            <Link
              key={l.label}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'relative text-[12px] font-bold tracking-[0.16em] no-underline pb-1',
                'border-b-2 transition-colors duration-150',
                active ? 'text-ink border-accent' : 'text-muted border-transparent hover:text-ink',
              ].join(' ')}
            >
              {l.label}
              {l.tag === 'beta' && <sup className="text-[8px] text-accent ml-1 align-super">BETA</sup>}
              {l.tag === 'soon' && <sup className="text-[8px] text-faint ml-1 align-super">SOON</sup>}
            </Link>
          );
          // Slot the MINI GAMES dropdown in right after PLAYBOOK.
          if (l.label === 'PLAYBOOK') {
            return (
              <div key="__group" className="contents">
                {link}
                <div
                  className="relative"
                  onMouseEnter={() => setMiniOpen(true)}
                  onMouseLeave={() => setMiniOpen(false)}
                >
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={miniOpen}
                    onClick={() => setMiniOpen((v) => !v)}
                    onFocus={() => setMiniOpen(true)}
                    className={[
                      'relative inline-flex items-center gap-1 text-[12px] font-bold tracking-[0.16em] pb-1 cursor-pointer',
                      'border-b-2 transition-colors duration-150 bg-transparent',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm',
                      miniActive ? 'text-ink border-accent' : 'text-muted border-transparent hover:text-ink',
                    ].join(' ')}
                  >
                    MINI GAMES
                    <svg
                      className={['w-3 h-3 transition-transform duration-200', miniOpen ? 'rotate-180' : ''].join(' ')}
                      viewBox="0 0 16 16" fill="none" aria-hidden="true"
                    >
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {miniOpen && (
                    <div
                      className="absolute left-0 top-full pt-2 z-40"
                      role="menu"
                      aria-label="Mini games"
                    >
                      <div className="min-w-[240px] rounded-card bg-surface shadow-lift p-1.5 flex flex-col gap-0.5">
                        {MINI_GAMES.map((g) => {
                          const gActive = isActive(g.href);
                          return (
                            <Link
                              key={g.href}
                              href={g.href}
                              role="menuitem"
                              onClick={() => setMiniOpen(false)}
                              aria-current={gActive ? 'page' : undefined}
                              className={[
                                'flex flex-col gap-0.5 px-3 py-2.5 rounded-lg no-underline transition-colors duration-150',
                                gActive ? 'bg-ink/5' : 'hover:bg-ink/5',
                              ].join(' ')}
                            >
                              <span className="font-display italic font-bold text-[18px] leading-none tracking-[-0.02em] text-ink">
                                {g.label}
                              </span>
                              <span className="text-[11px] text-muted font-tight leading-snug">{g.blurb}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }
          return link;
        })}
      </nav>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <AccountChip size={32} />
      </div>
    </header>
  );
}
