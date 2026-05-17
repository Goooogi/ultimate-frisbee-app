'use client';

// Minimal page shell for hub-style routes (/, /playbook, /fantasy).
// No left sidebar, no scores-app top nav — just logo + theme toggle in a thin
// header so users can always get back to / and switch themes.

import Link from 'next/link';
import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';
import { ThemeToggle } from '@/components/theme-toggle';

interface HubShellProps {
  children: React.ReactNode;
}

export function HubShell({ children }: HubShellProps) {
  const [theme] = useTheme();

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <header className="flex items-center justify-between px-5 lg:px-8 pt-5 pb-3 lg:pt-6 lg:pb-4 border-b border-hairline">
        <Link href="/" aria-label="The Layout — home">
          <LogoStrikeInline
            accentColor="rgb(var(--accent))"
            theme={theme === 'broadcast' ? 'dark' : 'light'}
            size={0.95}
          />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
