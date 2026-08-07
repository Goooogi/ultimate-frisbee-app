'use client';

// PosterByline — "who posted this", used on listing cards, detail pages, and
// message threads. Avatar (team logo / flag icon, else initials) + name.
//
// PRIVACY: renders ONLY public identity — display name, @handle, avatar. Never
// email or phone. The server reads deliberately don't select those columns.

import { AvatarIconView } from '@/components/profile/avatar-icon-view';
import type { JerseyPoster } from '@/lib/jerseys/types';

function initials(p: JerseyPoster): string {
  const source = p.displayName || p.username || '?';
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function PosterByline({
  poster,
  size = 24,
  subtitle,
  className = '',
}: {
  poster: JerseyPoster | null;
  size?: number;
  /** Optional second line — location, timestamp, etc. */
  subtitle?: string | null;
  className?: string;
}) {
  if (!poster) {
    return <span className={`text-[11.5px] text-faint font-tight ${className}`}>Unknown poster</span>;
  }

  const name = poster.displayName || (poster.username ? `@${poster.username}` : 'Member');

  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      <span
        className="relative flex-shrink-0 rounded-full overflow-hidden bg-ink/8 grid place-items-center"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {poster.avatarIcon ? (
          <AvatarIconView icon={poster.avatarIcon} size={size} />
        ) : poster.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster.avatarUrl} alt="" width={size} height={size} className="object-cover w-full h-full" />
        ) : (
          <span className="text-[9px] font-extrabold text-muted font-tight">{initials(poster)}</span>
        )}
      </span>
      <span className="flex flex-col min-w-0 leading-tight">
        <span className="text-[12px] font-semibold text-ink font-tight truncate">{name}</span>
        {subtitle && (
          <span className="text-[10.5px] text-faint font-tight truncate">{subtitle}</span>
        )}
      </span>
    </span>
  );
}
