'use client';

// Delete-account settings — the "danger zone" card + confirm modal.
//
// Deletion itself is done SERVER-SIDE by the `delete-account` Supabase Edge
// Function (it needs the service-role key to remove the auth user). This
// component only: (1) collects a password re-auth in a confirm modal, (2)
// invokes the function with the user's own access token, (3) on success signs
// out and sends the user home. Full data cascade (profile, favorites, fantasy
// team, playbook, uploads) is handled by the function + DB ON DELETE CASCADEs.
//
// The function's documented responses drive the UI copy:
//   200 { deleted: true }
//   401 { error: 'reauth_failed' | 'unauthenticated' }
//   400 { error: 'password_required' }
//   409 { error: 'ownership_transfer_required', teams: [{id,name}] }
//   409 { error: 'fantasy_transfer_required', leagues: [{id,name}] }
//   429 { error: 'rate_limited' }
//
// Fantasy league ownership is a second, independent pre-condition: before
// even showing the password step, we ask the DB (fantasy_leagues_blocking_
// account_deletion) whether the user owns a league with other members —
// deleting the account would otherwise wipe that league for everyone via
// cascade. The 409 above is a server-side backstop for the same rule, in
// case a league changed between our check and the actual delete call.

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-provider';
import { PillSelect, type PillSelectOption } from '@/components/pill-select';
import {
  getLeaguesBlockingAccountDeletion,
  getLeagueMembers,
  transferLeagueOwnership,
  type BlockingLeague,
  type LeagueMember,
} from '@/lib/fantasy/leagues';

type Phase = 'idle' | 'submitting' | 'error';
type PreflightPhase = 'checking' | 'ready' | 'error';

interface OwnedTeam {
  id: string;
  name: string;
}

/** Imperative surface the modal uses to coordinate Esc handling across cards
 *  it doesn't otherwise control the internals of. */
interface LeagueTransferCardHandle {
  confirming: boolean;
  transferring: boolean;
  cancelConfirm: () => void;
}

export function DeleteAccountSettings() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden ring-1 ring-inset ring-live/15">
      <div className="px-5 py-4 border-b border-hairline">
        <h2 className="m-0 font-tight text-[11px] font-bold tracking-[0.18em] uppercase text-live">
          Danger zone
        </h2>
        <p className="mt-1 text-[12px] text-faint font-tight leading-snug">
          Permanently delete your account and all associated data — your profile,
          favorites, fantasy team, and any playbooks you solely own. This cannot be
          undone.
        </p>
      </div>

      <div className="px-5 py-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={[
            'inline-flex items-center justify-center px-4 py-2.5 rounded-card-sm cursor-pointer',
            'text-[12px] font-bold tracking-[0.08em] uppercase font-tight',
            'bg-live/[0.08] text-live ring-1 ring-inset ring-live/25',
            'hover:bg-live/[0.14] transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live',
          ].join(' ')}
        >
          Delete account
        </button>
      </div>

      {open && <ConfirmDeleteModal onClose={() => setOpen(false)} />}
    </div>
  );
}

// ─── Confirm modal ──────────────────────────────────────────────────────────

function ConfirmDeleteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [blockedTeams, setBlockedTeams] = useState<OwnedTeam[] | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  // Fantasy-league ownership pre-flight — runs once on open, and again (via
  // runPreflight) if the delete call itself comes back 409 fantasy_transfer_
  // required. `ready` + an empty list means nothing blocks deletion.
  const [preflight, setPreflight] = useState<PreflightPhase>('checking');
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [blockingLeagues, setBlockingLeagues] = useState<BlockingLeague[]>([]);
  // Stays true through a re-check (preflight === 'checking') once leagues
  // are loaded, so the cards below don't unmount mid-recheck.
  const isBlocked = blockingLeagues.length > 0;
  const isClear = preflight === 'ready' && blockingLeagues.length === 0;

  // Persistent status announcement (a transfer while other leagues still
  // block) + the heading focus lands on when that happens.
  const [statusMessage, setStatusMessage] = useState('');
  const blockHeadingRef = useRef<HTMLParagraphElement | null>(null);
  const prevBlockingCountRef = useRef(blockingLeagues.length);
  const justTransferredNameRef = useRef<string | null>(null);
  // Ref on the modal box so Esc can check for an open picker anywhere inside
  // it, not just under whatever element happens to be e.target.
  const modalRef = useRef<HTMLFormElement | null>(null);

  // A card-triggered re-check (stale RPC error, or an emptied member list)
  // surfaces its reason here instead of silently swapping the block's
  // contents. Cleared once the block clears.
  const [recheckIssue, setRecheckIssue] = useState<string | null>(null);
  // Caps the empty-members auto-recheck to once per league per modal session
  // so a persistently-empty member list can't loop.
  const retriedEmptyMembersRef = useRef<Set<string>>(new Set());
  // Tracks whether the very first pre-flight has resolved, so the
  // recheck-resolved focus effect doesn't fire on initial load.
  const hasCompletedInitialLoadRef = useRef(false);
  const prevPreflightForFocusRef = useRef<PreflightPhase>(preflight);

  // Handles of the currently-rendered league cards, so Esc can ask the one
  // mid-confirm to back out instead of closing the whole modal.
  const cardHandles = useRef<Map<string, LeagueTransferCardHandle>>(new Map());
  const setCardHandle = useCallback((leagueId: string, handle: LeagueTransferCardHandle | null) => {
    if (handle) cardHandles.current.set(leagueId, handle);
    else cardHandles.current.delete(leagueId);
  }, []);

  // Whether any card is mid-transfer — blocks the modal from closing out
  // from under it (Esc, backdrop click, and footer Cancel all check this).
  const [transferringLeagues, setTransferringLeagues] = useState<Set<string>>(new Set());
  const anyTransferring = transferringLeagues.size > 0;
  const setCardTransferring = useCallback((leagueId: string, isTransferring: boolean) => {
    setTransferringLeagues((prev) => {
      if (prev.has(leagueId) === isTransferring) return prev;
      const next = new Set(prev);
      if (isTransferring) next.add(leagueId);
      else next.delete(leagueId);
      return next;
    });
  }, []);

  // Announce + refocus when a transfer clears a league but others still
  // block (the last-league case is handled by the isClear effect below).
  useEffect(() => {
    if (blockingLeagues.length > 0 && blockingLeagues.length < prevBlockingCountRef.current) {
      const name = justTransferredNameRef.current;
      if (name) {
        setStatusMessage(`Ownership of ${name} transferred.`);
        const t = setTimeout(() => blockHeadingRef.current?.focus(), 30);
        justTransferredNameRef.current = null;
        prevBlockingCountRef.current = blockingLeagues.length;
        return () => clearTimeout(t);
      }
    }
    prevBlockingCountRef.current = blockingLeagues.length;
  }, [blockingLeagues]);

  // `issue`, when passed, is a card's reason for triggering a re-check
  // (stale RPC error, or an emptied member list) — surfaced near the
  // blocking heading instead of failing silently.
  const runPreflight = useCallback((issue?: string) => {
    // A re-check invalidates any not-yet-announced transfer name — it's no
    // longer safe to attribute whatever this re-check finds to that earlier
    // transfer.
    justTransferredNameRef.current = null;
    setRecheckIssue(issue ?? null);
    setPreflight('checking');
    setPreflightError(null);
    getLeaguesBlockingAccountDeletion()
      .then((leagues) => {
        setBlockingLeagues(leagues);
        setPreflight('ready');
      })
      .catch((err) => {
        setPreflight('error');
        setPreflightError(err instanceof Error ? err.message : 'Could not check your leagues.');
      });
  }, []);

  // The empty-members path (a card's own member list came back empty) is
  // capped at one re-check per league per modal session — past that, the
  // card just falls through to its own "No other members found." state.
  const handleEmptyMembers = useCallback((leagueId: string, leagueName: string) => {
    if (retriedEmptyMembersRef.current.has(leagueId)) return;
    retriedEmptyMembersRef.current.add(leagueId);
    runPreflight(`Couldn't transfer ${leagueName}: no other members remain.`);
  }, [runPreflight]);

  useEffect(() => {
    runPreflight();
  }, [runPreflight]);

  // Focus the password field once it actually renders (leagues clear); close
  // on Esc (unless mid-submit).
  useEffect(() => {
    if (!isClear) return;
    setRecheckIssue(null);
    const t = setTimeout(() => passwordRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [isClear]);

  // When a re-check (not the initial load) resolves and leagues are still
  // blocking, put focus back on the heading — the isClear effect above
  // covers the "block cleared" half of the same moment.
  useEffect(() => {
    const prevPreflight = prevPreflightForFocusRef.current;
    prevPreflightForFocusRef.current = preflight;
    if (preflight !== 'ready' || prevPreflight !== 'checking') return;
    if (!hasCompletedInitialLoadRef.current) {
      hasCompletedInitialLoadRef.current = true;
      return;
    }
    if (blockingLeagues.length === 0) return;
    const t = setTimeout(() => blockHeadingRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [preflight, blockingLeagues]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // A league picker's own Escape handler closes just that dropdown —
      // don't let the same keypress also close this modal. Check the modal
      // for any open picker rather than e.target: a mouse-opened picker
      // never made the trigger (or anything inside it) the event target.
      if (modalRef.current?.querySelector('[aria-haspopup="listbox"][aria-expanded="true"]')) return;
      if (phase === 'submitting' || anyTransferring) return;
      const confirmingCard = Array.from(cardHandles.current.values()).find((c) => c.confirming);
      if (confirmingCard) {
        confirmingCard.cancelConfirm();
        return;
      }
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, phase, anyTransferring]);

  const handleDelete = useCallback(async () => {
    if (!password || phase === 'submitting') return;
    setPhase('submitting');
    setError(null);
    setBlockedTeams(null);

    const supabase = createClient();
    // The Edge Function reads the caller from their Bearer token; supabase-js
    // attaches the current session's access token to functions.invoke, and the
    // password re-auth is verified server-side. We never trust a client-sent id.
    const { data, error: invokeErr } = await supabase.functions.invoke('delete-account', {
      body: { password },
    });

    // On a 2xx, supabase-js returns the parsed JSON in `data`. On a non-2xx it
    // returns a FunctionsHttpError in `invokeErr` whose `.context` is the raw
    // Response — our structured error body lives there, so we read both.
    const payload = (data ?? null) as
      | { deleted?: boolean; error?: string; teams?: OwnedTeam[] }
      | null;

    let code = payload?.error ?? null;
    let teams = payload?.teams ?? null;
    if (invokeErr) {
      try {
        const ctx = (invokeErr as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          code = body?.error ?? code;
          teams = body?.teams ?? teams;
        }
      } catch {
        /* fall through to generic error below */
      }
    }

    if (payload?.deleted) {
      // Success — clear the session and go home (signed-out state).
      await signOut();
      router.replace('/');
      router.refresh();
      return;
    }

    // Map the function's documented error codes to human copy.
    setPhase('error');
    switch (code) {
      case 'reauth_failed':
        setError('That password is incorrect. Please try again.');
        break;
      case 'password_required':
        setError('Enter your password to confirm.');
        break;
      case 'rate_limited':
        setError('Too many attempts. Please wait a minute and try again.');
        break;
      case 'ownership_transfer_required':
        setBlockedTeams(teams ?? []);
        setError(null);
        break;
      case 'fantasy_transfer_required':
        // The client-side pre-flight should have already caught this; the
        // function's 409 is a backstop in case a league changed underneath
        // us. Re-run the same check (source of truth) rather than trusting
        // the function's payload, then show the identical blocking state.
        setPhase('idle');
        setError(null);
        runPreflight();
        break;
      case 'unauthenticated':
        setError('Your session expired. Please sign in again.');
        break;
      default:
        setError('Something went wrong. Please try again.');
    }
  }, [password, phase, signOut, router, runPreflight]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-ink/40 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && phase !== 'submitting' && !anyTransferring) onClose();
      }}
    >
      <form
        ref={modalRef}
        onSubmit={(e) => {
          e.preventDefault();
          handleDelete();
        }}
        className="w-full max-w-[440px] max-h-full overflow-y-auto bg-surface rounded-card-lg shadow-hero flex flex-col"
      >
        <div className="px-5 py-4 border-b border-hairline">
          <h2
            id="delete-account-title"
            className="font-display italic text-[24px] font-bold tracking-[-0.02em] leading-[0.95] text-live m-0"
          >
            Delete account
          </h2>
          <p className="mt-2 text-[12.5px] text-muted font-tight leading-snug">
            This permanently deletes your account and all associated data. This
            action cannot be undone.
            {isClear ? ' Enter your password to confirm.' : ''}
          </p>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          {/* Persistent (always-mounted) so screen readers pick up the text
              change when a transfer clears one of several blocking leagues. */}
          <div aria-live="polite" className="sr-only">{statusMessage}</div>

          {/* Fantasy-league ownership pre-flight — takes over the whole body
              until it clears; the password step below never renders until it does. */}
          {preflight === 'checking' && blockingLeagues.length === 0 && (
            <div className="flex items-center gap-2.5 text-[12.5px] text-muted font-tight py-1">
              <span
                className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin flex-shrink-0"
                aria-hidden="true"
              />
              Checking your fantasy leagues…
            </div>
          )}

          {preflight === 'error' && (
            <div className="px-4 py-3 rounded-card-sm bg-live/[0.08] text-[12.5px] font-tight leading-snug">
              <p className="m-0 font-bold text-live mb-1">Couldn&apos;t check your leagues</p>
              <p className="m-0 text-muted">
                {preflightError ?? 'Something went wrong. Please try again.'}
              </p>
              <button
                type="button"
                onClick={() => runPreflight()}
                className={[
                  'mt-2.5 inline-flex items-center min-h-[44px] text-[11px] font-bold tracking-[0.08em] uppercase',
                  'text-live underline underline-offset-2 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live rounded-sm',
                ].join(' ')}
              >
                Try again
              </button>
            </div>
          )}

          {isBlocked && (
            <div className="flex flex-col gap-3">
              <div>
                <p
                  ref={blockHeadingRef}
                  tabIndex={-1}
                  className="m-0 font-bold text-live text-[13px] font-tight mb-1 focus-visible:outline-none"
                >
                  Transfer league ownership first
                </p>
                <p className="m-0 text-[12.5px] text-muted font-tight leading-snug">
                  You own {blockingLeagues.length === 1 ? 'a fantasy league' : `${blockingLeagues.length} fantasy leagues`}{' '}
                  that other members still play in. Deleting your account would delete{' '}
                  {blockingLeagues.length === 1 ? 'it' : 'them'} for everyone. Hand off ownership to continue.
                </p>
                {preflight === 'checking' && (
                  <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted font-tight">
                    <span
                      className="w-3 h-3 rounded-full border-2 border-current/30 border-t-current animate-spin flex-shrink-0"
                      aria-hidden="true"
                    />
                    Rechecking…
                  </p>
                )}
                {recheckIssue && (
                  <p role="alert" className="m-0 mt-1.5 text-[12px] font-medium text-live font-tight">
                    {recheckIssue}
                  </p>
                )}
              </div>
              {blockingLeagues.map((lg) => (
                <LeagueTransferCard
                  key={lg.leagueId}
                  ref={(handle) => setCardHandle(lg.leagueId, handle)}
                  league={lg}
                  currentUserId={user?.id ?? null}
                  runPreflight={runPreflight}
                  onEmptyMembers={handleEmptyMembers}
                  onTransferringChange={(next) => setCardTransferring(lg.leagueId, next)}
                  onTransferred={() => {
                    justTransferredNameRef.current = lg.leagueName;
                    setRecheckIssue(null);
                    setBlockingLeagues((prev) => prev.filter((l) => l.leagueId !== lg.leagueId));
                  }}
                />
              ))}
            </div>
          )}

          {/* Ownership-transfer block — the one non-generic failure worth its own copy. */}
          {isClear && (blockedTeams && blockedTeams.length > 0 ? (
            <div className="px-4 py-3 rounded-card-sm bg-live/[0.08] text-[12.5px] text-ink font-tight leading-snug">
              <p className="m-0 font-bold text-live mb-1">Transfer team ownership first</p>
              <p className="m-0 text-muted">
                You own {blockedTeams.length === 1 ? 'a team' : 'teams'} with other
                members. Transfer ownership (or remove the other members) before
                deleting your account:
              </p>
              <ul className="mt-2 mb-0 pl-4 list-disc text-ink">
                {blockedTeams.map((t) => (
                  <li key={t.id} className="font-semibold">{t.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
                Password
              </span>
              <input
                ref={passwordRef}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (phase === 'error') {
                    setPhase('idle');
                    setError(null);
                  }
                }}
                disabled={phase === 'submitting'}
                className={[
                  'w-full bg-ink/5 px-3.5 py-2.5 text-[14px] font-semibold text-ink font-tight rounded-card-sm',
                  'ring-1 ring-inset ring-transparent',
                  'focus-visible:outline-none focus-visible:ring-live',
                  'disabled:opacity-60',
                ].join(' ')}
                placeholder="Your password"
              />
            </label>
          ))}

          {isClear && error && (
            <p className="m-0 text-[12px] font-medium text-live font-tight">{error}</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-hairline flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'submitting' || anyTransferring}
            className={[
              'px-4 py-2.5 rounded-card-sm cursor-pointer text-[12px] font-bold tracking-[0.08em] uppercase font-tight',
              'text-muted hover:text-ink transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'disabled:opacity-60',
            ].join(' ')}
          >
            Cancel
          </button>
          {/* Hide the destructive submit until leagues are clear and no
              ownership block is showing — nothing to submit until then. */}
          {isClear && !(blockedTeams && blockedTeams.length > 0) && (
            <button
              type="submit"
              disabled={!password || phase === 'submitting'}
              className={[
                'px-4 py-2.5 rounded-card-sm cursor-pointer text-[12px] font-bold tracking-[0.08em] uppercase font-tight',
                'bg-live text-white ring-1 ring-inset ring-live',
                'hover:opacity-90 transition-opacity duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {phase === 'submitting' ? 'Deleting…' : 'Delete forever'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ─── League ownership transfer card (one per blocking league) ─────────────

/** One blocking league's row inside the pre-flight block: name, a picker of
 *  its OTHER members, and a "Make owner" action. Loads its own member list
 *  (the pre-flight RPC only returns counts, not who's in the league). */
const LeagueTransferCard = forwardRef<
  LeagueTransferCardHandle,
  {
    league: BlockingLeague;
    currentUserId: string | null;
    onTransferred: () => void;
    /** Re-runs the parent's DB pre-flight — used to reconcile this card's
     *  block against reality when the member list or a transfer attempt
     *  disagrees with what got us here (see the ownership/membership branch
     *  in handleTransfer below). The optional reason is surfaced near the
     *  parent's blocking heading while the re-check runs. */
    runPreflight: (issue?: string) => void;
    /** The member list came back empty (stale otherMemberCount) — the parent
     *  caps this to one re-check per league per modal session. */
    onEmptyMembers: (leagueId: string, leagueName: string) => void;
    /** Reports this card's transferring state up so the parent can block
     *  the modal from closing mid-transfer. */
    onTransferringChange: (isTransferring: boolean) => void;
  }
>(function LeagueTransferCard(
  { league, currentUserId, onTransferred, runPreflight, onEmptyMembers, onTransferringChange },
  ref,
) {
  const [members, setMembers] = useState<LeagueMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersReloadKey, setMembersReloadKey] = useState(0);
  // Starts unselected on purpose — the member picker shows a "Choose a new
  // owner" placeholder until the user actively picks someone. Don't
  // auto-select the first member; handing off ownership is too consequential
  // to default.
  const [selected, setSelected] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const makeOwnerBtnRef = useRef<HTMLButtonElement | null>(null);
  const yesMakeOwnerBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmTextRef = useRef<HTMLParagraphElement | null>(null);
  const tryAgainBtnRef = useRef<HTMLButtonElement | null>(null);
  const pickerWrapRef = useRef<HTMLDivElement | null>(null);
  const wasConfirmingRef = useRef(false);
  const wasTransferringRef = useRef(false);
  const pendingMembersRetryRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setMembersError(null);
    getLeagueMembers(league.leagueId)
      .then((all) => {
        if (cancelled) return;
        setMembers(all.filter((m) => m.userId !== currentUserId));
      })
      .catch((err) => {
        if (!cancelled) setMembersError(err instanceof Error ? err.message : 'Could not load members.');
      });
    return () => {
      cancelled = true;
    };
  }, [league.leagueId, currentUserId, membersReloadKey]);

  // The pre-flight RPC only counts other members as of its own last run —
  // if this card's own fetch comes back with none left, that count is
  // stale (someone left since). Re-check against the DB rather than
  // stranding the user on an unusable card. (Capped to once per league by
  // the parent — see onEmptyMembers — so a persistently-empty list falls
  // through to "No other members found." instead of looping.)
  useEffect(() => {
    if (members !== null && members.length === 0) onEmptyMembers(league.leagueId, league.leagueName);
  }, [members, league.leagueId, league.leagueName, onEmptyMembers]);

  // Report transferring state up so the parent can hold the modal open.
  useEffect(() => {
    onTransferringChange(transferring);
  }, [transferring, onTransferringChange]);

  // After clicking "Try again" on a failed member load, once the reload
  // settles, move focus to the picker trigger (success) or back to "Try
  // again" itself (failure) rather than leaving it stranded on nothing.
  useEffect(() => {
    if (!pendingMembersRetryRef.current) return;
    if (members === null && !membersError) return; // still in flight
    pendingMembersRetryRef.current = false;
    const t = setTimeout(() => {
      if (membersError) tryAgainBtnRef.current?.focus();
      else pickerWrapRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [members, membersError]);

  // Move focus to the confirmation copy when it appears, and back to "Make
  // owner" when Cancel returns to the picker.
  useEffect(() => {
    if (confirming) {
      wasConfirmingRef.current = true;
      const t = setTimeout(() => confirmTextRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    if (wasConfirmingRef.current) {
      wasConfirmingRef.current = false;
      const t = setTimeout(() => makeOwnerBtnRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [confirming]);

  // After a failed transfer, once the button re-enables, put focus back on
  // it rather than leaving it on nothing (the spinner replaced its label).
  useEffect(() => {
    const wasTransferring = wasTransferringRef.current;
    wasTransferringRef.current = transferring;
    if (wasTransferring && !transferring && transferError) {
      const t = setTimeout(() => yesMakeOwnerBtnRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [transferring, transferError]);

  const handleShowConfirm = useCallback(() => {
    if (!selected) return;
    setTransferError(null);
    setConfirming(true);
  }, [selected]);

  const handleCancelConfirm = useCallback(() => {
    if (transferring) return;
    setConfirming(false);
    setTransferError(null);
  }, [transferring]);

  const handleTransfer = useCallback(async () => {
    if (!selected || transferring) return;
    setTransferring(true);
    setTransferError(null);
    try {
      await transferLeagueOwnership(league.leagueId, selected);
      onTransferred();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not transfer ownership.';
      setTransferError(message);
      setTransferring(false);
      // Both are the RPC's own guards (see fantasy_transfer_league_ownership)
      // firing on stale state — ownership or membership already changed
      // underneath this card. Re-sync the block against the DB instead of
      // leaving the user stuck retrying the same doomed transfer.
      if (
        message.includes('only the league owner can transfer ownership') ||
        message.includes('the new owner must be a member of this league')
      ) {
        runPreflight(`Couldn't transfer ${league.leagueName}: ${message}`);
      }
    }
  }, [league.leagueId, selected, transferring, onTransferred, runPreflight]);

  const memberOptions: PillSelectOption<string>[] = (members ?? []).map((m) => ({
    value: m.userId,
    label: m.displayName ?? m.username ?? 'Member',
  }));
  // A disabled placeholder entry so the trigger reads "Choose a new owner"
  // instead of silently matching the first real option.
  const pickerOptions: PillSelectOption<string>[] = [
    { value: '', label: 'Choose a new owner', disabled: true },
    ...memberOptions,
  ];
  const selectedMember = memberOptions.length ? (members ?? []).find((m) => m.userId === selected) ?? null : null;
  const selectedName = selectedMember?.displayName ?? (selectedMember?.username ? `@${selectedMember.username}` : 'this member');
  // Same lookup, but for the trigger's aria-label — no "this member" filler
  // once something really is picked, and the same placeholder copy as the
  // picker itself when not.
  const currentOwnerLabel = selectedMember
    ? selectedMember.displayName ?? (selectedMember.username ? `@${selectedMember.username}` : 'Member')
    : 'Choose a new owner';

  useImperativeHandle(
    ref,
    () => ({ confirming, transferring, cancelConfirm: handleCancelConfirm }),
    [confirming, transferring, handleCancelConfirm],
  );

  return (
    <div className="px-4 py-3.5 rounded-card-sm bg-ink/5 flex flex-col gap-2.5">
      <div>
        <p className="m-0 font-tight text-[13.5px] font-bold text-ink">{league.leagueName}</p>
        <p className="m-0 text-[11.5px] text-faint font-tight">
          {league.otherMemberCount} other {league.otherMemberCount === 1 ? 'member' : 'members'}
        </p>
      </div>

      {membersError ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="m-0 text-[12px] text-live font-tight">{membersError}</p>
          <button
            ref={tryAgainBtnRef}
            type="button"
            onClick={() => {
              pendingMembersRetryRef.current = true;
              setMembersReloadKey((k) => k + 1);
            }}
            className={[
              'inline-flex items-center min-h-[44px] text-[11px] font-bold tracking-[0.08em] uppercase',
              'text-live underline underline-offset-2 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live rounded-sm',
            ].join(' ')}
          >
            Try again
          </button>
        </div>
      ) : members === null ? (
        <div className="h-11 rounded-full bg-ink/[0.06] animate-pulse" aria-hidden="true" />
      ) : memberOptions.length === 0 ? (
        <p className="m-0 text-[12px] text-muted font-tight">No other members found.</p>
      ) : confirming ? (
        <div className="flex flex-col gap-2.5">
          <p
            ref={confirmTextRef}
            tabIndex={-1}
            className="m-0 text-[12.5px] text-ink font-tight leading-snug focus-visible:outline-none"
          >
            Make {selectedName} the owner of {league.leagueName}? You&apos;ll stay in the league as a member.
          </p>
          <div className="flex items-center gap-2.5">
            <button
              ref={yesMakeOwnerBtnRef}
              type="button"
              onClick={handleTransfer}
              disabled={transferring}
              className={[
                'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full min-h-[44px] flex-shrink-0',
                'font-tight text-[11.5px] font-bold tracking-[0.06em] uppercase transition-colors duration-150',
                transferring
                  ? 'bg-ink/[0.08] text-faint cursor-not-allowed'
                  : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              {transferring && (
                <span
                  className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin"
                  aria-hidden="true"
                />
              )}
              {transferring ? 'Making owner…' : 'Yes, make owner'}
            </button>
            <button
              type="button"
              onClick={handleCancelConfirm}
              disabled={transferring}
              className={[
                'inline-flex items-center justify-center px-4 py-2.5 rounded-full min-h-[44px] flex-shrink-0 cursor-pointer',
                'font-tight text-[11.5px] font-bold tracking-[0.06em] uppercase',
                'text-muted hover:text-ink transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
          <div ref={pickerWrapRef} className="flex-1 flex flex-col gap-1.5 min-w-0">
            <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
              New owner
            </span>
            <PillSelect
              value={selected}
              options={pickerOptions}
              onChange={(next) => {
                setSelected(next);
                setConfirming(false);
                setTransferError(null);
              }}
              ariaLabel={`New owner for ${league.leagueName}: ${currentOwnerLabel}`}
              className="w-full justify-between !min-h-[44px]"
            />
          </div>
          <button
            ref={makeOwnerBtnRef}
            type="button"
            onClick={handleShowConfirm}
            disabled={!selected}
            className={[
              'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full min-h-[44px] flex-shrink-0',
              'font-tight text-[11.5px] font-bold tracking-[0.06em] uppercase transition-colors duration-150',
              !selected
                ? 'bg-ink/[0.08] text-faint cursor-not-allowed'
                : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            Make owner
          </button>
        </div>
      )}

      {transferError && (
        <p role="alert" className="m-0 text-[12px] text-live font-tight">{transferError}</p>
      )}
    </div>
  );
});
