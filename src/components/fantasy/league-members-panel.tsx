'use client';

// League members + commissioner tools — client island. Extracted from
// league-home-client.tsx (P1, 2026-08-27) so the league-in-game page
// (/fantasy/ufa/l/[id]) can surface commissioner tools without leaving the
// game context, reusing the exact same RPCs/logic as the league umbrella
// instead of duplicating them. Handles:
//   (a) commissioner tools: email invite, remove member
//   (b) member self-serve: leave league
//   (c) signed-out / not-a-member: join CTA
//
// Resolves "am I a member, what's my role" itself — the caller only supplies
// the public member list + league id.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthModal } from '@/components/auth/auth-modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  getMyLeagueRole,
  createLeagueInvite,
  removeLeagueMember,
  leaveLeague,
  type LeagueMember,
  type LeagueRole,
} from '@/lib/fantasy/leagues';
import { sendLeagueInviteEmail, revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';

interface Props {
  leagueId: string;
  members: LeagueMember[];
  /** Called after leaving the league — where to send the member (leagues list
   *  from the umbrella, back to the game home from the game context). */
  onLeaveRedirect?: string;
}

export function LeagueMembersPanel({ leagueId, members, onLeaveRedirect = '/fantasy' }: Props) {
  const { user, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMyRole(null);
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    getMyLeagueRole(leagueId)
      .then(setMyRole)
      .catch(() => setMyRole(null))
      .finally(() => setRoleLoading(false));
  }, [user, leagueId]);

  const isCommissioner = myRole === 'commissioner';
  const isMember = myRole !== null;

  return (
    <div className="space-y-8">
      {/* ── Members ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="members-heading">
        <h2
          id="members-heading"
          className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-4"
        >
          Members
        </h2>
        <MembersList
          leagueId={leagueId}
          members={members}
          canManage={isCommissioner}
          currentUserId={user?.id ?? null}
        />
      </section>

      {/* ── Commissioner: Email invite ───────────────────────────────────── */}
      {!loading && !roleLoading && isCommissioner && <InvitePanel leagueId={leagueId} />}

      {/* ── Member self-serve: leave league ──────────────────────────────── */}
      {!loading && !roleLoading && isMember && !isCommissioner && (
        <LeaveLeagueSection leagueId={leagueId} redirectTo={onLeaveRedirect} />
      )}

      {/* ── Signed out / not a member: join CTA ──────────────────────────── */}
      {!loading && !roleLoading && !isMember && (
        <div className="bg-surface rounded-card-lg shadow-soft p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <p className="text-muted font-tight text-[13px] flex-1">
            {user
              ? "You're not a member of this league. Ask the commissioner for an invite link or join code."
              : 'Sign in to see if you belong to this league, or ask the commissioner for an invite.'}
          </p>
          {!user && (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className={[
                'inline-flex items-center justify-center gap-2 flex-shrink-0',
                'px-5 py-2.5 rounded-full min-h-[44px]',
                'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.1em] uppercase',
                'hover:opacity-90 transition-opacity duration-150 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              ].join(' ')}
            >
              Sign in
            </button>
          )}
        </div>
      )}

      <AuthModal
        open={authOpen}
        dismissible
        initialMode="signin"
        onDismiss={() => setAuthOpen(false)}
        headline="Sign in"
      />
    </div>
  );
}

// ─── Members list ─────────────────────────────────────────────────────────────

function MembersList({
  leagueId,
  members,
  canManage,
  currentUserId,
}: {
  leagueId: string;
  members: LeagueMember[];
  canManage: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [localMembers, setLocalMembers] = useState(members);
  const [removeTarget, setRemoveTarget] = useState<LeagueMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeLeagueMember(leagueId, removeTarget.userId);
      setLocalMembers((prev) => prev.filter((m) => m.userId !== removeTarget.userId));
      setRemoveTarget(null);
      await revalidateFantasyLeague(leagueId).catch(() => null);
      router.refresh();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not remove this member.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
        <ul aria-label="League members">
          {localMembers.map((m, idx) => (
            <li
              key={m.userId}
              className={[
                'flex items-center gap-3 px-5 py-3.5',
                idx > 0 ? 'border-t border-hairline' : '',
              ].join(' ')}
            >
              <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span className="font-tight text-[14px] font-semibold text-ink truncate">
                  {m.displayName ?? m.username ?? 'Member'}
                  {m.userId === currentUserId && (
                    <span className="text-muted font-normal"> (you)</span>
                  )}
                </span>
                {m.username && (
                  <span className="font-tight text-[11px] text-muted truncate">@{m.username}</span>
                )}
              </span>
              {m.role === 'commissioner' && (
                <span className="flex-shrink-0 text-[9.5px] font-bold tracking-[0.1em] uppercase px-2.5 py-[5px] rounded-full bg-accent/10 text-accent">
                  Commissioner
                </span>
              )}
              {canManage && m.role !== 'commissioner' && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveError(null);
                    setRemoveTarget(m);
                  }}
                  aria-label={`Remove ${m.displayName ?? m.username ?? 'member'}`}
                  className={[
                    'flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full',
                    'text-faint hover:text-live hover:bg-live/10',
                    'transition-colors duration-150 cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  ].join(' ')}
                >
                  <XGlyph />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove member?"
        body={
          removeTarget
            ? `${removeTarget.displayName ?? removeTarget.username ?? 'This member'} will lose access to this league and its contests.`
            : undefined
        }
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={removing}
        error={removeError}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}

function XGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ─── Invite panel (commissioner) ──────────────────────────────────────────────

function InvitePanel({ leagueId }: { leagueId: string }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setSendResult(null);
    try {
      const { token } = await createLeagueInvite(leagueId, trimmed);
      await sendLeagueInviteEmail({ leagueId, email: trimmed, token });
      setSendResult({ ok: true, message: `Invite sent to ${trimmed}.` });
      setEmail('');
    } catch (err) {
      setSendResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Could not send the invite.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="invite-heading" className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6">
      <h2
        id="invite-heading"
        className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-4"
      >
        Invite friends
      </h2>

      <div className="space-y-5">
        {/* Email invite */}
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5">
            Invite by email
          </div>
          <form onSubmit={handleSendInvite} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSendResult(null);
              }}
              placeholder="friend@example.com"
              className={[
                'flex-1 min-w-0 px-3.5 py-2.5 rounded-card-sm bg-ink/5',
                'font-tight text-[14px] text-ink placeholder:text-faint',
                'focus:outline-none focus:ring-2 focus:ring-accent',
                'min-h-[44px]',
              ].join(' ')}
            />
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className={[
                'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full min-h-[44px] flex-shrink-0',
                'font-tight text-[12px] font-bold tracking-[0.06em] uppercase transition-colors duration-150',
                sending || !email.trim()
                  ? 'bg-ink/[0.08] text-faint cursor-not-allowed'
                  : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              {sending ? 'Sending…' : 'Send invite'}
            </button>
          </form>
          {sendResult && (
            <p
              role={sendResult.ok ? 'status' : 'alert'}
              className={`mt-2 text-[12px] font-tight ${sendResult.ok ? 'text-ink' : 'text-live'}`}
            >
              {sendResult.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Leave league (member self-serve) ─────────────────────────────────────────

function LeaveLeagueSection({ leagueId, redirectTo }: { leagueId: string; redirectTo: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLeave = async () => {
    setLeaving(true);
    setError(null);
    try {
      await leaveLeague(leagueId);
      await revalidateFantasyLeague(leagueId).catch(() => null);
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave this league.');
      setLeaving(false);
    }
  };

  return (
    <section className="bg-surface rounded-card-lg shadow-soft p-5 lg:p-6 flex items-center justify-between gap-4">
      <p className="text-muted font-tight text-[13px]">You&apos;re a member of this league.</p>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={[
          'flex-shrink-0 inline-flex items-center justify-center px-4 py-2.5 rounded-full min-h-[44px]',
          'text-live hover:bg-live/10 transition-colors duration-150 cursor-pointer',
          'font-tight text-[11px] font-bold tracking-[0.08em] uppercase',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        Leave league
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Leave this league?"
        body="You'll lose access to its contests and standings. The commissioner can re-invite you later."
        confirmLabel="Leave"
        busyLabel="Leaving…"
        busy={leaving}
        error={error}
        onConfirm={handleLeave}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
