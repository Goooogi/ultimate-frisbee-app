'use client';

// Minimal page shell for hub-style routes (e.g. /fantasy "coming soon").
// The global AppRail owns the logo / app switcher / theme / account controls,
// so hub routes gain app-switching for free and stay consistent with the rest
// of the app. No left sidebar, no scores-app league bar — just the rail + body.

import { AppRail } from '@/components/app-rail';

interface HubShellProps {
  children: React.ReactNode;
}

export function HubShell({ children }: HubShellProps) {
  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <AppRail />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
