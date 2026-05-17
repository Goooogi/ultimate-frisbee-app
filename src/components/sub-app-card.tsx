'use client';

// Large, tappable card that links to one of the home page's three sub-apps.
// Theme-aware via tokens; ships an "available" state and a "coming soon" state.

import Link from 'next/link';
import { useTheme } from '@/lib/use-theme';
import { LiveDot, LiveDotAccent } from '@/components/live-dot';

interface SubAppCardProps {
  /** Short slug used as the visual eyebrow (e.g., "01"). Optional. */
  index?: string;
  title: string;
  description: string;
  href: string;
  status?:
    | { kind: 'live'; label: string }       // pulsing dot + label (e.g., "6 live now")
    | { kind: 'available'; label: string }   // muted dot + label (e.g., "11 games this week")
    | { kind: 'coming'; label?: string };   // "Coming soon" badge — card is dimmed
}

export function SubAppCard({ index, title, description, href, status }: SubAppCardProps) {
  const [theme] = useTheme();
  const isComing = status?.kind === 'coming';

  const titleClasses =
    theme === 'broadcast'
      ? 'font-display text-[42px] md:text-[56px] font-bold tracking-[0.01em] uppercase leading-[0.95]'
      : 'font-tight text-[40px] md:text-[52px] font-bold tracking-[-0.04em] leading-none';

  return (
    <Link
      href={href}
      aria-disabled={isComing || undefined}
      className={[
        'group relative block w-full bg-surface border border-border',
        'p-5 md:p-7 lg:p-8 flex flex-col gap-5',
        'transition-colors duration-150 hover:border-ink hover:bg-surface-hi',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        isComing ? 'opacity-80' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        {index && (
          <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-faint font-tight tabular">
            {index}
          </span>
        )}
        <StatusBadge status={status} />
      </div>

      <h3 className={`m-0 ${titleClasses} text-ink`}>{title}</h3>

      <p className="text-[13px] md:text-[15px] text-muted font-medium font-tight m-0 leading-relaxed">
        {description}
      </p>

      <div className="mt-auto pt-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase font-tight text-ink group-hover:text-accent transition-colors duration-150">
        <span>{isComing ? 'Preview' : 'Open'}</span>
        <Arrow />
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status?: SubAppCardProps['status'] }) {
  if (!status) return <span />;

  if (status.kind === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <LiveDot size={7} />
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-live font-tight">
          {status.label}
        </span>
      </span>
    );
  }

  if (status.kind === 'available') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <LiveDotAccent size={7} />
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
          {status.label}
        </span>
      </span>
    );
  }

  // coming soon
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border border-border">
      <span className="w-[5px] h-[5px] rounded-full bg-faint" aria-hidden="true" />
      <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
        {status.label ?? 'Coming soon'}
      </span>
    </span>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h8M7 3l4 4-4 4" />
    </svg>
  );
}
