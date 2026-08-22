'use client';

// /playbook/roster — the "Team" surface.
//
// A roster player is an ATHLETE, deliberately decoupled from an app login: a
// coach enters all 25 names on day one without waiting for anyone to sign up.
// pb_team_members stays what it is — who can SEE and EDIT the playbook.
//
// Roster is team-scoped by definition, so the personal scope shows a prompt to
// pick a team instead of an empty list.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlaybookShell } from './playbook-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { TeamLines } from './team-lines';
import {
  addRosterPlayer,
  deleteRosterPlayer,
  listMyTeams,
  listRoster,
  reorderRoster,
  updateRosterPlayer,
  type RosterPlayer,
  type RosterPosition,
  type Team,
} from '@/lib/playbook/data';
import { formatSupabaseError } from '@/lib/supabase/errors';

const POSITIONS: Array<{ value: RosterPosition; label: string }> = [
  { value: 'handler', label: 'Handler' },
  { value: 'cutter', label: 'Cutter' },
  { value: 'hybrid', label: 'Hybrid' },
];

export function TeamRoster() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [scopeID, setScopeID] = useState<string | undefined>(undefined);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingID, setEditingID] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RosterPlayer | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [tab, setTab] = useState<'roster' | 'lines'>('roster');

  const currentTeam = teams.find((t) => t.id === scopeID);
  const canEdit = currentTeam?.role === 'owner' || currentTeam?.role === 'coach';

  // Load teams once, then default the scope to the first team the user has —
  // the roster is meaningless in personal scope, so landing on a team is the
  // useful default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await listMyTeams();
        if (cancelled) return;
        setTeams(t);
        if (t.length > 0) setScopeID(t[0].id);
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

  const refreshRoster = useCallback(async (teamID: string) => {
    setRosterLoading(true);
    try {
      setError(null);
      setRoster(await listRoster(teamID));
    } catch (err) {
      setError(formatSupabaseError(err, 'Load roster'));
      console.error('[team-roster] listRoster failed', err);
    } finally {
      setRosterLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!scopeID) {
      setRoster([]);
      return;
    }
    refreshRoster(scopeID);
  }, [scopeID, refreshRoster]);

  const handleAdd = useCallback(
    async (input: { name: string; number: string; position: RosterPosition }) => {
      if (!scopeID) return;
      try {
        setError(null);
        const created = await addRosterPlayer({
          teamID: scopeID,
          name: input.name,
          number: input.number,
          position: input.position,
        });
        setRoster((prev) => [...prev, created]);
      } catch (err) {
        setError(formatSupabaseError(err, 'Add player'));
        console.error('[team-roster] addRosterPlayer failed', err);
      }
    },
    [scopeID],
  );

  const handleUpdate = useCallback(
    async (id: string, patch: Partial<RosterPlayer>) => {
      try {
        setError(null);
        const updated = await updateRosterPlayer(id, patch);
        setRoster((prev) => prev.map((p) => (p.id === id ? updated : p)));
        setEditingID(null);
      } catch (err) {
        setError(formatSupabaseError(err, 'Save player'));
        console.error('[team-roster] updateRosterPlayer failed', err);
      }
    },
    [],
  );

  const handleRemove = useCallback(async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      setError(null);
      await deleteRosterPlayer(removing.id);
      setRoster((prev) => prev.filter((p) => p.id !== removing.id));
      setRemoving(null);
    } catch (err) {
      setError(formatSupabaseError(err, 'Remove player'));
      console.error('[team-roster] deleteRosterPlayer failed', err);
      setRemoving(null);
    } finally {
      setRemoveBusy(false);
    }
  }, [removing]);

  // Move a player one slot up/down. Optimistic — the list reorders immediately,
  // then the new order is persisted.
  const handleMove = useCallback(
    async (id: string, direction: -1 | 1) => {
      if (!scopeID) return;
      const idx = roster.findIndex((p) => p.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= roster.length) return;

      const next = [...roster];
      [next[idx], next[target]] = [next[target], next[idx]];
      setRoster(next);
      try {
        await reorderRoster(
          scopeID,
          next.map((p) => p.id),
        );
      } catch (err) {
        setError(formatSupabaseError(err, 'Reorder roster'));
        console.error('[team-roster] reorderRoster failed', err);
        refreshRoster(scopeID);
      }
    },
    [roster, scopeID, refreshRoster],
  );

  const active = useMemo(() => roster.filter((p) => p.active), [roster]);
  const benched = useMemo(() => roster.filter((p) => !p.active), [roster]);
  const counts = useMemo(() => {
    const byPos = { handler: 0, cutter: 0, hybrid: 0 };
    for (const p of active) byPos[p.position]++;
    return byPos;
  }, [active]);

  return (
    <PlaybookShell
      teams={teams}
      currentTeamID={scopeID}
      onSwitchTeam={(id) => setScopeID(id)}
      pageTitle="Team"
    >
      <div className="px-4 pt-4 pb-12 lg:px-8 lg:pt-6 lg:pb-12">
        <div className="max-w-[860px] mx-auto">
          <div className="mb-6 lg:mb-8">
            <h1 className="m-0 font-display italic text-[28px] lg:text-[36px] font-bold tracking-[-0.02em] leading-[0.95] text-ink">
              {currentTeam?.name ?? 'Team'}
            </h1>
            <p className="text-muted font-medium font-tight mt-2 text-[13px] lg:text-[14px]">
              Your roster of athletes. Players here don&rsquo;t need an account —
              add everyone now, link logins later.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2"
            >
              {error}
            </div>
          )}

          {!hydrated ? (
            <p className="text-[12px] text-faint font-tight">Loading…</p>
          ) : teams.length === 0 ? (
            <EmptyState
              title="No teams yet"
              body="A roster belongs to a team. Create one on the Teams page, then come back here to add players."
              href="/playbook/teams"
              cta="Go to Teams"
            />
          ) : !scopeID ? (
            <EmptyState
              title="Pick a team"
              body="Rosters are per-team. Use the team switcher to choose one."
            />
          ) : (
            <>
              {/* Roster / Lines switch. Two options, so a segmented control
                  rather than a dropdown. */}
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
                      tab === t
                        ? 'bg-surface text-ink shadow-soft'
                        : 'text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {t === 'roster' ? 'Roster' : 'Lines'}
                  </button>
                ))}
              </div>

              {tab === 'lines' ? (
                <TeamLines teamID={scopeID} roster={roster} canEdit={canEdit} />
              ) : (
                <>
              {/* Squad summary — reads at a glance whether the lines will work. */}
              <div className="flex flex-wrap gap-2 mb-5">
                <StatChip label="Active" value={active.length} />
                <StatChip label="Handlers" value={counts.handler} />
                <StatChip label="Cutters" value={counts.cutter} />
                <StatChip label="Hybrid" value={counts.hybrid} />
                {benched.length > 0 && <StatChip label="Benched" value={benched.length} muted />}
              </div>

              {canEdit && <AddPlayerForm onAdd={handleAdd} />}

              {rosterLoading ? (
                <p className="text-[12px] text-faint font-tight mt-4">Loading roster…</p>
              ) : roster.length === 0 ? (
                <p className="text-[12px] text-faint font-tight mt-4">
                  {canEdit
                    ? 'No players yet — add your first above.'
                    : 'No players on this roster yet.'}
                </p>
              ) : (
                <div className="flex flex-col gap-7 mt-6">
                  <RosterSection
                    heading={`Active · ${active.length}`}
                    players={active}
                    roster={roster}
                    canEdit={canEdit}
                    editingID={editingID}
                    onEdit={setEditingID}
                    onCancelEdit={() => setEditingID(null)}
                    onSave={handleUpdate}
                    onRemove={setRemoving}
                    onMove={handleMove}
                  />
                  {benched.length > 0 && (
                    <RosterSection
                      heading={`Benched · ${benched.length}`}
                      players={benched}
                      roster={roster}
                      canEdit={canEdit}
                      editingID={editingID}
                      onEdit={setEditingID}
                      onCancelEdit={() => setEditingID(null)}
                      onSave={handleUpdate}
                      onRemove={setRemoving}
                      onMove={handleMove}
                    />
                  )}
                </div>
              )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? 'this player'}?`}
        body="They'll be taken off the roster entirely. To keep them for history instead, bench them."
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={removeBusy}
        onConfirm={handleRemove}
        onCancel={() => setRemoving(null)}
      />
    </PlaybookShell>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────

function RosterSection({
  heading,
  players,
  roster,
  canEdit,
  editingID,
  onEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onMove,
}: {
  heading: string;
  players: RosterPlayer[];
  roster: RosterPlayer[];
  canEdit: boolean;
  editingID: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (id: string, patch: Partial<RosterPlayer>) => void;
  onRemove: (player: RosterPlayer) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <section>
      <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase font-tight mb-3 pb-2 border-b border-hairline text-muted">
        {heading}
      </h2>
      <ul className="flex flex-col gap-2">
        {players.map((p) => {
          // Move bounds are relative to the WHOLE roster, not the section —
          // sort_order is one list, split visually by active/benched.
          const idx = roster.findIndex((r) => r.id === p.id);
          return (
            <li key={p.id}>
              {editingID === p.id ? (
                <EditPlayerRow
                  player={p}
                  onSave={(patch) => onSave(p.id, patch)}
                  onCancel={onCancelEdit}
                />
              ) : (
                <PlayerRow
                  player={p}
                  canEdit={canEdit}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < roster.length - 1}
                  onEdit={() => onEdit(p.id)}
                  onToggleActive={() => onSave(p.id, { active: !p.active })}
                  onRemove={() => onRemove(p)}
                  onMove={(dir) => onMove(p.id, dir)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlayerRow({
  player,
  canEdit,
  canMoveUp,
  canMoveDown,
  onEdit,
  onToggleActive,
  onRemove,
  onMove,
}: {
  player: RosterPlayer;
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-3 rounded-card bg-surface shadow-card transition-shadow hover:shadow-lift',
        player.active ? '' : 'opacity-60',
      ].join(' ')}
    >
      {/* Jersey number badge. Falls back to a dash so the row grid stays
          aligned when a number hasn't been assigned yet. */}
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 bg-ink/5 text-[13px] font-bold text-ink font-tight tabular"
      >
        {player.number ?? '—'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-ink font-tight truncate">{player.name}</div>
        <div className="text-[11px] font-medium text-faint font-tight mt-0.5">
          {POSITIONS.find((o) => o.value === player.position)?.label}
          {player.userID && ' · linked'}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <div className="flex items-center gap-0.5">
            <IconButton label={`Move ${player.name} up`} disabled={!canMoveUp} onClick={() => onMove(-1)}>
              <ArrowGlyph direction="up" />
            </IconButton>
            <IconButton
              label={`Move ${player.name} down`}
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
            >
              <ArrowGlyph direction="down" />
            </IconButton>
          </div>
          <SmallButton onClick={onEdit} variant="ghost">
            Edit
          </SmallButton>
          <SmallButton onClick={onToggleActive} variant="ghost">
            {player.active ? 'Bench' : 'Activate'}
          </SmallButton>
          <SmallButton onClick={onRemove} variant="danger">
            Remove
          </SmallButton>
        </div>
      )}
    </div>
  );
}

function EditPlayerRow({
  player,
  onSave,
  onCancel,
}: {
  player: RosterPlayer;
  onSave: (patch: Partial<RosterPlayer>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [number, setNumber] = useState(player.number ?? '');
  const [position, setPosition] = useState<RosterPosition>(player.position);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onSave({ name: trimmed, number: number.trim() || null, position });
      }}
      className="p-3 rounded-card bg-surface shadow-card flex items-center gap-2 flex-wrap"
    >
      <label className="sr-only" htmlFor={`roster-number-${player.id}`}>
        Jersey number
      </label>
      <input
        id={`roster-number-${player.id}`}
        type="text"
        inputMode="numeric"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        maxLength={4}
        placeholder="#"
        className="w-[60px] bg-bg border border-border px-2 py-2 text-[13px] text-ink font-tight tabular text-center rounded focus-visible:outline-none focus-visible:border-ink"
      />
      <label className="sr-only" htmlFor={`roster-name-${player.id}`}>
        Player name
      </label>
      <input
        id={`roster-name-${player.id}`}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
        maxLength={80}
        className="flex-1 min-w-[160px] bg-bg border border-border px-3 py-2 text-[13px] text-ink font-tight rounded focus-visible:outline-none focus-visible:border-ink"
      />
      <label className="sr-only" htmlFor={`roster-position-${player.id}`}>
        Position
      </label>
      <select
        id={`roster-position-${player.id}`}
        value={position}
        onChange={(e) => setPosition(e.target.value as RosterPosition)}
        className="bg-bg border border-border px-2 py-2 text-[11px] font-bold tracking-[0.14em] uppercase text-ink font-tight rounded cursor-pointer focus-visible:outline-none focus-visible:border-ink"
      >
        {POSITIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <SmallButton onClick={() => {}} variant="primary" type="submit">
        Save
      </SmallButton>
      <SmallButton onClick={onCancel} variant="ghost" type="button">
        Cancel
      </SmallButton>
    </form>
  );
}

function AddPlayerForm({
  onAdd,
}: {
  onAdd: (input: { name: string; number: string; position: RosterPosition }) => void;
}) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState<RosterPosition>('hybrid');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onAdd({ name: trimmed, number: number.trim(), position });
        // Keep position sticky — a coach usually enters handlers in a run.
        setName('');
        setNumber('');
      }}
      className="p-4 bg-surface flex items-center gap-2 flex-wrap rounded-card shadow-card"
    >
      <label className="sr-only" htmlFor="add-roster-number">
        Jersey number
      </label>
      <input
        id="add-roster-number"
        type="text"
        inputMode="numeric"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        maxLength={4}
        placeholder="#"
        className="w-[60px] bg-bg border border-border px-2 py-2 text-[13px] text-ink font-tight tabular text-center rounded focus-visible:outline-none focus-visible:border-ink"
      />
      <label className="sr-only" htmlFor="add-roster-name">
        Player name
      </label>
      <input
        id="add-roster-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Add a player…"
        maxLength={80}
        className="flex-1 min-w-[160px] bg-bg border border-border px-3 py-2 text-[13px] text-ink font-tight rounded focus-visible:outline-none focus-visible:border-ink"
      />
      <label className="sr-only" htmlFor="add-roster-position">
        Position
      </label>
      <select
        id="add-roster-position"
        value={position}
        onChange={(e) => setPosition(e.target.value as RosterPosition)}
        className="bg-bg border border-border px-2 py-2 text-[11px] font-bold tracking-[0.14em] uppercase text-ink font-tight rounded cursor-pointer focus-visible:outline-none focus-visible:border-ink"
      >
        {POSITIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <SmallButton onClick={() => {}} variant="primary" type="submit">
        Add
      </SmallButton>
    </form>
  );
}

function StatChip({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-full bg-ink/5',
        muted ? 'text-faint' : 'text-ink',
      ].join(' ')}
    >
      <span className="text-[13px] font-bold font-tight tabular">{value}</span>
      <span className="text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted">
        {label}
      </span>
    </span>
  );
}

function EmptyState({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="p-6 rounded-card bg-surface shadow-card flex flex-col items-start gap-2">
      <span className="text-[14px] font-bold text-ink font-tight">{title}</span>
      <p className="text-[13px] text-muted font-medium font-tight m-0">{body}</p>
      {href && cta && (
        <a
          href={href}
          className={[
            'mt-2 inline-flex items-center px-5 py-3 rounded-full cursor-pointer',
            'bg-ink text-bg hover:opacity-90 transition-opacity',
            'font-tight text-[11px] font-bold tracking-[0.16em] uppercase',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          {cta}
        </a>
      )}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center w-7 h-7 rounded-full text-muted transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        disabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer hover:text-ink hover:bg-ink/5',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ArrowGlyph({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={direction === 'up' ? 'rotate-180' : ''}
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
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
