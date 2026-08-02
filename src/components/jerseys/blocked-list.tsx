'use client';

// BlockedList — see and undo your blocks. A block you can't find is a block you
// can't reverse, so this exists even though most people will never open it.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { unblockUser } from '@/lib/jerseys/data';

export function BlockedList({
  blocked,
}: {
  blocked: { id: string; displayName: string | null; username: string | null; createdAt: string }[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unblock(id: string) {
    setBusyId(id);
    setError(null);
    const err = await unblockUser(id);
    setBusyId(null);
    if (err) setError(err);
    else router.refresh();
  }

  if (blocked.length === 0) {
    return (
      <div className="rounded-card-lg bg-surface shadow-card px-6 py-10 text-center flex flex-col gap-1.5">
        <span className="font-display italic text-xl font-bold text-ink">Nobody blocked</span>
        <span className="text-[12.5px] text-muted font-tight">
          You can block someone from their listing or from a conversation.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="text-[12.5px] text-accent font-tight" role="alert">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {blocked.map((b) => (
          <li
            key={b.id}
            className="flex items-center justify-between gap-3 p-3.5 rounded-card bg-surface shadow-card"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[13px] font-semibold text-ink font-tight truncate">
                {b.displayName || (b.username ? `@${b.username}` : 'Member')}
              </span>
              <span className="text-[10.5px] text-faint font-tight">
                Blocked {new Date(b.createdAt).toLocaleDateString()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => unblock(b.id)}
              disabled={busyId === b.id}
              className="inline-flex items-center px-4 min-h-[36px] rounded-full bg-ink/5 text-ink text-[11px] font-bold tracking-[0.06em] uppercase font-tight hover:bg-ink/10 cursor-pointer disabled:opacity-50 flex-shrink-0 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {busyId === b.id ? 'Unblocking…' : 'Unblock'}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-faint font-tight">
        Unblocking lets you both see each other&rsquo;s posts and message again.
      </p>
    </div>
  );
}
