'use client';

// AdminPlayerContentReports — the player-content gallery's report queue.
//
// Content publishes only after admin approval elsewhere in this portal; this
// tab handles the SECOND line of defense — approved content a user later
// flagged. An empty list means nothing's been reported, not that anything's
// wrong.

import { useState, useTransition } from 'react';
import { setPlayerContentReportStatus } from '@/app/admin/content/report-actions';
import { deleteContent } from '@/app/admin/content/actions';
import type { PlayerContentReportItem } from '@/lib/player-content/reports-server';

export function AdminPlayerContentReports({ reports }: { reports: PlayerContentReportItem[] }) {
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
            Approved content only reaches you here if someone flags it.
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((r) => (
            <li key={r.id} className="flex flex-col gap-2.5 p-4 rounded-card bg-surface shadow-card md:flex-row">
              {r.content && (
                <div className="w-full md:w-[160px] flex-shrink-0">
                  <ContentPreview content={r.content} />
                </div>
              )}

              <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusChip status={r.status} />
                      <span className="text-[10.5px] text-faint font-tight tabular">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {r.content ? (
                      <span className="text-[13px] font-semibold text-ink font-tight">
                        {r.content.playerDisplayName}
                        <span className="ml-1.5 text-[10px] font-bold tracking-[0.1em] uppercase text-faint">
                          {r.content.kind}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[13px] font-semibold text-faint font-tight italic">
                        Content already removed
                      </span>
                    )}

                    {r.content?.caption && (
                      <p className="text-[12px] text-muted font-tight">{r.content.caption}</p>
                    )}

                    {r.content?.externalUrl && <ExternalUrlLink url={r.content.externalUrl} />}

                    <span className="text-[11.5px] text-muted font-tight">
                      Reported by {r.reporter?.displayName ?? r.reporter?.username ?? 'a member'}
                    </span>

                    <p className="text-[12px] text-ink font-tight mt-1 whitespace-pre-wrap">{r.reason}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1 border-t border-hairline/60">
                  {r.status === 'new' ? (
                    <ActionButton
                      disabled={pending}
                      onClick={() => run(() => setPlayerContentReportStatus(r.id, 'resolved'))}
                    >
                      Mark resolved
                    </ActionButton>
                  ) : (
                    <ActionButton
                      disabled={pending}
                      onClick={() => run(() => setPlayerContentReportStatus(r.id, 'new'))}
                    >
                      Mark new
                    </ActionButton>
                  )}
                  {r.content && (
                    <ActionButton
                      danger
                      disabled={pending}
                      onClick={() => {
                        if (
                          !confirm(
                            'Delete this content permanently? It will be removed from the player profile for everyone.',
                          )
                        )
                          return;
                        // Reports cascade-delete with the content — no status
                        // update needed; the row simply leaves the queue.
                        run(async () => {
                          await deleteContent(r.content!.id);
                        });
                      }}
                    >
                      Delete content
                    </ActionButton>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * External URLs are user-submitted and only client-validated at insert time —
 * a crafted row could carry a javascript:/data:/tel: scheme. Only render as a
 * clickable link when the parsed protocol is http/https; otherwise show it as
 * inert text.
 */
function ExternalUrlLink({ url }: { url: string }) {
  let isSafe = false;
  try {
    const parsed = new URL(url);
    isSafe = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    isSafe = false;
  }
  if (!isSafe) {
    return <span className="text-[12px] text-faint font-tight truncate">{url}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[12px] text-accent hover:underline truncate font-tight"
    >
      {url}
    </a>
  );
}

function ContentPreview({ content }: { content: NonNullable<PlayerContentReportItem['content']> }) {
  if (content.kind === 'image' && content.publicUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={content.publicUrl}
        alt={content.caption ?? ''}
        className="w-full h-[120px] object-cover rounded-card-sm bg-black"
      />
    );
  }
  if (content.kind === 'video' && content.publicUrl) {
    return (
      <video
        src={content.publicUrl}
        controls
        playsInline
        className="w-full h-[120px] object-cover rounded-card-sm bg-black"
      />
    );
  }
  return (
    <div className="w-full h-[120px] rounded-card-sm bg-surface-hi flex items-center justify-center text-faint text-[11px] font-tight">
      No preview
    </div>
  );
}

function StatusChip({ status }: { status: PlayerContentReportItem['status'] }) {
  const map: Record<string, string> = {
    new: 'bg-accent text-accent-ink',
    resolved: 'bg-ink/10 text-muted',
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
