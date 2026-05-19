'use client';

// Circular initials avatar — visual stub until real auth.
// Template lifted from the home-page nav avatar so it reads consistently
// across the marketing surface and the playbook chrome.

import { STUB_USER } from '@/lib/playbook/teams';

interface UserAvatarProps {
  size?: number;
  className?: string;
}

export function UserAvatar({ size = 32, className = '' }: UserAvatarProps) {
  // Once auth lands, swap STUB_USER for a useSession-style hook.
  const user = STUB_USER;
  return (
    <button
      type="button"
      aria-label={`Account — ${user.name}`}
      title={user.name}
      className={[
        'inline-flex items-center justify-center rounded-full bg-ink text-bg font-bold cursor-pointer',
        'hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      ].join(' ')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {user.initials}
    </button>
  );
}
