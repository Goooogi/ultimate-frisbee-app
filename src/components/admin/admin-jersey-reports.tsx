'use client';

// AdminJerseyReports — the jersey feature's only admin surface.
//
// Everything here arrived because a USER reported it. Listings are never queued
// for approval, so an empty list means the community is fine, not that you're
// behind on a queue.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  setJerseyReportStatus,
  withdrawReportedListing,
  withdrawReportedWant,
  deleteReportedListing,
} from '@/app/admin/content/jersey-actions';
import type { JerseyReportItem } from '@/lib/jerseys/reports-server';

export function AdminJerseyReports({ reports }: { reports: JerseyReportItem[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const visible = filter === 'open' ? reports.filter((r) => r.status === 'new') : reports;

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <FilterPill active={filter === 'open'} onClick={() => setFilter('open')}>
          Open ({reports.filter((r) => r.status === 'new').length})
        </FilterPill>
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
          All ({reports.length})
        </FilterPill>
      </div>

      {error && (
        <p className="text-[12.5px] text-accent font-tight rounded-card bg-surface shadow-card px-4 py-3" role="alert">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-card-lg bg-surface shadow-card px-6 py-10 text-center flex flex-col gap-1.5">
          <span className="font-display italic text-xl font-bold text-ink">
            {filter === 'open' ? 'Nothing reported' : 'No reports yet'}
          </span>
          <span className="text-[12.5px] text-muted font-tight">
            Jersey listings publish instantly — they only reach you if someone flags them.
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((r) => (
            <li key={r.id} className="flex flex-col gap-2.5 p-4 rounded-card bg-surface shadow-card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-accent/15 text-accent text-[9.5px] font-extrabold tracking-[0.08em] uppercase font-tight">
                      {r.reason}
                    </span>
                    <StatusChip status={r.status} />
                    <span className="text-[10.5px] text-faint font-tight tabular">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <span className="text-[13px] font-semibold text-ink font-tight">
                    {r.listing ? (
                      <Link href={`/jerseys/${r.listing.id}`} className="hover:text-accent underline underline-offset-2">
                        {r.listing.title}
                      </Link>
                    ) : r.want ? (
                      `Want: ${[r.want.teamName, r.want.playerName].filter(Boolean).join(' · ') || 'ISO post'}`
                    ) : (
                      'Message thread'
                    )}
                  </span>

                  <span className="text-[11.5px] text-muted font-tight">
                    Reported by {r.reporter?.displayName ?? r.reporter?.username ?? 'a member'}
                    {r.reportedUser && ` · about ${r.reportedUser.displayName ?? r.reportedUser.username}`}
                  </span>

                  {r.detail && (
                    <p className="text-[12px] text-muted font-tight mt-1 whitespace-pre-wrap">{r.detail}</p>
                  )}

                  {r.threadId && (
                    <p className="text-[11px] text-faint font-tight mt-1">
                      A reported thread can be read at{' '}
                      <code className="text-[10.5px]">jersey_thread_messages_for_admin</code> —
                      messages are private until reported.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1 border-t border-hairline/60">
                {r.status === 'new' && (
                  <ActionButton disabled={pending} onClick={() => run(() => setJerseyReportStatus(r.id, 'dismissed'))}>
                    Dismiss
                  </ActionButton>
                )}
                {r.listing && r.listing.status === 'active' && (
                  <ActionButton
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await withdrawReportedListing(r.listing!.id);
                        await setJerseyReportStatus(r.id, 'actioned');
                      })
                    }
                  >
                    Take listing down
                  </ActionButton>
                )}
                {r.want && (
                  <ActionButton
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await withdrawReportedWant(r.want!.id);
                        await setJerseyReportStatus(r.id, 'actioned');
                      })
                    }
                  >
                    Take want down
                  </ActionButton>
                )}
                {r.listing && (
                  <ActionButton
                    danger
                    disabled={pending}
                    onClick={() => {
                      if (!confirm('Delete this listing and its photos permanently?')) return;
                      run(async () => {
                        await deleteReportedListing(r.listing!.id);
                        await setJerseyReportStatus(r.id, 'actioned');
                      });
                    }}
                  >
                    Delete permanently
                  </ActionButton>
                )}
                {r.status !== 'new' && (
                  <ActionButton disabled={pending} onClick={() => run(() => setJerseyReportStatus(r.id, 'new'))}>
                    Reopen
                  </ActionButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: JerseyReportItem['status'] }) {
  const map: Record<string, string> = {
    new: 'bg-accent text-accent-ink',
    reviewed: 'bg-ink/10 text-muted',
    actioned: 'bg-ink text-bg',
    dismissed: 'bg-ink/5 text-faint',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-[3px] rounded-full text-[9px] font-extrabold tracking-[0.08em] uppercase font-tight ${map[status]}`}
    >
      {status}
    </span>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex items-center px-3.5 min-h-[34px] rounded-full',
        'text-[11px] font-bold tracking-[0.06em] uppercase font-tight cursor-pointer',
        active ? 'bg-ink text-bg' : 'bg-ink/5 text-muted hover:bg-ink/10',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ActionButton({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center px-3.5 min-h-[34px] rounded-full',
        'text-[11px] font-bold tracking-[0.06em] uppercase font-tight cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed motion-safe:transition-colors',
        danger ? 'bg-accent/15 text-accent hover:bg-accent/25' : 'bg-ink/5 text-ink hover:bg-ink/10',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
