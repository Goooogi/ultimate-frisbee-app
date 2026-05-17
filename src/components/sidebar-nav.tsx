'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';
import { ThemeToggle } from '@/components/theme-toggle';

interface NavItem {
  label: string;
  href: string;
  /** Path prefix used to mark item active for any nested route. */
  match: string;
  /** Additional path prefixes that should also mark this item active. */
  aliases?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'The Games',   href: '/scores',   match: '/scores',   aliases: ['/g'] },
  { label: 'Schedule',    href: '/schedule', match: '/schedule' },
  { label: 'Teams',       href: '/teams',    match: '/teams',    aliases: ['/players'] },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === '/') return pathname === '/';
  const matches = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(item.match)) return true;
  return item.aliases?.some(matches) ?? false;
}

/**
 * Desktop left rail — used by both light & dark themes after the chrome merge.
 * The logo's stroke palette swaps based on the active theme so it reads
 * correctly on either bg.
 */
export function SidebarNav() {
  const [theme] = useTheme();
  const pathname = usePathname() ?? '/';

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col px-6 py-8 bg-bg border-r border-hairline">
      <Link href="/" aria-label="The Layout — home" className="mb-9 inline-block">
        <LogoStrikeInline
          accentColor="rgb(var(--accent))"
          theme={theme === 'broadcast' ? 'dark' : 'light'}
          size={1.05}
        />
      </Link>

      <nav className="flex flex-col gap-0.5" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'w-full text-left px-3 py-[9px] rounded-md text-[13px] cursor-pointer transition-colors duration-150',
                'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                active
                  ? 'font-bold text-ink bg-surface border-border font-tight'
                  : 'font-medium text-muted bg-transparent border-transparent hover:text-ink font-tight',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-3">
        <ThemeToggle />
        <span className="text-[10px] font-bold tracking-[0.16em] text-faint uppercase font-tight">
          v0.1 · 2026 season
        </span>
      </div>
    </aside>
  );
}
