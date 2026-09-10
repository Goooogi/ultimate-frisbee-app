'use client';

// /playbook/teams — the Team landing page (ported from mobile, Hunter
// 2026-09-09). The landing page IS the team: a switcher chip strip (only
// when you have more than one), the selected team's card (→ detail page:
// members with roles, invites, rename/delete/leave), then the roster and
// lines right here. No Owned / Coaching / Member grouping any more, and no
// Leave action on this page.
//
// Selection defaults to the first owned team, else the first team, and is
// mirrored into the app-wide playbook scope pref so Plays follows along.
// TeamRosterPanel stays mounted under both tabs (hidden under Lines) because
// it holds the roster TeamLines depends on; both are keyed by team id so a
// switch remounts them clean.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PlaybookShell } from './playbook-shell';
import { TeamRosterPanel } from './team-roster';
import { TeamLines } from './team-lines';
import { TEAM_COLORS } from '@/lib/playbook/teams';
import { createTeam, listMyTeams, type RosterPlayer, type Team } from '@/lib/playbook/data';
import { formatSupabaseError } from '@/lib/supabase/errors';
import { loadScopePref, saveScopePref } from '@/lib/playbook/scope-pref';

const ROLE_LABEL: Record<Team['role'], string> = { owner: 'Owner', coach: 'Coach', member: 'Member' };

export function ManageTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedID, setSelectedID] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<'roster' | 'lines'>('roster');
  const [roster, setRoster] = useState<RosterPlayer[]>([]);

  const refresh = useCallback(async () => {
    try {
      setTeams(await listMyTeams());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load teams.');
    } finally {
      setHydrated(true);
    }
  }, []);

  // First load: teams + the account's persisted scope. Prefer that scope when
  // it's one of these teams ('personal' means nothing here), else the first
  // owned team, else the first team.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, pref] = await Promise.all([listMyTeams(), loadScopePref()]);
        if (cancelled) return;
        setTeams(t);
        const preferred =
          pref && pref !== 'personal' && t.some((tm) => tm.id === pref)
            ? pref
            : (t.find((tm) => tm.role === 'owner') ?? t[0])?.id;
        if (preferred) setSelectedID(preferred);
      } catch (err) {
        if (!cancelled) setError(formatSupabaseError(err, 'Load teams'));
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the selection valid as teams change (a just-created team gets
  // selected; a deleted one falls back).
  useEffect(() => {
    if (teams.length === 0) return;
    if (selectedID && teams.some((t) => t.id === selectedID)) return;
    setSelectedID((teams.find((t) => t.role === 'owner') ?? teams[0]).id);
  }, [teams, selectedID]);

  const selectTeam = useCallback((id: string) => {
    setSelectedID(id);
    setTab('roster');
    saveScopePref(id);
  }, []);

  const handleCreate = useCallback(
    async (name: string, shortName: string, color: string) => {
      try {
        setError(null);
        const created = await createTeam({ name, shortName, color });
        setShowCreate(false);
        await refresh();
        selectTeam(created.id);
      } catch (err) {
        setError(formatSupabaseError(err, 'Create team'));
        console.error('[manage-teams] createTeam failed', err);
      }
    },
    [refresh, selectTeam],
  );

  const selected = teams.find((t) => t.id === selectedID) ?? null;
  const canManage = selected?.role === 'owner' || selected?.role === 'coach';

  return (
    <PlaybookShell teams={teams} currentTeamID={selectedID} onSwitchTeam={selectTeam} pageTitle="Team">
      {/* Bottom padding clears the fixed mobile tab bar + home-indicator safe
          area (same recipe as the home page). */}
      <div className="px-4 pt-4 pb-[calc(max(env(safe-area-inset-bottom),0.75rem)+96px)] lg:px-8 lg:pt-6 lg:pb-12">
        <div className="max-w-[860px] mx-auto">
          <div className="flex items-center justify-between gap-4 mb-5 lg:mb-6">
            <h1 className="m-0 font-display italic text-[28px] lg:text-[36px] font-bold tracking-[-0.02em] leading-[0.95] text-ink">
              Team
            </h1>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className={[
                'inline-flex items-center gap-2 px-5 py-3 rounded-full cursor-pointer',
                'bg-ink text-bg hover:opacity-90 transition-opacity',
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
          ) : teams.length === 0 ? (
            <div className="p-6 rounded-card bg-surface shadow-card flex flex-col items-start gap-2">
              <span className="text-[14px] font-bold text-ink font-tight">No teams yet</span>
              <p className="text-[13px] text-muted font-medium font-tight m-0">
                Create one above, or ask a coach for an invite.
              </p>
            </div>
          ) : (
            <>
              {/* Team switcher — only when there is something to switch between. */}
              {teams.length > 1 && (
                <div
                  role="tablist"
                  aria-label="Your teams"
                  className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 mb-4"
                >
                  {teams.map((t) => {
                    const active = t.id === selectedID;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => selectTeam(t.id)}
                        className={[
                          'inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full flex-shrink-0 cursor-pointer transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          active ? 'bg-ink text-bg' : 'bg-surface shadow-card text-muted hover:text-ink',
                        ].join(' ')}
                      >
                        <TeamBadge team={t} size="sm" />
                        <span className="text-[12px] font-bold font-tight whitespace-nowrap">{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selected && (
                <>
                  {/* Selected team → members / roles / invites / manage. */}
                  <Link
                    href={`/playbook/teams/${selected.id}`}
                    className="flex items-center gap-3 px-3 py-3 mb-5 rounded-card bg-surface shadow-card transition-shadow hover:shadow-lift no-underline"
                  >
                    <TeamBadge team={selected} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-bold text-ink font-tight truncate">{selected.name}</div>
                      <div className="text-[11px] font-medium text-faint font-tight mt-0.5">
                        {selected.memberCount} {selected.memberCount === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                    <span
                      className={[
                        'text-[10px] font-bold tracking-[0.16em] uppercase font-tight rounded-full px-2.5 py-1 flex-shrink-0',
                        selected.role === 'owner' ? 'text-accent bg-accent/10' : 'text-muted bg-ink/5',
                      ].join(' ')}
                    >
                      {ROLE_LABEL[selected.role]}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-faint flex-shrink-0">
                      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                    </svg>
                  </Link>

                  {/* Roster / Lines — two options, so a segmented control. */}
                  <div
                    role="tablist"
                    aria-label="Team sections"
                    className="flex items-center gap-1 p-1 mb-5 rounded-full bg-ink/5 w-fit"
                  >
                    {(['roster', 'lines'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
                        className={[
                          'px-4 py-2 rounded-full cursor-pointer transition-colors',
                          'text-[10px] font-bold tracking-[0.16em] uppercase font-tight',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          tab === t ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink',
                        ].join(' ')}
                      >
                        {t === 'roster' ? 'Roster' : 'Lines'}
                      </button>
                    ))}
                  </div>

                  <div className={tab === 'roster' ? '' : 'hidden'}>
                    <TeamRosterPanel
                      key={selected.id}
                      teamID={selected.id}
                      canEdit={canManage}
                      onRosterChange={setRoster}
                    />
                  </div>
                  {tab === 'lines' && (
                    <TeamLines key={selected.id} teamID={selected.id} roster={roster} canEdit={canManage} />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </PlaybookShell>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────

/** Team color disc with the short name — the badge every team row/chip uses.
 *  The color is user-chosen data, so it has to be an inline background. */
export function TeamBadge({ team, size }: { team: Pick<Team, 'color' | 'shortName'>; size: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-flex items-center justify-center rounded-full flex-shrink-0 font-bold tracking-[0.04em] text-white',
        size === 'sm' ? 'w-6 h-6 text-[8px]' : 'w-10 h-10 text-[11px]',
      ].join(' ')}
      style={{ background: team.color }}
    >
      {team.shortName}
    </span>
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
  // Field-level validation belongs next to the field, not in a modal.
  const [shortNameError, setShortNameError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const sn = (shortName || name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!sn || sn.length < 2) {
          setShortNameError('Short name needs 2–4 letters or numbers.');
          return;
        }
        setShortNameError(null);
        onCreate(name, sn, color);
      }}
      className="mt-2 mb-2 p-4 bg-surface flex flex-col gap-3 rounded-card shadow-card"
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
            onChange={(e) => {
              setShortName(e.target.value.toUpperCase());
              if (shortNameError) setShortNameError(null);
            }}
            maxLength={4}
            aria-invalid={shortNameError ? true : undefined}
            aria-describedby={shortNameError ? 'create-team-short-error' : undefined}
            placeholder="BOS"
            className="bg-bg border border-border px-3 py-2 text-[13px] text-ink font-tight tabular uppercase tracking-[0.06em] focus-visible:outline-none focus-visible:border-ink rounded"
          />
        </label>
      </div>
      {shortNameError && (
        <p id="create-team-short-error" role="alert" className="text-[12px] text-live font-tight">
          {shortNameError}
        </p>
      )}
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
    'inline-flex items-center px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] uppercase font-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full disabled:opacity-50 disabled:pointer-events-none';
  const variantCls =
    variant === 'primary'
      ? 'bg-ink text-bg hover:opacity-90'
      : variant === 'danger'
        ? 'bg-transparent text-faint hover:text-live'
        : 'bg-ink/5 text-muted hover:text-ink hover:bg-ink/10';
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
