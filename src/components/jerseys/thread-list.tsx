'use client';

// ThreadList — the inbox. Both sides of every conversation you're part of,
// newest activity first, with an unread dot.

import Link from 'next/link';
import { PosterByline } from '@/components/jerseys/poster-byline';
import type { JerseyThread } from '@/lib/jerseys/types';

export function ThreadList({ threads }: { threads: JerseyThread[] }) {
  if (threads.length === 0) {
    return (
      <div className="rounded-card-lg bg-surface shadow-card px-6 py-12 text-center flex flex-col items-center gap-2">
        <span className="font-display italic text-2xl font-bold text-ink">No messages yet</span>
        <span className="text-[13px] text-muted font-tight max-w-[320px]">
          When you message someone about a jersey — or they message you — the conversation shows up
          here.
        </span>
        <Link
          href="/jerseys"
          className="mt-2 inline-flex items-center px-5 min-h-[40px] rounded-full bg-ink text-bg text-[11.5px] font-bold tracking-[0.06em] uppercase font-tight hover:opacity-90"
        >
          Browse jerseys
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {threads.map((t) => (
        <li key={t.id}>
          <Link
            href={`/jerseys/messages/${t.id}`}
            className="flex items-center gap-3 p-3.5 rounded-card bg-surface shadow-card hover:shadow-lift motion-safe:transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t.unread ? (
              <span
                className="w-2 h-2 rounded-full bg-accent flex-shrink-0"
                aria-label="Unread"
              />
            ) : (
              <span className="w-2 h-2 flex-shrink-0" aria-hidden="true" />
            )}

            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <PosterByline poster={t.otherParty} size={26} />
              <span className="text-[11.5px] text-muted font-tight truncate">
                {t.iAmOwner ? 'About your listing: ' : 'About: '}
                {t.subject}
              </span>
            </div>

            {t.lastMessageAt && (
              <span className="text-[10.5px] text-faint font-tight tabular flex-shrink-0">
                {formatWhen(t.lastMessageAt)}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
