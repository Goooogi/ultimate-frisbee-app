'use client';

// Admin feedback inbox list — one card per submission with triage controls.
// New items lead (server-ordered). Status changes + delete go through server
// actions (admin-guarded); useTransition keeps the row responsive while the
// action + revalidate round-trips.

import { useState, useTransition } from 'react';
import { setFeedbackStatus, deleteFeedback } from '@/app/admin/feedback/actions';
import type { FeedbackItem, FeedbackStatus } from '@/lib/feedback/server';

export function AdminFeedbackList({ items }: { items: FeedbackItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-[13px] text-muted font-tight py-8 text-center">
        No feedback yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <FeedbackRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function FeedbackRow({ item }: { item: FeedbackItem }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed.');
      }
    });
  }

  const when = new Date(item.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const who = item.submitterHandle
    ? `@${item.submitterHandle}`
    : item.submitterName ?? 'Unknown';

  return (
    <div
      className={[
        'bg-surface rounded-card-lg shadow-card p-5 transition-opacity',
        pending ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <StatusChip status={item.status} />
          {item.category && (
            <span className="text-[9px] font-bold tracking-[0.14em] uppercase font-tight text-accent bg-accent/10 rounded-full px-2 py-0.5">
              {item.category}
            </span>
          )}
          <span className="text-[11px] font-bold text-ink font-tight truncate">{who}</span>
          <span className="text-[10px] text-faint font-tight tabular">{when}</span>
        </div>
      </div>

      <p className="m-0 text-[14px] text-ink font-tight leading-relaxed whitespace-pre-wrap break-words">
        {item.message}
      </p>

      {item.pagePath && (
        <p className="mt-2 mb-0 text-[10.5px] text-faint font-mono truncate">
          from {item.pagePath}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.status !== 'read' && (
          <TriageButton disabled={pending} onClick={() => run(() => setFeedbackStatus(item.id, 'read'))}>
            Mark read
          </TriageButton>
        )}
        {item.status !== 'resolved' && (
          <TriageButton disabled={pending} onClick={() => run(() => setFeedbackStatus(item.id, 'resolved'))}>
            Resolve
          </TriageButton>
        )}
        {item.status !== 'new' && (
          <TriageButton disabled={pending} onClick={() => run(() => setFeedbackStatus(item.id, 'new'))}>
            Reopen
          </TriageButton>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm('Delete this feedback permanently?')) {
              run(() => deleteFeedback(item.id));
            }
          }}
          className={[
            'ml-auto px-3 py-1.5 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase font-tight cursor-pointer',
            'text-live hover:bg-live/10 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          Delete
        </button>
      </div>

      {error && <p className="mt-2 mb-0 text-[11px] text-live font-tight">{error}</p>}
    </div>
  );
}

function TriageButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'px-3 py-1.5 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase font-tight cursor-pointer',
        'bg-ink/5 text-muted hover:text-ink hover:bg-ink/10 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function StatusChip({ status }: { status: FeedbackStatus }) {
  const cls =
    status === 'new'
      ? 'bg-accent/10 text-accent'
      : status === 'resolved'
        ? 'bg-ink/5 text-faint'
        : 'bg-ink/5 text-muted';
  return (
    <span className={`text-[9px] font-bold tracking-[0.14em] uppercase font-tight rounded-full px-2 py-0.5 ${cls}`}>
      {status}
    </span>
  );
}
