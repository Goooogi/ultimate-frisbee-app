'use client';

// /playbook/teams — team management surface.
//
// V1 scope: pure frontend, localStorage-backed. The "invite", "leave", and
// "delete" actions update local state only; once auth + a real backend exist,
// this view stays the same but the handlers move from saveTeams() to API
// calls. The UI flows are picked deliberately so the backend hooks have an
// obvious spot to plug in.

import { useCallback, useEffect, useState } from 'react';
import { PlaybookShell } from './playbook-shell';
import {
  createTeam,
  loadTeams,
  saveTeams,
  seedTeam,
  TEAM_COLORS,
  type Team,
  type TeamRole,
} from '@/lib/playbook/teams';

export function ManageTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamID, setCurrentTeamID] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [invitingTeamID, setInvitingTeamID] = useState<string | null>(null);

  // ── hydrate ────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = loadTeams();
    if (stored.teams.length === 0) {
      const seed = seedTeam();
      setTeams([seed]);
      setCurrentTeamID(seed.id);
    } else {
      setTeams(stored.teams);
      setCurrentTeamID(stored.currentTeamID ?? stored.teams[0].id);
    }
    setHydrated(true);
  }, []);

  // ── persist ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    saveTeams(teams, currentTeamID);
  }, [teams, currentTeamID, hydrated]);

  // ── actions ────────────────────────────────────────────────────────────
  const handleSwitchTeam = useCallback((id: string) => {
    setCurrentTeamID(id);
  }, []);

  const handleCreate = useCallback((name: string, shortName: string, color: string) => {
    const t = createTeam(name, shortName, color);
    setTeams((all) => [...all, t]);
    setCurrentTeamID(t.id);
    setShowCreate(false);
  }, []);

  const handleRename = useCallback((id: string, name: string) => {
    setTeams((all) => all.map((t) => (t.id === id ? { ...t, name } : t)));
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm('Delete this team? Players you invited will lose access.')) return;
      setTeams((all) => {
        const remaining = all.filter((t) => t.id !== id);
        if (remaining.length === 0) {
          const seed = seedTeam();
          setCurrentTeamID(seed.id);
          return [seed];
        }
        if (id === currentTeamID) setCurrentTeamID(remaining[0].id);
        return remaining;
      });
    },
    [currentTeamID],
  );

  const handleLeave = useCallback(
    (id: string) => {
      if (!confirm('Leave this team? You can rejoin if invited again.')) return;
      setTeams((all) => {
        const remaining = all.filter((t) => t.id !== id);
        if (remaining.length === 0) {
          const seed = seedTeam();
          setCurrentTeamID(seed.id);
          return [seed];
        }
        if (id === currentTeamID) setCurrentTeamID(remaining[0].id);
        return remaining;
      });
    },
    [currentTeamID],
  );

  const handleInvite = useCallback((teamID: string, email: string) => {
    // Frontend stub — bump memberCount as if they accepted instantly. Real
    // flow will send an invite email + create a pending row server-side.
    if (!email.trim()) return;
    setTeams((all) =>
      all.map((t) => (t.id === teamID ? { ...t, memberCount: t.memberCount + 1 } : t)),
    );
    setInvitingTeamID(null);
  }, []);

  const handleAcceptInvite = useCallback((id: string) => {
    setTeams((all) => all.map((t) => (t.id === id ? { ...t, role: 'member' as TeamRole } : t)));
  }, []);

  const handleDeclineInvite = useCallback((id: string) => {
    setTeams((all) => all.filter((t) => t.id !== id));
  }, []);

  const owned = teams.filter((t) => t.role === 'owner');
  const member = teams.filter((t) => t.role === 'member');
  const invited = teams.filter((t) => t.role === 'invited');

  return (
    <PlaybookShell
      teams={teams}
      currentTeamID={currentTeamID}
      onSwitchTeam={handleSwitchTeam}
      pageTitle="Teams"
    >
      <div className="px-4 pt-4 pb-12 lg:px-8 lg:pt-6 lg:pb-12">
        <div className="max-w-[860px] mx-auto">
          {/* page header */}
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6 lg:mb-8">
            <div>
              <h1 className="m-0 font-tight text-[28px] lg:text-[36px] font-bold tracking-[-0.03em] leading-none text-ink">
                Teams
              </h1>
              <p className="text-muted font-medium font-tight mt-2 text-[13px] lg:text-[14px]">
                Switch between squads, invite players, and manage the ones you own. Invites and shared plays land here once the backend ships.
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

          {showCreate && <CreateTeamForm onCreate={handleCreate} onCancel={() => setShowCreate(false)} />}

          {/* sections */}
          <div className="flex flex-col gap-7 mt-2">
            {invited.length > 0 && (
              <TeamSection
                heading={`Pending invites · ${invited.length}`}
                accent
                empty="None pending."
                teams={invited}
                renderActions={(t) => (
                  <>
                    <SmallButton onClick={() => handleAcceptInvite(t.id)} variant="primary">
                      Accept
                    </SmallButton>
                    <SmallButton onClick={() => handleDeclineInvite(t.id)} variant="ghost">
                      Decline
                    </SmallButton>
                  </>
                )}
              />
            )}

            <TeamSection
              heading={`Owned · ${owned.length}`}
              empty="You don't own a team yet — create one above."
              teams={owned}
              currentTeamID={currentTeamID}
              onSwitchTeam={handleSwitchTeam}
              renderActions={(t) => (
                <>
                  <SmallButton onClick={() => setInvitingTeamID(t.id)} variant="primary">
                    Invite
                  </SmallButton>
                  <SmallButton
                    onClick={() => {
                      const name = prompt('Rename team:', t.name);
                      if (name && name.trim()) handleRename(t.id, name.trim());
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
            />

            <TeamSection
              heading={`Member · ${member.length}`}
              empty="You're not a member of any other teams."
              teams={member}
              currentTeamID={currentTeamID}
              onSwitchTeam={handleSwitchTeam}
              renderActions={(t) => (
                <SmallButton onClick={() => handleLeave(t.id)} variant="ghost">
                  Leave
                </SmallButton>
              )}
            />
          </div>

          {/* backend hint */}
          <div className="mt-10 p-4 border border-dashed border-border text-[12px] text-muted font-tight bg-surface">
            <strong className="font-bold text-ink">Frontend preview.</strong> Teams + invites live in
            this browser only until auth ships. Once it does, invites send real
            emails, members sync across devices, and plays can be scoped to a team.
          </div>
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
  currentTeamID,
  onSwitchTeam,
  renderActions,
  accent,
  inviteRowFor,
  onInviteSubmit,
  onInviteCancel,
}: {
  heading: string;
  empty: string;
  teams: Team[];
  currentTeamID?: string;
  onSwitchTeam?: (id: string) => void;
  renderActions: (team: Team) => React.ReactNode;
  accent?: boolean;
  inviteRowFor?: string | null;
  onInviteSubmit?: (teamID: string, email: string) => void;
  onInviteCancel?: () => void;
}) {
  return (
    <section>
      <h2
        className={[
          'text-[10px] font-bold tracking-[0.18em] uppercase font-tight mb-3 pb-2 border-b border-hairline',
          accent ? 'text-accent' : 'text-muted',
        ].join(' ')}
      >
        {heading}
      </h2>
      {teams.length === 0 ? (
        <p className="text-[12px] text-faint font-tight">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {teams.map((t) => {
            const active = t.id === currentTeamID;
            return (
              <li key={t.id}>
                <div
                  className={[
                    'flex items-center gap-3 px-3 py-3 rounded-md border bg-bg transition-colors',
                    active ? 'border-accent' : 'border-border hover:border-ink',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-md flex-shrink-0 text-[11px] font-bold tracking-[0.04em] text-white"
                    style={{ background: t.color }}
                  >
                    {t.shortName}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[14px] font-bold text-ink font-tight truncate">
                        {t.name}
                      </span>
                      {active && (
                        <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-accent font-tight flex-shrink-0">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-medium text-faint font-tight mt-0.5">
                      {t.memberCount} {t.memberCount === 1 ? 'member' : 'members'} ·{' '}
                      {new Date(t.joinedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {onSwitchTeam && !active && (
                      <SmallButton onClick={() => onSwitchTeam(t.id)} variant="ghost">
                        Switch
                      </SmallButton>
                    )}
                    {renderActions(t)}
                  </div>
                </div>
                {inviteRowFor === t.id && onInviteSubmit && onInviteCancel && (
                  <InviteForm teamName={t.name} onSubmit={(email) => onInviteSubmit(t.id, email)} onCancel={onInviteCancel} />
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
        onCreate(name, shortName || name.slice(0, 3), color);
      }}
      className="mt-2 mb-2 p-4 border border-border bg-surface flex flex-col gap-3"
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
            className="bg-bg border border-border px-3 py-2 text-[13px] text-ink font-tight focus-visible:outline-none focus-visible:border-ink"
          />
        </label>
        <label className="sm:w-[110px] flex flex-col gap-1.5">
          <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted font-tight">
            Short
          </span>
          <input
            type="text"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            maxLength={4}
            placeholder="BOS"
            className="bg-bg border border-border px-3 py-2 text-[13px] text-ink font-tight tabular uppercase tracking-[0.06em] focus-visible:outline-none focus-visible:border-ink"
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
  onSubmit: (email: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email);
      }}
      className="mt-1.5 ml-12 p-3 border border-accent border-dashed bg-surface flex items-center gap-2 flex-wrap"
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
        className="flex-1 min-w-[180px] bg-bg border border-border px-2 py-1.5 text-[12px] text-ink font-tight focus-visible:outline-none focus-visible:border-ink"
      />
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
}) {
  const base =
    'inline-flex items-center px-2.5 py-1.5 text-[10px] font-bold tracking-[0.14em] uppercase font-tight cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  const variantCls =
    variant === 'primary'
      ? 'bg-ink text-bg hover:opacity-90 border border-ink'
      : variant === 'danger'
        ? 'bg-transparent text-faint hover:text-accent border border-transparent'
        : 'bg-transparent text-muted hover:text-ink border border-border';
  return (
    <button type={type} onClick={onClick} className={`${base} ${variantCls}`}>
      {children}
    </button>
  );
}
