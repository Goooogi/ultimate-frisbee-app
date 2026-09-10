'use client';

// Team roster panel — the athlete list for ONE team, rendered inline on the
// Team landing page (/playbook/teams, manage-teams.tsx) under its Roster tab.
//
// A roster player is an ATHLETE, deliberately decoupled from an app login: a
// coach enters all 25 names on day one without waiting for anyone to sign up.
// pb_team_members stays what it is — who can SEE and EDIT the playbook.
//
// The panel owns the roster state for its team and reports it up through
// `onRosterChange` so the Lines tab (TeamLines) can build units from it. The
// landing page keys it by team id, so a team switch remounts it clean.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  addRosterPlayer,
  deleteRosterPlayer,
  listRoster,
  updateRosterPlayer,
  type RosterPlayer,
  type RosterPosition,
} from '@/lib/playbook/data';
import { formatSupabaseError } from '@/lib/supabase/errors';

const POSITIONS: Array<{ value: RosterPosition; label: string }> = [
  { value: 'handler', label: 'Handler' },
  { value: 'cutter', label: 'Cutter' },
  { value: 'hybrid', label: 'Hybrid' },
];

export function TeamRosterPanel({
  teamID,
  canEdit,
  onRosterChange,
}: {
  teamID: string;
  canEdit: boolean;
  onRosterChange?: (roster: RosterPlayer[]) => void;
}) {
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingID, setEditingID] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RosterPlayer | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRosterLoading(true);
      try {
        setError(null);
        const rows = await listRoster(teamID);
        if (!cancelled) setRoster(rows);
      } catch (err) {
        if (!cancelled) setError(formatSupabaseError(err, 'Load roster'));
        console.error('[team-roster] listRoster failed', err);
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamID]);

  useEffect(() => {
    onRosterChange?.(roster);
  }, [roster, onRosterChange]);

  const handleAdd = useCallback(
    async (input: { name: string; number: string; position: RosterPosition }) => {
      try {
        setError(null);
        const created = await addRosterPlayer({
          teamID,
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
    [teamID],
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

  const active = useMemo(() => roster.filter((p) => p.active), [roster]);
  const benched = useMemo(() => roster.filter((p) => !p.active), [roster]);
  const counts = useMemo(() => {
    const byPos = { handler: 0, cutter: 0, hybrid: 0 };
    for (const p of active) byPos[p.position]++;
    return byPos;
  }, [active]);

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2"
        >
          {error}
        </div>
      )}

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
          {canEdit ? 'No players yet — add your first above.' : 'No players on this roster yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-7 mt-6">
          <RosterSection
            heading={`Active · ${active.length}`}
            players={active}
            canEdit={canEdit}
            editingID={editingID}
            onEdit={setEditingID}
            onCancelEdit={() => setEditingID(null)}
            onSave={handleUpdate}
            onRemove={setRemoving}
          />
          {benched.length > 0 && (
            <RosterSection
              heading={`Benched · ${benched.length}`}
              players={benched}
              canEdit={canEdit}
              editingID={editingID}
              onEdit={setEditingID}
              onCancelEdit={() => setEditingID(null)}
              onSave={handleUpdate}
              onRemove={setRemoving}
            />
          )}
        </div>
      )}

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
    </>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────

function RosterSection({
  heading,
  players,
  canEdit,
  editingID,
  onEdit,
  onCancelEdit,
  onSave,
  onRemove,
}: {
  heading: string;
  players: RosterPlayer[];
  canEdit: boolean;
  editingID: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (id: string, patch: Partial<RosterPlayer>) => void;
  onRemove: (player: RosterPlayer) => void;
}) {
  return (
    <section>
      <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase font-tight mb-3 pb-2 border-b border-hairline text-muted">
        {heading}
      </h2>
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
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
                onEdit={() => onEdit(p.id)}
                onRemove={() => onRemove(p)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Slimmed 2026-08-27 (Hunter): the row is read-mostly — reorder arrows and the
// Bench toggle moved out (benching now lives in the Edit form's Active
// checkbox), and Remove is a trash icon. Two actions keep the row calm on a
// phone-width card.
function PlayerRow({
  player,
  canEdit,
  onEdit,
  onRemove,
}: {
  player: RosterPlayer;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
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
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <SmallButton onClick={onEdit} variant="ghost">
            Edit
          </SmallButton>
          <IconButton label={`Remove ${player.name}`} onClick={onRemove} danger>
            <TrashGlyph />
          </IconButton>
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
  // Benching lives here now — the row's Bench/Activate button was removed
  // (Hunter, 2026-08-27), and the removal dialog still points coaches at
  // benching, so the Edit form is where a player's availability is set.
  const [active, setActive] = useState(player.active);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onSave({ name: trimmed, number: number.trim() || null, position, active });
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
      <label className="inline-flex items-center gap-1.5 px-2 py-2 text-[11px] font-bold tracking-[0.14em] uppercase text-muted font-tight cursor-pointer select-none">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="cursor-pointer accent-current"
        />
        Active
      </label>
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
      // One line at every width (Hunter, 2026-08-27): no flex-wrap — the name
      // input yields (min-w-0) instead of pushing Add onto its own row.
      className="p-4 bg-surface flex items-center gap-2 rounded-card shadow-card"
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
        className="flex-1 min-w-0 bg-bg border border-border px-3 py-2 text-[13px] text-ink font-tight rounded focus-visible:outline-none focus-visible:border-ink"
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

function IconButton({
  children,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Destructive action — hover turns the live/danger red instead of ink. */
  danger?: boolean;
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
        disabled
          ? 'opacity-30 pointer-events-none'
          : danger
            ? 'cursor-pointer hover:text-live hover:bg-live/10'
            : 'cursor-pointer hover:text-ink hover:bg-ink/5',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function TrashGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 3h9M4.5 3V1.75h3V3M2.5 3l.5 7.25h6L9.5 3M4.9 5v3.5M7.1 5v3.5" />
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
