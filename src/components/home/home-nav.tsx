'use client';

// Desktop top nav for the home page. Wordmark · primary links · date · avatar.
// The home page is light-themed and doesn't carry the field/broadcast toggle —
// that's a sub-app concern.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Today } from '@/lib/today';

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
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="flex items-center justify-between px-5 lg:px-12 py-5 border-b border-[#E5E1D6] bg-[#F4F2EC]">
      <Link href="/" aria-label="The Layout — home" className="flex items-baseline gap-2 font-display italic font-bold leading-none tracking-[-0.02em]">
        <span className="text-[#FF3D00] text-[14px]">THE</span>
        <span className="text-[#0E0E0C] text-[22px]">LAYOUT</span>
        <svg width="14" height="6" viewBox="0 0 40 16" aria-hidden="true">
          <ellipse cx="20" cy="8" rx="18" ry="6" fill="#FF3D00" />
          <ellipse cx="20" cy="6.5" rx="14" ry="3.5" fill="rgba(255,255,255,0.25)" />
        </svg>
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
                active ? 'text-[#0E0E0C] border-[#FF3D00]' : 'text-[#6F6B62] border-transparent hover:text-[#0E0E0C]',
              ].join(' ')}
            >
              {l.label}
              {l.tag === 'beta' && <sup className="text-[8px] text-[#FF3D00] ml-1 align-super">BETA</sup>}
              {l.tag === 'soon' && <sup className="text-[8px] text-[#A6A29A] ml-1 align-super">SOON</sup>}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        <span className="hidden sm:inline font-mono text-[11px] text-[#6F6B62] tracking-[0.06em] tabular">
          {today.weekday} · {today.month} {today.day}
          {weekLabel ? ` · ${weekLabel}` : ''}
        </span>
        <span
          aria-hidden="true"
          className="w-8 h-8 rounded-full bg-[#0E0E0C] text-[#F4F2EB] inline-flex items-center justify-center text-[11px] font-bold"
        >
          JM
        </span>
      </div>
    </header>
  );
}
