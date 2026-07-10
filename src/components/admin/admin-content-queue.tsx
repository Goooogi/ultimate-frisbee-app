'use client';

// Two-pane admin moderation queue.
// Pending pane: items awaiting review with preview + Approve / Reject / Delete.
// Recent pane: most recently approved/rejected items for quick reversal.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { approveContent, deleteContent, rejectContent } from '@/app/admin/content/actions';
import type { PlayerContentItem } from '@/lib/player-content/types';

interface Props {
  pending: PlayerContentItem[];
  recent: PlayerContentItem[];
}

export function AdminContentQueue({ pending, recent }: Props) {
  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="pending-heading">
        <h2
          id="pending-heading"
          className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-4"
        >
          Pending review
        </h2>
        {pending.length === 0 ? (
          <p className="text-[13px] text-faint font-tight px-5 py-6 rounded-card bg-surface shadow-card">
            Nothing pending. Inbox zero.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map((item) => (
              <ReviewRow key={item.id} item={item} mode="pending" />
            ))}
          </div>
        )}
      </section>

      <section id="recent" aria-labelledby="recent-heading">
        <h2
          id="recent-heading"
          className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-4"
        >
          Recently reviewed
        </h2>
        {recent.length === 0 ? (
          <p className="text-[13px] text-faint font-tight px-5 py-6 rounded-card bg-surface shadow-card">
            No review history yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {recent.map((item) => (
              <ReviewRow key={item.id} item={item} mode="recent" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewRow({ item, mode }: { item: PlayerContentItem; mode: 'pending' | 'recent' }) {
  const [isPending, startTransition] = useTransition();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
      }
    });
  }

  const playerHref = `/players/${item.player_ref}`;

  return (
    <article className="flex flex-col md:flex-row gap-4 p-4 rounded-card bg-surface shadow-card">
      <div className="w-full md:w-[220px] flex-shrink-0">
        <Preview item={item} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={playerHref}
            className="text-[14px] font-bold font-tight text-ink hover:text-accent transition-colors"
          >
            {item.player_display_name}
          </Link>
          <KindChip kind={item.kind} />
          <StatusChip status={item.status} />
          <span className="text-[11px] text-faint font-tight uppercase tracking-[0.12em]">
            {item.player_kind}
          </span>
        </div>
        <p className="text-[11px] text-faint font-tight">
          Submitted {formatRelative(item.created_at)}
          {item.reviewed_at && ` · Reviewed ${formatRelative(item.reviewed_at)}`}
          {item.file_size_bytes && ` · ${(item.file_size_bytes / 1024 / 1024).toFixed(1)} MB`}
        </p>
        {item.caption && (
          <p className="text-[13px] text-ink font-tight">{item.caption}</p>
        )}
        {item.external_url && (
          <a
            href={item.external_url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[12px] text-accent hover:underline truncate font-tight"
          >
            {item.external_url}
          </a>
        )}
        {item.rejection_reason && (
          <p className="text-[12px] text-red-500 font-tight">
            Rejected: {item.rejection_reason}
          </p>
        )}

        {error && (
          <p role="alert" className="text-[12px] text-red-500 font-tight">
            {error}
          </p>
        )}

        {mode === 'pending' && !showRejectForm && (
          <div className="flex flex-wrap gap-2 pt-1">
            <ActionButton
              variant="primary"
              disabled={isPending}
              onClick={() => run(() => approveContent(item.id))}
            >
              Approve
            </ActionButton>
            <ActionButton
              variant="muted"
              disabled={isPending}
              onClick={() => setShowRejectForm(true)}
            >
              Reject…
            </ActionButton>
            <ActionButton
              variant="danger"
              disabled={isPending}
              onClick={() => {
                if (confirm('Permanently delete this submission?')) {
                  run(() => deleteContent(item.id));
                }
              }}
            >
              Delete
            </ActionButton>
          </div>
        )}

        {mode === 'pending' && showRejectForm && (
          <div className="flex flex-col gap-2 pt-1">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 1000))}
              maxLength={1000}
              placeholder="Reason (visible to uploader if you ever surface it)"
              className="w-full px-3.5 py-2 rounded-card-sm bg-ink/5 text-ink font-tight text-[13px] focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex gap-2">
              <ActionButton
                variant="danger"
                disabled={isPending}
                onClick={() => run(() => rejectContent(item.id, reason))}
              >
                Confirm reject
              </ActionButton>
              <ActionButton
                variant="muted"
                disabled={isPending}
                onClick={() => {
                  setShowRejectForm(false);
                  setReason('');
                }}
              >
                Cancel
              </ActionButton>
            </div>
          </div>
        )}

        {mode === 'recent' && (
          <div className="flex flex-wrap gap-2 pt-1">
            {item.status === 'rejected' && (
              <ActionButton
                variant="primary"
                disabled={isPending}
                onClick={() => run(() => approveContent(item.id))}
              >
                Approve instead
              </ActionButton>
            )}
            {item.status === 'approved' && (
              <ActionButton
                variant="muted"
                disabled={isPending}
                onClick={() => run(() => rejectContent(item.id, 'Reverted'))}
              >
                Hide (reject)
              </ActionButton>
            )}
            <ActionButton
              variant="danger"
              disabled={isPending}
              onClick={() => {
                if (confirm('Permanently delete this submission?')) {
                  run(() => deleteContent(item.id));
                }
              }}
            >
              Delete
            </ActionButton>
          </div>
        )}
      </div>
    </article>
  );
}

function Preview({ item }: { item: PlayerContentItem }) {
  if (item.kind === 'image' && item.publicUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={item.publicUrl}
        alt={item.caption ?? ''}
        className="w-full h-[160px] object-cover rounded-card-sm bg-black"
      />
    );
  }
  if (item.kind === 'video' && item.publicUrl) {
    return (
      <video
        src={item.publicUrl}
        controls
        playsInline
        className="w-full h-[160px] object-cover rounded-card-sm bg-black"
      />
    );
  }
  if (item.kind === 'video_link' && item.embedUrl) {
    return (
      <div className="w-full h-[160px] rounded-card-sm overflow-hidden bg-black">
        <iframe
          src={item.embedUrl}
          title={item.caption ?? 'Video'}
          className="w-full h-full"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <div className="w-full h-[160px] rounded-card-sm bg-surface-hi flex items-center justify-center text-faint text-[11px] font-tight">
      No preview
    </div>
  );
}

function KindChip({ kind }: { kind: PlayerContentItem['kind'] }) {
  const label = kind === 'video_link' ? 'Link' : kind === 'video' ? 'Video' : 'Image';
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-ink/5 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted">
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: PlayerContentItem['status'] }) {
  const tone =
    status === 'approved'
      ? 'bg-green-500/15 text-green-600'
      : status === 'rejected'
      ? 'bg-red-500/15 text-red-600'
      : 'bg-amber-500/15 text-amber-600';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-[0.14em] uppercase font-tight ${tone}`}
    >
      {status}
    </span>
  );
}

function ActionButton({
  variant,
  disabled,
  onClick,
  children,
}: {
  variant: 'primary' | 'muted' | 'danger';
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls =
    variant === 'primary'
      ? 'bg-ink text-bg hover:opacity-90'
      : variant === 'danger'
      ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
      : 'bg-ink/5 text-muted hover:text-ink hover:bg-ink/10';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold tracking-[0.16em] uppercase font-tight transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
