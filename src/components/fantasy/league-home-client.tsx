'use client';

// League home — client island. Handles:
//   (a) commissioner tools: invite panel (join code + copy, email invite,
//       regenerate code), remove member
//   (b) member self-serve: leave league
//   (c) commissioner-only "New contest" section
//
// The server page already rendered the public league/member/contest data —
// this component re-resolves "am I a member, what's my role" client-side and
// layers interactive controls on top without re-fetching the public lists.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthModal } from '@/components/auth/auth-modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PillSelect } from '@/components/pill-select';
import {
  getMyLeagueRole,
  getLeagueCode,
  regenerateLeagueCode,
  createLeagueInvite,
  removeLeagueMember,
  leaveLeague,
  createContest,
  type FantasyLeagueSummary,
  type LeagueMember,
  type ContestView,
  type LeagueRole,
} from '@/lib/fantasy/leagues';
import { sendLeagueInviteEmail, revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import { selectableCompetitions, type CompetitionId } from '@/lib/fantasy/competitions';

interface Props {
  league: FantasyLeagueSummary;
  members: LeagueMember[];
  contests: ContestView[];
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

export function LeagueHomeClient({ league, members, contests }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
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
    getMyLeagueRole(league.id)
      .then(setMyRole)
      .catch(() => setMyRole(null))
      .finally(() => setRoleLoading(false));
  }, [user, league.id]);

  const isCommissioner = myRole === 'commissioner';
  const isMember = myRole !== null;

  return (
    <div className="space-y-8">
      {/* ── Contests ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="contests-heading">
        <div className="flex items-end justify-between gap-4 mb-4">
          <h2
            id="contests-heading"
            className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink"
          >
            Contests
          </h2>
        </div>

        {contests.length === 0 ? (
          <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
            <p className="text-muted font-tight text-[14px]">
              No contests yet. {isCommissioner ? 'Add one below to get started.' : 'Ask your commissioner to add one.'}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
            <ul aria-label="League contests">
              {contests.map((c, idx) => (
                <li key={c.id}>
                  <Link
                    href={`/fantasy/contests/${c.id}`}
                    className={[
                      'flex items-center gap-3 px-5 py-3.5',
                      'no-underline transition-colors duration-150',
                      'hover:bg-surface-hi',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                      idx > 0 ? 'border-t border-hairline' : '',
                    ].join(' ')}
                  >
                    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <span className="font-tight text-[14px] font-semibold text-ink truncate">
                        {c.name}
                      </span>
                      <span className="font-tight text-[11px] text-muted">
                        {c.competitionDef.shortLabel} · {c.seasonYear}
                      </span>
                    </span>
                    <StatusChip status={c.status} />
                    <ArrowGlyph />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Members ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="members-heading">
        <h2
          id="members-heading"
          className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-4"
        >
          Members
        </h2>
        <MembersList
          leagueId={league.id}
          members={members}
          canManage={isCommissioner}
          currentUserId={user?.id ?? null}
        />
      </section>

      {/* ── Commissioner: New contest ────────────────────────────────────── */}
      {!loading && !roleLoading && isCommissioner && (
        <NewContestSection leagueId={league.id} existingContests={contests} />
      )}

      {/* ── Commissioner: Invite panel ───────────────────────────────────── */}
      {!loading && !roleLoading && isCommissioner && (
        <InvitePanel leagueId={league.id} />
      )}

      {/* ── Member self-serve: leave league ──────────────────────────────── */}
      {!loading && !roleLoading && isMember && !isCommissioner && (
        <LeaveLeagueSection leagueId={league.id} />
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

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: ContestView['status'] }) {
  const tone =
    status === 'active'
      ? 'bg-accent text-accent-ink'
      : status === 'complete'
      ? 'bg-ink/5 text-ink/80'
      : 'bg-accent/10 text-accent';
  const label = status === 'active' ? 'Live' : status === 'complete' ? 'Final' : 'Open';
  return (
    <span className={`flex-shrink-0 text-[9.5px] font-bold tracking-[0.1em] uppercase px-2.5 py-[5px] rounded-full ${tone}`}>
      {label}
    </span>
  );
}

function ArrowGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="flex-shrink-0 text-faint">
      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  const [code, setCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    getLeagueCode(leagueId)
      .then(setCode)
      .catch(() => setCode(null))
      .finally(() => setCodeLoading(false));
  }, [leagueId]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const joinLink = code ? `${origin}/fantasy/join/${code}` : '';

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can fail in insecure contexts — non-fatal, no banner needed.
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setRegenError(null);
    try {
      const next = await regenerateLeagueCode(leagueId);
      setCode(next);
      setRegenOpen(false);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Could not regenerate the code.');
    } finally {
      setRegenerating(false);
    }
  };

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
        {/* Join code + link */}
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5">
            Join code
          </div>
          {codeLoading ? (
            <div className="h-11 w-40 rounded-card-sm bg-ink/[0.06] animate-pulse" />
          ) : code ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <code className="px-3.5 py-2.5 rounded-card-sm bg-ink/5 font-tight text-[15px] font-bold tracking-[0.1em] text-ink">
                  {code}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(joinLink)}
                  className={[
                    'flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-full min-h-[44px]',
                    'bg-ink/5 text-ink hover:bg-ink/10 transition-colors duration-150 cursor-pointer',
                    'font-tight text-[12px] font-bold tracking-[0.06em] uppercase truncate',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  ].join(' ')}
                >
                  <CopyGlyph />
                  {copied ? 'Copied!' : 'Copy join link'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setRegenOpen(true)}
                className={[
                  'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full min-h-[44px] flex-shrink-0',
                  'text-muted hover:text-ink hover:bg-ink/5 transition-colors duration-150 cursor-pointer',
                  'font-tight text-[11px] font-bold tracking-[0.06em] uppercase',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                ].join(' ')}
              >
                Regenerate
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-muted font-tight">Could not load the join code.</p>
          )}
          <p className="mt-1.5 text-[11px] text-faint font-tight">
            Anyone with this link can join the league.
          </p>
        </div>

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

      <ConfirmDialog
        open={regenOpen}
        title="Regenerate join code?"
        body="The old code and link will stop working immediately. Anyone you've already shared it with won't be able to join with it."
        confirmLabel="Regenerate"
        busyLabel="Regenerating…"
        busy={regenerating}
        error={regenError}
        onConfirm={handleRegenerate}
        onCancel={() => setRegenOpen(false)}
      />
    </section>
  );
}

function CopyGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="flex-shrink-0">
      <rect x="5" y="5" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 9V3a1 1 0 011-1h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ─── Leave league (member self-serve) ─────────────────────────────────────────

function LeaveLeagueSection({ leagueId }: { leagueId: string }) {
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
      router.push('/fantasy');
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

// ─── New contest (commissioner) ────────────────────────────────────────────────

function NewContestSection({
  leagueId,
  existingContests,
}: {
  leagueId: string;
  existingContests: ContestView[];
}) {
  const router = useRouter();
  const competitions = selectableCompetitions();
  const [competition, setCompetition] = useState<CompetitionId>(competitions[0]?.id ?? 'ufa');
  const [seasonYear, setSeasonYear] = useState<number>(CURRENT_YEAR);
  const [customName, setCustomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const def = competitions.find((c) => c.id === competition);
  const alreadyExists = existingContests.some(
    (c) => c.competition === competition && c.seasonYear === seasonYear,
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (alreadyExists) return;
    setCreating(true);
    setError(null);
    try {
      const contestId = await createContest(leagueId, competition, seasonYear, customName.trim() || undefined);
      await revalidateFantasyLeague(leagueId, contestId).catch(() => null);
      router.push(`/fantasy/contests/${contestId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the contest.');
      setCreating(false);
    }
  };

  return (
    <section aria-labelledby="new-contest-heading" className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6">
      <h2
        id="new-contest-heading"
        className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-4"
      >
        New contest
      </h2>

      <form onSubmit={handleCreate} className="space-y-4 max-w-[480px]">
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5">
            Competition
          </div>
          <PillSelect
            value={competition}
            onChange={(v) => setCompetition(v)}
            ariaLabel="Select a competition"
            options={competitions.map((c) => ({ value: c.id, label: c.label }))}
          />
        </div>

        <div>
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5">
            Season
          </div>
          <PillSelect
            value={seasonYear}
            onChange={(v) => setSeasonYear(v)}
            ariaLabel="Select a season year"
            options={YEAR_OPTIONS.map((y) => ({ value: y, label: String(y) }))}
          />
        </div>

        <div>
          <label
            htmlFor="contest-name"
            className="block text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5"
          >
            Contest name <span className="normal-case font-medium text-faint/80">· optional</span>
          </label>
          <input
            id="contest-name"
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            maxLength={60}
            placeholder={def ? `${def.label} ${seasonYear}` : ''}
            className={[
              'w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5',
              'font-tight text-[14px] text-ink placeholder:text-faint',
              'focus:outline-none focus:ring-2 focus:ring-accent',
              'min-h-[44px]',
            ].join(' ')}
          />
        </div>

        {alreadyExists && (
          <p className="text-[12px] text-faint font-tight">
            This league already has a {def?.label} {seasonYear} contest.
          </p>
        )}
        {error && (
          <div className="px-4 py-3 rounded-card-sm bg-live/[0.08]">
            <span className="font-tight text-[13px] text-ink">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={creating || alreadyExists}
          className={[
            'inline-flex items-center justify-center gap-2',
            'px-6 py-3 rounded-full min-h-[44px] w-full sm:w-auto',
            'font-tight text-[13px] font-bold tracking-[0.06em] uppercase',
            'transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            creating || alreadyExists
              ? 'bg-ink/[0.08] text-faint cursor-not-allowed'
              : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
          ].join(' ')}
        >
          {creating && (
            <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" aria-hidden="true" />
          )}
          {creating ? 'Creating…' : 'Create contest'}
        </button>
      </form>
    </section>
  );
}
