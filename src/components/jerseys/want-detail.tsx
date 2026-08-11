'use client';

// WantDetail — one "ISO" post, full size. Mirrors JerseyDetail's action set
// (message / report / block for a visitor, status + delete for the poster) but
// without a gallery: a want has nothing to photograph.
//
// The contact button opens a want-scoped thread — same openThread() the listing
// side uses, just keyed on want_id. We never reveal contact details.

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PosterByline } from '@/components/jerseys/poster-byline';
import { ReportButton } from '@/components/jerseys/report-button';
import { BlockButton } from '@/components/jerseys/block-button';
import { AuthModal } from '@/components/auth/auth-modal';
import { openThread } from '@/lib/jerseys/messages';
import { setWantStatus, deleteWant } from '@/lib/jerseys/data';
import { jerseyLocationLine, jerseyTargetLine, type JerseyWant } from '@/lib/jerseys/types';

export function WantDetail({
  want,
  viewerId,
  posterBlocked = false,
}: {
  want: JerseyWant;
  viewerId: string | null;
  /** True when the viewer has blocked whoever posted this want. */
  posterBlocked?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const isOwner = viewerId != null && viewerId === want.userId;
  const where = jerseyLocationLine(want);
  const target = jerseyTargetLine(want) ?? want.leagueName ?? 'Any jersey';

  const handleMessage = useCallback(async () => {
    if (!viewerId) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err, threadId } = await openThread({
      wantId: want.id,
      ownerId: want.userId,
    });
    setBusy(false);
    if (err || !threadId) {
      setError(err ?? 'Could not start that conversation.');
      return;
    }
    router.push(`/jerseys/messages/${threadId}`);
  }, [viewerId, want.id, want.userId, router]);

  const handleStatus = useCallback(
    async (status: 'completed' | 'withdrawn' | 'active') => {
      setBusy(true);
      const err = await setWantStatus(want.id, status);
      setBusy(false);
      if (err) setError(err);
      else router.refresh();
    },
    [want.id, router],
  );

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this wanted post? This cannot be undone.')) return;
    setBusy(true);
    const err = await deleteWant(want.id);
    setBusy(false);
    if (err) setError(err);
    else router.push('/jerseys');
  }, [want.id, router]);

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-accent text-accent-ink text-[9.5px] font-extrabold tracking-[0.1em] uppercase font-tight">
          Looking for
        </span>
        {want.status !== 'active' && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-ink text-bg text-[9.5px] font-extrabold tracking-[0.1em] uppercase font-tight">
            {want.status === 'completed' ? 'Found' : 'Withdrawn'}
          </span>
        )}
      </div>

      <h1 className="font-display italic text-3xl sm:text-4xl font-bold text-ink leading-[1.02] tracking-[-0.02em]">
        {target}
      </h1>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Detail label="Team" value={want.teamName} />
        <Detail label="Player" value={want.playerName} />
        <Detail label="Year" value={want.year ? String(want.year) : null} />
        <Detail label="League" value={want.leagueName} />
        <Detail label="Size" value={want.size} />
        <Detail label="Location" value={where} />
      </dl>

      {want.note && (
        <p className="text-[13.5px] text-muted font-tight leading-relaxed whitespace-pre-wrap">
          {want.note}
        </p>
      )}

      {want.events.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight">
            Will be at
          </span>
          <div className="flex flex-wrap gap-1.5">
            {want.events.map((e) =>
              e.usauEventSlug ? (
                <Link
                  key={e.id}
                  href={`/usau/events/${e.usauEventSlug}`}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-ink/5 text-ink text-[11px] font-semibold font-tight hover:bg-ink/10 motion-safe:transition-colors"
                >
                  {e.name}
                </Link>
              ) : (
                <span
                  key={e.id}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-ink/5 text-muted text-[11px] font-semibold font-tight"
                >
                  {e.name}
                </span>
              ),
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <PosterByline poster={want.user} size={32} subtitle={where} />
      </div>

      {error && (
        <p className="text-[12px] text-accent font-tight" role="alert">
          {error}
        </p>
      )}

      {isOwner ? (
        <div className="flex flex-wrap gap-2">
          {want.status === 'active' ? (
            <>
              <SecondaryAction disabled={busy} onClick={() => handleStatus('completed')}>
                Mark as found
              </SecondaryAction>
              <SecondaryAction disabled={busy} onClick={() => handleStatus('withdrawn')}>
                Withdraw
              </SecondaryAction>
            </>
          ) : (
            <SecondaryAction disabled={busy} onClick={() => handleStatus('active')}>
              Repost
            </SecondaryAction>
          )}
          <SecondaryAction disabled={busy} onClick={handleDelete}>
            Delete
          </SecondaryAction>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleMessage}
            disabled={busy || want.status !== 'active'}
            className={[
              'inline-flex items-center gap-2 px-6 min-h-[48px] rounded-full',
              'text-[12.5px] font-bold tracking-[0.08em] uppercase font-tight',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              want.status === 'active' && !busy
                ? 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer'
                : 'bg-surface text-faint cursor-not-allowed',
            ].join(' ')}
          >
            {busy ? 'Opening…' : viewerId ? 'I have this' : 'Sign in to message'}
          </button>
          <ReportButton wantId={want.id} reportedUserId={want.userId} signedIn={Boolean(viewerId)} />
          <BlockButton
            userId={want.userId}
            displayName={want.user?.displayName ?? null}
            initiallyBlocked={posterBlocked}
            signedIn={Boolean(viewerId)}
          />
        </div>
      )}

      <AuthModal
        open={authOpen}
        dismissible
        initialMode="signin"
        onDismiss={() => setAuthOpen(false)}
      />

      {!isOwner && want.status === 'active' && (
        <p className="text-[11.5px] text-faint font-tight leading-snug rounded-card bg-surface shadow-card px-3.5 py-3">
          The Layout doesn&rsquo;t handle payment or shipping — you arrange the swap directly. Meet
          somewhere public, ideally at a tournament you&rsquo;re both attending.
        </p>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[9.5px] font-bold tracking-[0.12em] uppercase text-faint font-tight">
        {label}
      </dt>
      <dd className="text-[13px] font-semibold text-ink font-tight">{value}</dd>
    </div>
  );
}

function SecondaryAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center px-5 min-h-[44px] rounded-full bg-ink/5 text-ink text-[12px] font-bold tracking-[0.06em] uppercase font-tight hover:bg-ink/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}
