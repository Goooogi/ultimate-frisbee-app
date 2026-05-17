'use client';

// Shared "coming soon" body for sub-app stubs (/playbook, /fantasy).
// Lives inside HubShell — provides the centered title + blurb + back-to-home link.

import Link from 'next/link';
import { useTheme } from '@/lib/use-theme';

interface ComingSoonProps {
  eyebrow: string;
  title: string;
  blurb: string;
}

export function ComingSoon({ eyebrow, title, blurb }: ComingSoonProps) {
  const [theme] = useTheme();

  const titleClasses =
    theme === 'broadcast'
      ? 'font-display text-[64px] md:text-[96px] font-bold tracking-[0.01em] uppercase leading-[0.95]'
      : 'font-tight text-[56px] md:text-[88px] font-bold tracking-[-0.04em] leading-none';

  return (
    <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
      <div className="inline-flex items-center gap-2 px-3 py-[5px] rounded-full border border-border mb-6">
        <span className="w-[5px] h-[5px] rounded-full bg-faint" aria-hidden="true" />
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-faint font-tight">
          Coming soon
        </span>
      </div>
      <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-muted mb-3 font-tight">
        {eyebrow}
      </div>
      <h1 className={`m-0 ${titleClasses} text-ink`}>{title}</h1>
      <p className="mt-6 text-[15px] md:text-[17px] text-muted font-medium font-tight max-w-md leading-relaxed">
        {blurb}
      </p>
      <Link
        href="/"
        className="mt-10 inline-flex items-center gap-2 px-4 py-2 border border-border bg-surface hover:border-ink transition-colors duration-150 text-[11px] font-bold tracking-[0.18em] uppercase text-ink font-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <BackArrow />
        Back to home
      </Link>
    </section>
  );
}

function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 7H3M7 3L3 7l4 4" />
    </svg>
  );
}
