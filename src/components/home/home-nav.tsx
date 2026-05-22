'use client';

// Desktop top nav for the home page. Wordmark · primary links · date · avatar.
// The home page is light-themed and doesn't carry the field/broadcast toggle —
// that's a sub-app concern.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Today } from '@/lib/today';
import { LogoStrikeInline } from '@/components/logo-strike';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccountChip } from '@/components/auth/account-chip';
import { useTheme } from '@/lib/use-theme';

const LINKS: Array<{ label: string; href: string; tag?: 'beta' | 'soon' }> = [
  { label: 'GAMES',     href: '/scores' },
  { label: 'PLAYBOOK',  href: '/playbook', tag: 'beta' },
  { label: 'FANTASY',   href: '/fantasy',  tag: 'soon' },
  { label: 'STANDINGS', href: '/teams' },
];

interface HomeNavProps {
  today: Today;
  weekLabel?: string;
}

export function HomeNav({ today, weekLabel }: HomeNavProps) {
  const pathname = usePathname() ?? '/';
  const [theme] = useTheme();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-5 lg:px-12 py-5 border-b border-border bg-bg">
      <Link href="/" aria-label="The Layout — home" className="inline-flex">
        <LogoStrikeInline
          accentColor="rgb(var(--accent))"
          theme={theme === 'broadcast' ? 'dark' : 'light'}
          size={1.05}
        />
      </Link>

      <nav className="hidden md:flex gap-7" aria-label="Primary">
        {LINKS.map((l) => {
          const active = isActive(l.href);
          return (
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
        })}
      </nav>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <AccountChip size={32} />
      </div>
    </header>
  );
}
