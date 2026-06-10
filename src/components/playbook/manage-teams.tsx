'use client';

// /playbook/teams — team management surface.
//
// Supabase-backed:
//   • List teams I own / coach / am a member of (via listMyTeams)
//   • Owners + coaches can invite by email (create_team_invite RPC) — we
//     surface the generated share link inline so the user can copy it.
//   • Owners can rename + delete teams.
//   • Owners + coaches can revoke pending invites.
//   • Members can leave; owners can transfer ownership later (out of scope).

import { useCallback, useEffect, useState } from 'react';
import { PlaybookShell } from './playbook-shell';
import { TEAM_COLORS } from '@/lib/playbook/teams';
import {
  createInvite,
  createTeam,
  deleteTeam,
  leaveTeam,
  listMyTeams,
  listPendingInvites,
  listTeamMembers,
  renameTeam,
  revokeInvite,
  type PendingInvite,
  type Team,
  type TeamMember,
  type TeamRole,
} from '@/lib/playbook/data';
import { formatSupabaseError } from '@/lib/supabase/errors';
import { sendInviteEmail, resendInviteEmail } from '@/app/playbook/teams/actions';

interface ScopeShellProps {
  teams: Team[];
  scopeID?: string;
  onSwitchScope: (id: string) => void;
}

export function ManageTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [invitesByTeam, setInvitesByTeam] = useState<Record<string, PendingInvite[]>>({});
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [invitingTeamID, setInvitingTeamID] = useState<string | null>(null);
  const [resendingInviteID, setResendingInviteID] = useState<string | null>(null);
  const [scopeID, setScopeID] = useState<string | undefined>(undefined);

  // Roster expand/collapse state.
  // rosterCache: undefined = never fetched, 'loading' = in flight, TeamMember[] = loaded.
  const [expandedRosters, setExpandedRosters] = useState<Set<string>>(new Set());
  const [rosterCache, setRosterCache] = useState<Record<string, TeamMember[] | 'loading'>>({});

  // Re-load teams + pending invites for every owned/coach team.
  const refresh = useCallback(async () => {
    try {
      const t = await listMyTeams();
      setTeams(t);
      const editorTeams = t.filter((tt) => tt.role === 'owner' || tt.role === 'coach');
      const invs = await Promise.all(
        editorTeams.map(async (tt) => [tt.id, await listPendingInvites(tt.id)] as const),
      );
      setInvitesByTeam(Object.fromEntries(invs));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load teams.');
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = useCallback(
    async (name: string, shortName: string, color: string) => {
      try {
        setError(null);
        await createTeam({ name, shortName, color });
        setShowCreate(false);
        await refresh();
      } catch (err) {
        setError(formatSupabaseError(err, 'Create team'));
        console.error('[manage-teams] createTeam failed', err);
      }
    },
    [refresh],
  );

  const handleRename = useCallback(
    async (id: string, name: string) => {
      try {
        setError(null);
        await renameTeam(id, name);
        await refresh();
      } catch (err) {
        setError(formatSupabaseError(err, 'Rename team'));
        console.error('[manage-teams] renameTeam failed', err);
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const target = teams.find((t) => t.id === id);
      if (!target) return;
      if (!confirm(`Delete "${target.name}"? Members lose access, plays are removed. This cannot be undone.`)) {
        return;
      }
      try {
        setError(null);
        await deleteTeam(id);
        await refresh();
      } catch (err) {
        setError(formatSupabaseError(err, 'Delete team'));
        console.error('[manage-teams] deleteTeam failed', err);
      }
    },
    [refresh, teams],
  );

  const handleLeave = useCallback(
    async (id: string) => {
      if (!confirm('Leave this team? You can rejoin if invited again.')) return;
      try {
        setError(null);
        await leaveTeam(id);
        await refresh();
      } catch (err) {
        setError(formatSupabaseError(err, 'Leave team'));
        console.error('[manage-teams] leaveTeam failed', err);
      }
    },
    [refresh],
  );

  const handleInvite = useCallback(
    async (teamID: string, email: string, role: 'coach' | 'member') => {
      try {
        setError(null);
        const { token } = await createInvite(teamID, email, role);

        // Attempt to send via Resend. If it fails, fall back to copy-link so
        // the invite (already created in the DB) is still usable.
        try {
          await sendInviteEmail({ teamId: teamID, email, role, token });
          alert(`Invite emailed to ${email}.`);
        } catch (emailErr) {
          // Email failed — the token still exists. Surface the link manually.
          const link = `${window.location.origin}/playbook/invite/${token}`;
          const errMsg =
            emailErr instanceof Error ? emailErr.message : 'Could not send the email automatically.';
          const note = `Couldn't send the email automatically — here's the link to share:\n\n${link}\n\n(${errMsg})`;
          try {
            await navigator.clipboard.writeText(link);
            alert(`${note}\n\nLink copied to clipboard.`);
          } catch {
            window.prompt(note, link);
          }
          console.warn('[manage-teams] sendInviteEmail failed, fell back to copy-link', emailErr);
        }

        setInvitingTeamID(null);
        await refresh();
      } catch (err) {
        setError(formatSupabaseError(err, 'Send invite'));
        console.error('[manage-teams] createInvite failed', err);
      }
    },
    [refresh],
  );

  const handleRevokeInvite = useCallback(
    async (inviteID: string) => {
      try {
        setError(null);
        await revokeInvite(inviteID);
        await refresh();
      } catch (err) {
        setError(formatSupabaseError(err, 'Revoke invite'));
        console.error('[manage-teams] revokeInvite failed', err);
      }
    },
    [refresh],
  );

  const handleResendInvite = useCallback(
    async (inviteID: string, email: string) => {
      if (resendingInviteID) return; // guard against double-clicks mid-send
      try {
        setError(null);
        setResendingInviteID(inviteID);
        await resendInviteEmail({ inviteId: inviteID });
        alert(`Invite re-sent to ${email}.`);
      } catch (err) {
        setError(formatSupabaseError(err, 'Resend invite'));
        console.error('[manage-teams] resendInviteEmail failed', err);
      } finally {
        setResendingInviteID(null);
      }
    },
    [resendingInviteID],
  );

  const handleToggleRoster = useCallback(
    async (teamID: string) => {
      const isOpen = expandedRosters.has(teamID);
      if (isOpen) {
        // Collapse — just toggle; keep the cache so re-expand is instant.
        setExpandedRosters((prev) => {
          const next = new Set(prev);
          next.delete(teamID);
          return next;
        });
        return;
      }

      // Expand.
      setExpandedRosters((prev) => new Set(prev).add(teamID));

      // Only fetch if we don't already have data.
      if (rosterCache[teamID] !== undefined) return;

      setRosterCache((prev) => ({ ...prev, [teamID]: 'loading' }));
      try {
        const members = await listTeamMembers(teamID);
        setRosterCache((prev) => ({ ...prev, [teamID]: members }));
      } catch (err) {
        console.error('[manage-teams] listTeamMembers failed', err);
        // Remove 'loading' so the UI doesn't stay stuck; collapse too.
        setRosterCache((prev) => {
          const next = { ...prev };
          delete next[teamID];
          return next;
        });
        setExpandedRosters((prev) => {
          const next = new Set(prev);
          next.delete(teamID);
          return next;
        });
        setError('Could not load roster.');
      }
    },
    [expandedRosters, rosterCache],
  );

  const owned = teams.filter((t) => t.role === 'owner');
  const coaching = teams.filter((t) => t.role === 'coach');
  const memberOf = teams.filter((t) => t.role === 'member');

  return (
    <PlaybookShell
      teams={teams}
      currentTeamID={scopeID}
      onSwitchTeam={setScopeID}
      pageTitle="Teams"
    >
      <div className="px-4 pt-4 pb-12 lg:px-8 lg:pt-6 lg:pb-12">
        <div className="max-w-[860px] mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6 lg:mb-8">
            <div>
              <h1 className="m-0 font-tight text-[28px] lg:text-[36px] font-bold tracking-[-0.03em] leading-none text-ink">
                Teams
              </h1>
              <p className="text-muted font-medium font-tight mt-2 text-[13px] lg:text-[14px]">
                Switch between squads, invite players, and manage the ones you own. Invites live for 14 days — share the generated link with your players.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className={[
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-md cursor-pointer',
                'border border-ink bg-ink text-bg hover:opacity-90 transition-opacity',
                'font-tight text-[11px] font-bold tracking-[0.16em] uppercase',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              {showCreate ? 'Cancel' : '+ New team'}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2"
            >
              {error}
            </div>
          )}

          {showCreate && (
            <CreateTeamForm onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
          )}

          {!hydrated ? (
            <p className="text-[12px] text-faint font-tight">Loading teams…</p>
          ) : (
            <div className="flex flex-col gap-7 mt-2">
              <TeamSection
                heading={`Owned · ${owned.length}`}
                empty="You don't own a team yet — create one above."
                teams={owned}
                invitesByTeam={invitesByTeam}
                renderActions={(t) => (
                  <>
                    <SmallButton onClick={() => setInvitingTeamID(t.id)} variant="primary">
                      Invite
                    </SmallButton>
                    <SmallButton
                      onClick={async () => {
                        const name = prompt('Rename team:', t.name);
                        if (name && name.trim()) await handleRename(t.id, name.trim());
                      }}
                      variant="ghost"
                    >
                      Rename
                    </SmallButton>
                    <SmallButton onClick={() => handleDelete(t.id)} variant="danger">
                      Delete
                    </SmallButton>
                  </>
                )}
                inviteRowFor={invitingTeamID}
                onInviteSubmit={handleInvite}
                onInviteCancel={() => setInvitingTeamID(null)}
                onRevokeInvite={handleRevokeInvite}
                onResendInvite={handleResendInvite}
                resendingInviteID={resendingInviteID}
                expandedRosters={expandedRosters}
                rosterCache={rosterCache}
                onToggleRoster={handleToggleRoster}
              />

              <TeamSection
                heading={`Coaching · ${coaching.length}`}
                empty="Not coaching any teams."
                teams={coaching}
                invitesByTeam={invitesByTeam}
                renderActions={(t) => (
                  <>
                    <SmallButton onClick={() => setInvitingTeamID(t.id)} variant="primary">
                      Invite
                    </SmallButton>
                    <SmallButton onClick={() => handleLeave(t.id)} variant="ghost">
                      Leave
                    </SmallButton>
                  </>
                )}
                inviteRowFor={invitingTeamID}
                onInviteSubmit={handleInvite}
                onInviteCancel={() => setInvitingTeamID(null)}
                onRevokeInvite={handleRevokeInvite}
                onResendInvite={handleResendInvite}
                resendingInviteID={resendingInviteID}
                expandedRosters={expandedRosters}
                rosterCache={rosterCache}
                onToggleRoster={handleToggleRoster}
              />

              <TeamSection
                heading={`Member · ${memberOf.length}`}
                empty="You're not a member of any other teams."
                teams={memberOf}
                renderActions={(t) => (
                  <SmallButton onClick={() => handleLeave(t.id)} variant="ghost">
                    Leave
                  </SmallButton>
                )}
              />
            </div>
          )}
        </div>
      </div>
    </PlaybookShell>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────

function TeamSection({
  heading,
  empty,
  teams,
  invitesByTeam,
  renderActions,
  inviteRowFor,
  onInviteSubmit,
  onInviteCancel,
  onRevokeInvite,
  onResendInvite,
  resendingInviteID,
  expandedRosters,
  rosterCache,
  onToggleRoster,
}: {
  heading: string;
  empty: string;
  teams: Team[];
  invitesByTeam?: Record<string, PendingInvite[]>;
  renderActions: (team: Team) => React.ReactNode;
  inviteRowFor?: string | null;
  onInviteSubmit?: (teamID: string, email: string, role: 'coach' | 'member') => void;
  onInviteCancel?: () => void;
  onRevokeInvite?: (inviteID: string) => void;
  onResendInvite?: (inviteID: string, email: string) => void;
  resendingInviteID?: string | null;
  expandedRosters?: Set<string>;
  rosterCache?: Record<string, TeamMember[] | 'loading'>;
  onToggleRoster?: (teamID: string) => void;
}) {
  return (
    <section>
      <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase font-tight mb-3 pb-2 border-b border-hairline text-muted">
        {heading}
      </h2>
      {teams.length === 0 ? (
        <p className="text-[12px] text-faint font-tight">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {teams.map((t) => {
            const invites = invitesByTeam?.[t.id] ?? [];
            const isExpanded = expandedRosters?.has(t.id) ?? false;
            const rosterEntry = rosterCache?.[t.id];
            const rosterMembers = Array.isArray(rosterEntry) ? rosterEntry : null;
            const isLoadingRoster = rosterEntry === 'loading';

            // Sort order: owner first, then coaches, then members; stable within each tier by joinedAt.
            const ROLE_ORDER: Record<TeamRole, number> = { owner: 0, coach: 1, member: 2 };
            const sortedMembers = rosterMembers
              ? [...rosterMembers].sort(
                  (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt - b.joinedAt,
                )
              : null;

            return (
              <li key={t.id}>
                <div className="flex items-center gap-3 px-3 py-3 rounded-md border border-border bg-bg hover:border-ink transition-colors">
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-md flex-shrink-0 text-[11px] font-bold tracking-[0.04em] text-white"
                    style={{ background: t.color }}
                  >
                    {t.shortName}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-ink font-tight truncate">
                      {t.name}
                    </div>
                    <div className="text-[11px] font-medium text-faint font-tight mt-0.5">
                      {onToggleRoster ? (
                        <button
                          type="button"
                          onClick={() => onToggleRoster(t.id)}
                          aria-expanded={isExpanded}
                          className="cursor-pointer underline-offset-2 hover:text-ink hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
                        >
                          {t.memberCount} {t.memberCount === 1 ? 'member' : 'members'}
                        </button>
                      ) : (
                        <span>
                          {t.memberCount} {t.memberCount === 1 ? 'member' : 'members'}
                        </span>
                      )}
                      {invites.length > 0 && ` · ${invites.length} pending`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">{renderActions(t)}</div>
                </div>

                {isExpanded && (
                  <ul className="mt-1.5 ml-12 flex flex-col gap-1">
                    {isLoadingRoster && (
                      <li className="flex items-center gap-3 px-3 py-2 border border-hairline bg-surface rounded">
                        <span className="text-[12px] text-faint font-tight font-medium">
                          Loading members…
                        </span>
                      </li>
                    )}
                    {sortedMembers?.map((m) => {
                      const displayName =
                        m.displayName ??
                        (m.email.includes('@') ? m.email.split('@')[0] : m.email);
                      return (
                        <li
                          key={m.userID}
                          className="flex items-center gap-3 px-3 py-2 border border-hairline bg-surface rounded"
                        >
                          <span
                            className={[
                              'text-[10px] font-bold tracking-[0.16em] uppercase font-tight flex-shrink-0',
                              m.role === 'owner' ? 'text-accent' : 'text-faint',
                            ].join(' ')}
                          >
                            {m.role}
                          </span>
                          <span className="text-[12px] font-medium text-ink font-tight truncate min-w-0 flex-1">
                            {displayName}
                          </span>
                          <span className="text-[11px] text-muted font-tight truncate min-w-0 hidden sm:block">
                            {m.email}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {invites.length > 0 && onRevokeInvite && (
                  <ul className="mt-1.5 ml-12 flex flex-col gap-1">
                    {invites.map((inv) => (
                      <li
                        key={inv.id}
                        className="flex items-center gap-3 px-3 py-2 border border-hairline bg-surface rounded"
                      >
                        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
                          Pending
                        </span>
                        <span className="text-[12px] font-medium text-ink font-tight truncate flex-1 min-w-0">
                          {inv.email}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted font-tight">
                          {inv.role}
                        </span>
                        {onResendInvite && (
                          <SmallButton
                            onClick={() => onResendInvite(inv.id, inv.email)}
                            variant="ghost"
                            disabled={resendingInviteID === inv.id}
                          >
                            {resendingInviteID === inv.id ? 'Sending…' : 'Resend'}
                          </SmallButton>
                        )}
                        <SmallButton onClick={() => onRevokeInvite(inv.id)} variant="ghost">
                          Revoke
                        </SmallButton>
                      </li>
                    ))}
                  </ul>
                )}

                {inviteRowFor === t.id && onInviteSubmit && onInviteCancel && (
                  <InviteForm teamName={t.name} onSubmit={(email, role) => onInviteSubmit(t.id, email, role)} onCancel={onInviteCancel} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CreateTeamForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, shortName: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState(TEAM_COLORS[0]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const sn = (shortName || name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!sn || sn.length < 2) {
          alert('Short name needs 2–4 letters/numbers.');
          return;
        }
        onCreate(name, sn, color);
      }}
      className="mt-2 mb-2 p-4 border border-border bg-surface flex flex-col gap-3 rounded-md"
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1 flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted font-tight">
            Team name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Boston Glory"
            required
            autoFocus
            maxLength={80}
            className="bg-bg border border-border px-3 py-2 text-[13px] text-ink font-tight focus-visible:outline-none focus-visible:border-ink rounded"
          />
        </label>
        <label className="sm:w-[110px] flex flex-col gap-1.5">
          <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted font-tight">
            Short
          </span>
          <input
            type="text"
            value={shortName}
            onChange={(e) => setShortName(e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="BOS"
            className="bg-bg border border-border px-3 py-2 text-[13px] text-ink font-tight tabular uppercase tracking-[0.06em] focus-visible:outline-none focus-visible:border-ink rounded"
          />
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted font-tight">
          Color
        </span>
        <div className="flex flex-wrap gap-1.5">
          {TEAM_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Pick color ${c}`}
              aria-pressed={c === color}
              className={[
                'w-7 h-7 rounded-md cursor-pointer transition-all',
                c === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : '',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end pt-1">
        <SmallButton onClick={onCancel} variant="ghost" type="button">
          Cancel
        </SmallButton>
        <SmallButton onClick={() => {}} variant="primary" type="submit">
          Create team
        </SmallButton>
      </div>
    </form>
  );
}

function InviteForm({
  teamName,
  onSubmit,
  onCancel,
}: {
  teamName: string;
  onSubmit: (email: string, role: 'coach' | 'member') => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'coach' | 'member'>('member');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) return;
        onSubmit(trimmed, role);
      }}
      className="mt-1.5 ml-12 p-3 border border-accent border-dashed bg-surface flex items-center gap-2 flex-wrap rounded"
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint font-tight">
        Invite to {teamName}
      </span>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        placeholder="player@example.com"
        autoFocus
        className="flex-1 min-w-[180px] bg-bg border border-border px-2 py-1.5 text-[12px] text-ink font-tight focus-visible:outline-none focus-visible:border-ink rounded"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as 'coach' | 'member')}
        className="bg-bg border border-border px-2 py-1.5 text-[11px] font-bold tracking-[0.14em] uppercase text-ink font-tight rounded cursor-pointer focus-visible:outline-none focus-visible:border-ink"
      >
        <option value="member">Member</option>
        <option value="coach">Coach</option>
      </select>
      <SmallButton onClick={() => {}} variant="primary" type="submit">
        Send
      </SmallButton>
      <SmallButton onClick={onCancel} variant="ghost" type="button">
        Cancel
      </SmallButton>
    </form>
  );
}

function SmallButton({
  children,
  onClick,
  variant = 'ghost',
  type = 'button',
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const base =
    'inline-flex items-center px-2.5 py-1.5 text-[10px] font-bold tracking-[0.14em] uppercase font-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded disabled:opacity-50 disabled:pointer-events-none';
  const variantCls =
    variant === 'primary'
      ? 'bg-ink text-bg hover:opacity-90 border border-ink'
      : variant === 'danger'
        ? 'bg-transparent text-faint hover:text-live border border-transparent'
        : 'bg-transparent text-muted hover:text-ink border border-border';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${disabled ? '' : 'cursor-pointer'} ${variantCls}`}
    >
      {children}
    </button>
  );
}
