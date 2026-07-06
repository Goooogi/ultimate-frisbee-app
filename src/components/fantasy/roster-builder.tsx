'use client';

// Fantasy Roster Builder — client component.
// Handles: auth-gated saves, team name + handle collection, 7-slot roster
// (4 O + 3 D), player typeahead, live scoring preview, week lock state.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthModal } from '@/components/auth/auth-modal';
import { revalidateFantasy } from '@/app/fantasy/actions';
import {
  searchDraftablePlayers,
  createMyTeam,
  saveRoster,
  setMyUsername,
  getMyUsername,
  getMyTeam,
  getMyTeamRoster,
  getMyProfile,
  isUsernameAvailable,
  USERNAME_RE,
  fantasySeasonYear,
  type FantasyPlayerHit,
  type FantasyTeamView,
  type RosterSlot,
} from '@/lib/fantasy/data';
import { playerSeasonPreview } from '@/lib/fantasy/data';
import { type FantasyRole, SCORING } from '@/lib/fantasy/scoring';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekInfo {
  week: string;
  lockAt: string | null;
  unlockAt: string | null;
  locked: boolean;
}

interface RosterBuilderProps {
  weekInfo: WeekInfo | null;
  existingTeam: FantasyTeamView | null;
  /** The user's already-saved roster, used to pre-fill the slots so returning
   *  to "My Team" shows their picks instead of empty search boxes. */
  existingRoster?: RosterSlot[];
}

interface SlotState {
  role: FantasyRole;
  player: FantasyPlayerHit | null;
  /** Season-to-date point preview for this player in this role. null = not loaded. */
  preview: number | null;
}

// 4 offender slots then 3 defender slots — fixed order.
function initialSlots(): SlotState[] {
  return [
    { role: 'offender', player: null, preview: null },
    { role: 'offender', player: null, preview: null },
    { role: 'offender', player: null, preview: null },
    { role: 'offender', player: null, preview: null },
    { role: 'defender', player: null, preview: null },
    { role: 'defender', player: null, preview: null },
    { role: 'defender', player: null, preview: null },
  ];
}

// Build the 7 fixed slots (4 O then 3 D) pre-filled from a saved roster.
// Slots beyond the saved count (or the wrong role) stay empty. Extra saved
// players of a role past its capacity are ignored (shouldn't happen — the DB
// enforces 4/3 — but we guard defensively).
function slotsFromRoster(roster: RosterSlot[]): SlotState[] {
  const slots = initialSlots();
  const offenders = roster.filter((r) => r.role === 'offender');
  const defenders = roster.filter((r) => r.role === 'defender');
  const toHit = (r: RosterSlot): FantasyPlayerHit => ({
    playerId: r.playerId,
    fullName: r.fullName,
    teamId: r.teamId,
    teamName: r.teamName,
  });
  // Offender slots are indices 0–3, defender slots 4–6.
  offenders.slice(0, 4).forEach((r, i) => {
    slots[i] = { role: 'offender', player: toHit(r), preview: null };
  });
  defenders.slice(0, 3).forEach((r, i) => {
    slots[4 + i] = { role: 'defender', player: toHit(r), preview: null };
  });
  return slots;
}

// ─── Player Typeahead ─────────────────────────────────────────────────────────

interface TypeaheadProps {
  slotIndex: number;
  role: FantasyRole;
  currentPlayer: FantasyPlayerHit | null;
  usedPlayerIds: Set<string>;
  onSelect: (slotIndex: number, player: FantasyPlayerHit) => void;
  onClear: (slotIndex: number) => void;
  disabled?: boolean;
}

function PlayerTypeahead({
  slotIndex,
  role,
  currentPlayer,
  usedPlayerIds,
  onSelect,
  onClear,
  disabled = false,
}: TypeaheadProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FantasyPlayerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const hits = await searchDraftablePlayers(q, 12);
      setResults(hits.filter((h) => !usedPlayerIds.has(h.playerId)));
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [usedPlayerIds]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 200);
  };

  const handleSelect = (player: FantasyPlayerHit) => {
    onSelect(slotIndex, player);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const handleClear = () => {
    onClear(slotIndex);
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  // Close on click-outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const roleLabel = role === 'offender' ? 'O' : 'D';
  const roleColor = role === 'offender' ? 'text-ink' : 'text-accent';

  if (currentPlayer) {
    return (
      <div
        className={[
          'flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-surface',
          'min-h-[44px]',
        ].join(' ')}
      >
        <span
          className={[
            'flex-shrink-0 w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center',
            'bg-[rgb(var(--ink)/0.08)] font-tight',
            roleColor,
          ].join(' ')}
          aria-label={role}
        >
          {roleLabel}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-tight text-[14px] font-semibold text-ink truncate">
            {currentPlayer.fullName}
          </span>
          {currentPlayer.teamName && (
            <span className="block font-tight text-[11px] text-muted truncate">
              {currentPlayer.teamName}
            </span>
          )}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Remove ${currentPlayer.fullName}`}
            className={[
              'flex-shrink-0 w-7 h-7 rounded flex items-center justify-center',
              'text-faint hover:text-ink hover:bg-[rgb(var(--ink)/0.06)]',
              'transition-colors duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <span
          className={[
            'absolute left-3 flex-shrink-0 w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center',
            'bg-[rgb(var(--ink)/0.08)] font-tight pointer-events-none',
            roleColor,
          ].join(' ')}
          aria-hidden="true"
        >
          {roleLabel}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => query.length >= 2 && setOpen(true)}
          disabled={disabled}
          placeholder={`Search ${role === 'offender' ? 'offender' : 'defender'}…`}
          aria-label={`Search for a player to add as ${role}`}
          aria-autocomplete="list"
          aria-expanded={open}
          className={[
            'w-full pl-10 pr-4 py-2.5 rounded-md border border-border bg-surface',
            'font-tight text-[14px] text-ink placeholder:text-faint',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
            'min-h-[44px]',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
          ].join(' ')}
        />
        {loading && (
          <div
            className="absolute right-3 w-4 h-4 rounded-full border-2 border-[rgb(var(--ink)/0.15)] border-t-accent animate-spin"
            aria-hidden="true"
          />
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Player search results"
          className={[
            'absolute top-full left-0 right-0 z-20 mt-1',
            'bg-bg border border-border rounded-md shadow-lg overflow-hidden',
            'max-h-[240px] overflow-y-auto',
          ].join(' ')}
        >
          {results.map((hit) => (
            <li key={hit.playerId} role="option" aria-selected="false">
              <button
                type="button"
                onClick={() => handleSelect(hit)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left',
                  'hover:bg-surface transition-colors duration-150 cursor-pointer',
                  'focus-visible:outline-none focus-visible:bg-surface',
                  'border-b border-hairline last:border-0',
                ].join(' ')}
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-tight text-[13px] font-semibold text-ink truncate">
                    {hit.fullName}
                  </span>
                  {hit.teamName && (
                    <span className="block font-tight text-[11px] text-muted truncate">
                      {hit.teamName}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-bg border border-border rounded-md shadow-lg px-3 py-3">
          <span className="font-tight text-[13px] text-faint">No players found for &ldquo;{query}&rdquo;</span>
        </div>
      )}
    </div>
  );
}

// ─── Scoring Preview Badge ────────────────────────────────────────────────────

function PreviewBadge({ points, role }: { points: number | null; role: FantasyRole }) {
  if (points === null) return null;
  const roleLabel = role === 'offender' ? 'as O' : 'as D';
  return (
    <div
      className="flex items-center gap-1 mt-1.5 pl-8"
      aria-label={`Season preview: ${points} points ${roleLabel}`}
    >
      <span className="font-tight text-[11px] text-faint">
        Season preview:
      </span>
      <span className="font-tight text-[11px] font-bold text-ink tabular">
        {points} pts
      </span>
      <span className="font-tight text-[11px] text-faint">{roleLabel}</span>
    </div>
  );
}

// ─── Username validation hook ─────────────────────────────────────────────────

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function useUsernameCheck(username: string): UsernameStatus {
  const [status, setStatus] = useState<UsernameStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) {
      setStatus('idle');
      return;
    }
    if (!USERNAME_RE.test(u)) {
      setStatus('invalid');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const avail = await isUsernameAvailable(u);
        setStatus(avail ? 'available' : 'taken');
      } catch {
        setStatus('idle');
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username]);

  return status;
}

// ─── RosterBuilder (main component) ───────────────────────────────────────────

export function RosterBuilder({ weekInfo, existingTeam, existingRoster }: RosterBuilderProps) {
  const { user } = useAuth();
  const router = useRouter();

  // Auth modal state — opened only on write attempt when logged out.
  const [authOpen, setAuthOpen] = useState(false);

  // Form state
  const [teamName, setTeamName] = useState(existingTeam?.teamName ?? '');
  const [handle, setHandle] = useState('');
  // Whether the user already has a handle set in their profile (post-registration users will).
  const [hasExistingHandle, setHasExistingHandle] = useState(false);
  // Seed the slots from any already-saved roster so "My Team" shows the user's
  // real picks on first paint, not empty search boxes.
  const [slots, setSlots] = useState<SlotState[]>(() =>
    existingRoster && existingRoster.length > 0
      ? slotsFromRoster(existingRoster)
      : initialSlots(),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTeamId, setSavedTeamId] = useState<string | null>(null);

  // Load profile once user is known: prefill team name from display name (if no existing team),
  // and load their existing handle (hide the handle field if already set).
  useEffect(() => {
    if (!user) return;
    getMyProfile().then((profile) => {
      if (profile?.username) {
        setHandle(profile.username);
        setHasExistingHandle(true);
      }
      // Only prefill team name when no team exists yet
      if (!existingTeam && !savedTeamId && profile?.displayName) {
        setTeamName((prev) => prev || profile.displayName!);
      }
    }).catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load existing roster if we already have a team (for the current week).
  useEffect(() => {
    if (!existingTeam || !weekInfo) return;
    // If team already exists, pre-fill the team name.
    setTeamName(existingTeam.teamName);
    setSavedTeamId(existingTeam.id);
  }, [existingTeam, weekInfo]);

  const handleStatus = useUsernameCheck(user ? '' : handle); // only validate pre-auth

  // Derived state
  const offSlots = slots.filter((s) => s.role === 'offender');
  const defSlots = slots.filter((s) => s.role === 'defender');
  const filledCount = slots.filter((s) => s.player !== null).length;
  const isComplete = filledCount === 7;
  const usedPlayerIds = new Set(
    slots.filter((s) => s.player !== null).map((s) => s.player!.playerId),
  );
  const isLocked = weekInfo?.locked ?? false;

  const handleSelectPlayer = useCallback(
    async (slotIndex: number, player: FantasyPlayerHit) => {
      setSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = { ...next[slotIndex], player, preview: null };
        return next;
      });
      // Fire preview fetch in background.
      const role = slots[slotIndex].role;
      try {
        const pts = await playerSeasonPreview(player.playerId, role);
        setSlots((prev) => {
          const next = [...prev];
          // Only update if this slot still has the same player.
          if (next[slotIndex].player?.playerId === player.playerId) {
            next[slotIndex] = { ...next[slotIndex], preview: pts };
          }
          return next;
        });
      } catch {
        // preview is non-critical; swallow
      }
    },
    [slots],
  );

  const handleClearPlayer = useCallback((slotIndex: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = { ...next[slotIndex], player: null, preview: null };
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!isComplete) return;
    if (isLocked) return;
    if (!weekInfo) return;

    setSaving(true);
    setSaveError(null);

    try {
      let teamId = existingTeam?.id ?? savedTeamId ?? null;

      // 1. Set username if not yet set (required before createMyTeam).
      const currentHandle = handle.trim().toLowerCase();
      const existingHandle = await getMyUsername();
      if (!existingHandle && currentHandle) {
        await setMyUsername(currentHandle);
      }

      // 2. Create team if needed.
      if (!teamId) {
        teamId = await createMyTeam(teamName.trim(), fantasySeasonYear());
        setSavedTeamId(teamId);
      }

      // 3. Save roster.
      const rosterSlots = slots
        .filter((s) => s.player !== null)
        .map((s) => ({ playerId: s.player!.playerId, role: s.role }));
      await saveRoster(teamId, weekInfo.week, rosterSlots);

      // 4. Bust the ISR cache on the leaderboard + this team's public view so
      // the new/updated team shows immediately instead of after the 60s
      // revalidate window. Non-fatal.
      await revalidateFantasy(teamId).catch(() => null);

      // 5. Redirect to public team view.
      router.push(`/fantasy/team/${teamId}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // After sign-in, re-load existing team + its saved roster. This covers the
  // case where the page was rendered logged-out (empty existingRoster) and the
  // user signed in via the modal — without this, their picks wouldn't appear
  // until a full reload. Only fills slots that are still empty so we never
  // clobber picks the user has already started making this session.
  useEffect(() => {
    if (!user) return;
    getMyTeam().then((t) => {
      if (t) {
        setTeamName(t.teamName);
        setSavedTeamId(t.id);
      }
    }).catch(() => null);

    if (!weekInfo) return;
    getMyTeamRoster(weekInfo.week).then((roster) => {
      if (roster.length === 0) return;
      setSlots((prev) => {
        // Don't overwrite a session where the user already picked players.
        if (prev.some((s) => s.player !== null)) return prev;
        return slotsFromRoster(roster);
      });
    }).catch(() => null);
  }, [user, weekInfo]);

  // ── Section helpers ───────────────────────────────────────────────────────

  const sectionLabel = (role: FantasyRole, count: number, max: number) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span
          className={[
            'inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold font-tight',
            'bg-[rgb(var(--ink)/0.08)]',
            role === 'offender' ? 'text-ink' : 'text-accent',
          ].join(' ')}
          aria-hidden="true"
        >
          {role === 'offender' ? 'O' : 'D'}
        </span>
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          {role === 'offender' ? 'Offense' : 'Defense'}
        </span>
        <span className="text-[11px] font-bold text-faint font-tight">
          ({count}/{max})
        </span>
      </div>
      <div className="text-[10px] font-tight text-faint">
        {role === 'offender' ? (
          <span>
            Goal/Assist <span className="font-bold text-ink">+{SCORING.offender.goal}</span>
            {' · '}Block <span className="font-bold text-ink">+{SCORING.offender.block}</span>
          </span>
        ) : (
          <span>
            Block <span className="font-bold text-accent">+{SCORING.defender.block}</span>
            {' · '}Goal/Assist <span className="font-bold text-ink">+{SCORING.defender.goal}</span>
          </span>
        )}
      </div>
    </div>
  );

  // Handle is only required in the legacy path (user registered before handle was mandatory).
  const needsHandle = user && !existingTeam && !savedTeamId && !hasExistingHandle;
  const needsTeamName = user && !existingTeam && !savedTeamId;
  const handleOk =
    !needsHandle ||
    (handle.trim().length > 0 && handleStatus === 'available');
  const teamNameOk = !needsTeamName || teamName.trim().length >= 1;
  const canSave = isComplete && !isLocked && handleOk && teamNameOk && !saving;

  return (
    <>
      <div className="space-y-8">
        {/* ── Week lock banner ──────────────────────────────────────────── */}
        {isLocked && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-md bg-[rgb(var(--live)/0.08)] border border-[rgb(var(--live)/0.20)]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="flex-shrink-0 text-[rgb(var(--live))]"
            >
              <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 7V5a3 3 0 116 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="font-tight text-[13px] font-medium text-ink">
              {weekInfo?.week} is locked for the weekend
              {weekInfo?.unlockAt ? ` — editing reopens ${formatReopen(weekInfo.unlockAt)}` : ' — roster changes are disabled'}.
            </span>
          </div>
        )}

        {!weekInfo && (
          <div className="px-4 py-3 rounded-md bg-[rgb(var(--ink)/0.04)] border border-border">
            <span className="font-tight text-[13px] text-muted">
              No active week found. Check back once the season schedule is published.
            </span>
          </div>
        )}

        {/* ── Identity fields (only before team is created) ─────────────── */}
        {user && !existingTeam && !savedTeamId && (
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-4">
              Your Identity
            </div>
            <div className="space-y-4">
              {/* Team name — pre-filled from display name; user can change it freely */}
              <div>
                <label
                  htmlFor="team-name"
                  className="block text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5"
                >
                  Team Name
                </label>
                <input
                  id="team-name"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. Disc Jockeys"
                  className={[
                    'w-full px-3 py-2.5 rounded-md border border-border bg-bg',
                    'font-tight text-[14px] text-ink placeholder:text-faint',
                    'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
                    'min-h-[44px]',
                  ].join(' ')}
                />
                <p className="mt-1 text-[11px] text-faint font-tight">
                  {teamName.trim().length}/40 characters
                </p>
              </div>

              {/* Handle — only shown to legacy users who don't have one yet.
                  New users set their handle at registration; it flows in via getMyProfile(). */}
              {!hasExistingHandle && (
                <div>
                  <label
                    htmlFor="handle"
                    className="block text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5"
                  >
                    Leaderboard Handle
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 font-tight text-[14px] text-faint pointer-events-none">
                      @
                    </span>
                    <input
                      id="handle"
                      type="text"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      maxLength={30}
                      placeholder="your_handle"
                      autoComplete="username"
                      className={[
                        'w-full pl-7 pr-4 py-2.5 rounded-md border bg-bg',
                        'font-tight text-[14px] text-ink placeholder:text-faint',
                        'focus:outline-none focus:ring-2 focus:border-transparent',
                        'min-h-[44px]',
                        handleStatus === 'available'
                          ? 'border-green-500 focus:ring-green-500'
                          : handleStatus === 'taken' || handleStatus === 'invalid'
                          ? 'border-[rgb(var(--live))] focus:ring-[rgb(var(--live))]'
                          : 'border-border focus:ring-accent',
                      ].join(' ')}
                    />
                    {handleStatus === 'checking' && (
                      <div
                        className="absolute right-3 w-4 h-4 rounded-full border-2 border-[rgb(var(--ink)/0.15)] border-t-accent animate-spin"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="mt-1 font-tight text-[11px]">
                    {handleStatus === 'available' && (
                      <span className="text-green-600">Handle is available</span>
                    )}
                    {handleStatus === 'taken' && (
                      <span className="text-[rgb(var(--live))]">Handle is already taken</span>
                    )}
                    {handleStatus === 'invalid' && (
                      <span className="text-[rgb(var(--live))]">
                        3–30 chars, lowercase letters/numbers/underscores only
                      </span>
                    )}
                    {(handleStatus === 'idle' || handleStatus === 'checking') && (
                      <span className="text-faint">
                        Your unique @identity on the leaderboard.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Show existing team info */}
        {existingTeam && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-md bg-surface border border-border">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0 text-accent">
              <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-tight text-[13px] text-ink">
              Team <span className="font-bold">{existingTeam.teamName}</span>{' '}
              {existingTeam.ownerUsername && (
                <span className="text-muted">· @{existingTeam.ownerUsername}</span>
              )}
            </span>
            <Link
              href={`/fantasy/team/${existingTeam.id}`}
              className="ml-auto text-[11px] font-bold text-accent font-tight hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              View team
            </Link>
          </div>
        )}

        {/* ── Offense section ───────────────────────────────────────────── */}
        <div>
          {sectionLabel('offender', offSlots.filter((s) => s.player !== null).length, 4)}
          <div className="space-y-2">
            {slots.map((slot, idx) => {
              if (slot.role !== 'offender') return null;
              return (
                <div key={idx}>
                  <PlayerTypeahead
                    slotIndex={idx}
                    role="offender"
                    currentPlayer={slot.player}
                    usedPlayerIds={usedPlayerIds}
                    onSelect={handleSelectPlayer}
                    onClear={handleClearPlayer}
                    disabled={isLocked || !weekInfo}
                  />
                  {slot.player && (
                    <PreviewBadge points={slot.preview} role="offender" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Defense section ───────────────────────────────────────────── */}
        <div>
          {sectionLabel('defender', defSlots.filter((s) => s.player !== null).length, 3)}
          <div className="space-y-2">
            {slots.map((slot, idx) => {
              if (slot.role !== 'defender') return null;
              return (
                <div key={idx}>
                  <PlayerTypeahead
                    slotIndex={idx}
                    role="defender"
                    currentPlayer={slot.player}
                    usedPlayerIds={usedPlayerIds}
                    onSelect={handleSelectPlayer}
                    onClear={handleClearPlayer}
                    disabled={isLocked || !weekInfo}
                  />
                  {slot.player && (
                    <PreviewBadge points={slot.preview} role="defender" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Roster summary bar ───────────────────────────────────────── */}
        <div className="flex items-center gap-2 py-2">
          {Array.from({ length: 7 }).map((_, i) => {
            const filled = i < filledCount;
            const isOff = i < 4;
            return (
              <div
                key={i}
                aria-hidden="true"
                className={[
                  'h-1 flex-1 rounded-full transition-colors duration-200',
                  filled
                    ? isOff
                      ? 'bg-ink'
                      : 'bg-accent'
                    : 'bg-[rgb(var(--ink)/0.12)]',
                ].join(' ')}
              />
            );
          })}
          <span className="flex-shrink-0 font-tight text-[11px] text-faint ml-1">
            {filledCount}/7
          </span>
        </div>

        {/* ── Save / error ─────────────────────────────────────────────── */}
        {saveError && (
          <div className="px-4 py-3 rounded-md bg-[rgb(var(--live)/0.08)] border border-[rgb(var(--live)/0.20)]">
            <span className="font-tight text-[13px] text-ink">{saveError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            aria-label={
              !user
                ? 'Sign in to save your roster'
                : isLocked
                ? 'This week is locked'
                : !isComplete
                ? `Select ${7 - filledCount} more player${7 - filledCount !== 1 ? 's' : ''}`
                : 'Save roster'
            }
            className={[
              'inline-flex items-center justify-center gap-2',
              'px-6 py-3 rounded-md',
              'font-tight text-[13px] font-bold tracking-[0.06em] uppercase',
              'transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              canSave
                ? 'bg-accent text-[rgb(var(--accent-ink))] hover:opacity-90 cursor-pointer'
                : 'bg-[rgb(var(--ink)/0.08)] text-faint cursor-not-allowed',
            ].join(' ')}
          >
            {saving ? (
              <>
                <div
                  className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin"
                  aria-hidden="true"
                />
                Saving…
              </>
            ) : !user ? (
              'Sign in to save'
            ) : isLocked ? (
              'Week locked'
            ) : !isComplete ? (
              `${7 - filledCount} slot${7 - filledCount !== 1 ? 's' : ''} remaining`
            ) : (
              'Save roster'
            )}
          </button>

          {!isComplete && !isLocked && (
            <span className="font-tight text-[12px] text-faint">
              Fill all 4 offense + 3 defense slots to save.
            </span>
          )}
          {isComplete && !isLocked && weekInfo?.lockAt && (
            <span className="font-tight text-[12px] text-faint">
              Locks at first game — {formatLock(weekInfo.lockAt)}. Edit any time before then.
            </span>
          )}
        </div>
      </div>

      {/* Auth modal — lazy-triggered by write action */}
      <AuthModal
        open={authOpen}
        initialMode="signin"
        dismissible
        onDismiss={() => setAuthOpen(false)}
        headline="Sign in to build your team"
        subhead="Your roster is saved to your account. Free to play."
      />
    </>
  );
}

// "Fri, Jul 10, 7:00 PM ET" — when a week locks (its first game kicks off).
// Rendered in US Eastern so the displayed time matches the lock rule regardless
// of the viewer's browser timezone.
function formatLock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'first game';
  const s = d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  return `${s} ET`;
}

// "Monday" (or "Mon, Jul 13") — when editing reopens for the next week. ET.
function formatReopen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Monday';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}
