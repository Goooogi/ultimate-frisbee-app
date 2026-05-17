'use client';

// Fixed bottom tab bar shown on the home page on mobile (<lg).
// Mirrors the design's "Games / Playbook / Fantasy / You" with active accent.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ACCENT = '#FF3D00';

const TABS: Array<{ id: string; label: string; href: string; icon: 'ball' | 'board' | 'trophy' | 'user' }> = [
  { id: 'games',    label: 'Games',    href: '/scores',   icon: 'ball' },
  { id: 'play',     label: 'Playbook', href: '/playbook', icon: 'board' },
  { id: 'fantasy',  label: 'Fantasy',  href: '/fantasy',  icon: 'trophy' },
  { id: 'you',      label: 'You',      href: '/',         icon: 'user' },
];

export function MobileTabBar() {
  const pathname = usePathname() ?? '/';
  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#E5E1D6] bg-[#F4F2EC]/95 backdrop-blur px-1.5 pt-2.5 pb-5 grid grid-cols-4"
    >
      {TABS.map((t) => {
        const active =
          t.href === '/' ? pathname === '/' : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className="flex flex-col items-center gap-1 px-2 py-1 no-underline"
          >
            <Icon kind={t.icon} active={active} />
            <span
              className="text-[10px] font-bold tracking-[0.1em] uppercase"
              style={{ color: active ? '#0E0E0C' : '#A6A29A' }}
            >
              {t.label}
            </span>
            <span
              aria-hidden="true"
              className="w-[18px] h-[2px]"
              style={{ background: active ? ACCENT : 'transparent' }}
            />
          </Link>
        );
      })}
    </nav>
  );
}

function Icon({ kind, active }: { kind: 'ball' | 'board' | 'trophy' | 'user'; active: boolean }) {
  const c = active ? '#0E0E0C' : '#A6A29A';
  switch (kind) {
    case 'ball':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <ellipse cx="11" cy="11" rx="9" ry="3.2" stroke={active ? ACCENT : c} strokeWidth="1.5" />
          <ellipse cx="11" cy="11" rx="9" ry="9" stroke={active ? ACCENT : c} strokeWidth="1.5" opacity="0.4" />
        </svg>
      );
    case 'board':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="18" height="14" rx="1.5" stroke={c} strokeWidth="1.5" />
          <line x1="6" y1="4" x2="6" y2="18" stroke={c} strokeWidth="1.2" strokeDasharray="2 2" />
          <line x1="16" y1="4" x2="16" y2="18" stroke={c} strokeWidth="1.2" strokeDasharray="2 2" />
        </svg>
      );
    case 'trophy':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M6 3h10v5a5 5 0 0 1-10 0V3Z" stroke={c} strokeWidth="1.5" />
          <path d="M6 5H3v2a2 2 0 0 0 2 2M16 5h3v2a2 2 0 0 1-2 2" stroke={c} strokeWidth="1.5" />
          <path d="M11 13v3M8 19h6" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'user':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="8" r="3.5" stroke={c} strokeWidth="1.5" />
          <path d="M4 19c1-3.5 4-5 7-5s6 1.5 7 5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}
