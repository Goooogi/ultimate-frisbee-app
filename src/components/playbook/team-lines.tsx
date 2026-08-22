'use client';

// Lines — named units (O-line, D-line, zone) drawn from the team roster.
//
// Deliberately NOT capped at 7: coaches keep 8-9 per unit and sub, so a hard
// cap would fight real usage. The UI flags a line that can't field seven, and
// notes when a line is carrying subs, rather than blocking either.
//
// A benched player stays on their line, rendered struck-through — dropping
// them silently would quietly change a coach's unit behind their back.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  createLine,
  deleteLine,
  listLines,
  setLinePlayers,
  updateLine,
  type Line,
  type LineKind,
  type RosterPlayer,
} from '@/lib/playbook/data';
import { PLAYER_COUNT } from '@/lib/playbook/types';
import { formatSupabaseError } from '@/lib/supabase/errors';

const KINDS: Array<{ value: LineKind; label: string }> = [
  { value: 'offense', label: 'Offense' },
  { value: 'defense', label: 'Defense' },
  { value: 'special', label: 'Special' },
  { value: 'other', label: 'Other' },
];

export function TeamLines({
  teamID,
  roster,
  canEdit,
}: {
  teamID: string;
  roster: RosterPlayer[];
  canEdit: boolean;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingID, setEditingID] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Line | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const byID = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      setLines(await listLines(teamID));
    } catch (err) {
      setError(formatSupabaseError(err, 'Load lines'));
      console.error('[team-lines] listLines failed', err);
    } finally {
      setLoading(false);
    }
  }, [teamID]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = useCallback(
    async (name: string, kind: LineKind) => {
      try {
        setError(null);
        const created = await createLine({ teamID, name, kind });
        setLines((prev) => [...prev, created]);
        setShowCreate(false);
        // Drop straight into the picker — a line with no players is useless,
        // so the next thing the coach wants is always "add people".
        setEditingID(created.id);
      } catch (err) {
        setError(formatSupabaseError(err, 'Create line'));
        console.error('[team-lines] createLine failed', err);
      }
    },
    [teamID],
  );

  const handleSaveMembers = useCallback(
    async (lineID: string, playerIDs: string[]) => {
      try {
        setError(null);
        await setLinePlayers(lineID, playerIDs);
        setLines((prev) => prev.map((l) => (l.id === lineID ? { ...l, playerIDs } : l)));
        setEditingID(null);
      } catch (err) {
        setError(formatSupabaseError(err, 'Save line'));
        console.error('[team-lines] setLinePlayers failed', err);
      }
    },
    [],
  );

  const handleRename = useCallback(async (lineID: string, name: string, kind: LineKind) => {
    try {
      setError(null);
      await updateLine(lineID, { name, kind });
      setLines((prev) => prev.map((l) => (l.id === lineID ? { ...l, name, kind } : l)));
    } catch (err) {
      setError(formatSupabaseError(err, 'Rename line'));
      console.error('[team-lines] updateLine failed', err);
    }
  }, []);

  const handleRemove = useCallback(async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      setError(null);
      await deleteLine(removing.id);
      setLines((prev) => prev.filter((l) => l.id !== removing.id));
      setRemoving(null);
    } catch (err) {
      setError(formatSupabaseError(err, 'Delete line'));
      console.error('[team-lines] deleteLine failed', err);
      setRemoving(null);
    } finally {
      setRemoveBusy(false);
    }
  }, [removing]);

  if (loading) return <p className="text-[12px] text-faint font-tight">Loading lines…</p>;

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="mb-4 text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2"
        >
          {error}
        </div>
      )}

      {roster.length === 0 ? (
        <div className="p-6 rounded-card bg-surface shadow-card flex flex-col items-start gap-2">
          <span className="text-[14px] font-bold text-ink font-tight">Add players first</span>
          <p className="text-[13px] text-muted font-medium font-tight m-0">
            A line is drawn from your roster. Add players on the Roster tab, then build your units here.
          </p>
        </div>
      ) : (
        <>
          {canEdit && (
            <div className="mb-5">
              {showCreate ? (
                <CreateLineForm onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className={[
                    'inline-flex items-center gap-2 px-5 py-3 rounded-full cursor-pointer',
                    'bg-ink text-bg hover:opacity-90 transition-opacity',
                    'font-tight text-[11px] font-bold tracking-[0.16em] uppercase',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  ].join(' ')}
                >
                  + New line
                </button>
              )}
            </div>
          )}

          {lines.length === 0 ? (
            <p className="text-[12px] text-faint font-tight">
              {canEdit
                ? 'No lines yet — create your first above.'
                : 'No lines have been set up for this team yet.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line) => (
                <li key={line.id}>
                  {editingID === line.id ? (
                    <LinePicker
                      line={line}
                      roster={roster}
                      onSave={(ids) => handleSaveMembers(line.id, ids)}
                      onCancel={() => setEditingID(null)}
                    />
                  ) : (
                    <LineCard
                      line={line}
                      byID={byID}
                      canEdit={canEdit}
                      onEditMembers={() => setEditingID(line.id)}
                      onRename={(name, kind) => handleRename(line.id, name, kind)}
                      onRemove={() => setRemoving(line)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Delete “${removing?.name ?? 'this line'}”?`}
        body="The line is removed. Players stay on your roster."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={removeBusy}
        onConfirm={handleRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────

function LineCard({
  line,
  byID,
  canEdit,
  onEditMembers,
  onRename,
  onRemove,
}: {
  line: Line;
  byID: Map<string, RosterPlayer>;
  canEdit: boolean;
  onEditMembers: () => void;
  onRename: (name: string, kind: LineKind) => void;
  onRemove: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const players = line.playerIDs
    .map((id) => byID.get(id))
    .filter((p): p is RosterPlayer => !!p);
  const availableCount = players.filter((p) => p.active).length;
  const short = availableCount < PLAYER_COUNT;
  const subs = availableCount - PLAYER_COUNT;

  return (
    <div className="px-3 py-3 rounded-card bg-surface shadow-card transition-shadow hover:shadow-lift">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {renaming ? (
            <RenameLineForm
              line={line}
              onSave={(name, kind) => {
                onRename(name, kind);
                setRenaming(false);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <>
              <div className="text-[14px] font-bold text-ink font-tight truncate">{line.name}</div>
              <div className="text-[11px] font-medium font-tight mt-0.5 text-faint">
                {KINDS.find((k) => k.value === line.kind)?.label}
                {' · '}
                {/* Availability is what a coach actually needs at a glance:
                    can this unit field seven right now? */}
                <span className={short ? 'text-live' : undefined}>
                  {availableCount} available
                  {short && ` · need ${PLAYER_COUNT - availableCount} more`}
                  {subs > 0 && ` · ${subs} sub${subs === 1 ? '' : 's'}`}
                </span>
              </div>
            </>
          )}
        </div>
        {canEdit && !renaming && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <SmallButton onClick={onEditMembers} variant="primary">
              Players
            </SmallButton>
            <SmallButton onClick={() => setRenaming(true)} variant="ghost">
              Rename
            </SmallButton>
            <SmallButton onClick={onRemove} variant="danger">
              Delete
            </SmallButton>
          </div>
        )}
      </div>

      {players.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-3">
          {players.map((p) => (
            <li
              key={p.id}
              className={[
                'inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-full bg-ink/5',
                // A benched player stays visible but is clearly not available.
                p.active ? 'text-ink' : 'text-faint line-through',
              ].join(' ')}
            >
              {p.number && (
                <span className="text-[10px] font-bold font-tight tabular text-muted">
                  {p.number}
                </span>
              )}
              <span className="text-[12px] font-medium font-tight">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Membership picker. Two columns: the ordered line on the left, the rest of
 * the roster on the right. Order matters — it's the order chips 0..6 get
 * filled when the line is applied to a play.
 */
function LinePicker({
  line,
  roster,
  onSave,
  onCancel,
}: {
  line: Line;
  roster: RosterPlayer[];
  onSave: (playerIDs: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(line.playerIDs);
  const byID = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const availableCount = selected.filter((id) => byID.get(id)?.active).length;

  const add = (id: string) => setSelected((prev) => [...prev, id]);
  const remove = (id: string) => setSelected((prev) => prev.filter((x) => x !== id));
  const move = (id: string, dir: -1 | 1) =>
    setSelected((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const bench = roster.filter((p) => !selectedSet.has(p.id));

  return (
    <div className="p-4 rounded-card bg-surface shadow-card">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <span className="text-[13px] font-bold text-ink font-tight">{line.name}</span>
        <span
          className={[
            'text-[10px] font-bold tracking-[0.16em] uppercase font-tight',
            availableCount < PLAYER_COUNT ? 'text-live' : 'text-muted',
          ].join(' ')}
        >
          {availableCount} of {PLAYER_COUNT} available
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* On the line, in order */}
        <div>
          <h3 className="text-[10px] font-bold tracking-[0.16em] uppercase font-tight text-muted mb-2">
            On this line · {selected.length}
          </h3>
          {selected.length === 0 ? (
            <p className="text-[12px] text-faint font-tight">Add players from the right.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {selected.map((id, i) => {
                const p = byID.get(id);
                if (!p) return null;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-card-sm bg-bg"
                  >
                    {/* Slot number — this is the chip the player fills when the
                        line is applied to a play. */}
                    <span className="text-[10px] font-bold font-tight tabular text-faint w-4 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span
                      className={[
                        'text-[12px] font-medium font-tight truncate flex-1 min-w-0',
                        p.active ? 'text-ink' : 'text-faint line-through',
                      ].join(' ')}
                    >
                      {p.number ? `#${p.number} ` : ''}
                      {p.name}
                    </span>
                    <IconButton
                      label={`Move ${p.name} up`}
                      disabled={i === 0}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowGlyph direction="up" />
                    </IconButton>
                    <IconButton
                      label={`Move ${p.name} down`}
                      disabled={i === selected.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowGlyph direction="down" />
                    </IconButton>
                    <IconButton label={`Remove ${p.name} from line`} onClick={() => remove(id)}>
                      <CloseGlyph />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Rest of the roster */}
        <div>
          <h3 className="text-[10px] font-bold tracking-[0.16em] uppercase font-tight text-muted mb-2">
            Roster · {bench.length}
          </h3>
          {bench.length === 0 ? (
            <p className="text-[12px] text-faint font-tight">Everyone is on this line.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {bench.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => add(p.id)}
                    className={[
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-card-sm bg-bg cursor-pointer',
                      'hover:bg-ink/5 transition-colors text-left',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    ].join(' ')}
                  >
                    <span aria-hidden="true" className="text-[12px] text-faint w-4 flex-shrink-0">
                      +
                    </span>
                    <span
                      className={[
                        'text-[12px] font-medium font-tight truncate flex-1 min-w-0',
                        p.active ? 'text-ink' : 'text-faint line-through',
                      ].join(' ')}
                    >
                      {p.number ? `#${p.number} ` : ''}
                      {p.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end pt-4">
        <SmallButton onClick={onCancel} variant="ghost">
          Cancel
        </SmallButton>
        <SmallButton onClick={() => onSave(selected)} variant="primary">
          Save line
        </SmallButton>
      </div>
    </div>
  );
}

function CreateLineForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, kind: LineKind) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LineKind>('offense');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onCreate(trimmed, kind);
      }}
      className="p-4 bg-surface flex items-center gap-2 flex-wrap rounded-card shadow-card"
    >
      <label className="sr-only" htmlFor="new-line-name">
        Line name
      </label>
      <input
        id="new-line-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
        maxLength={60}
        placeholder="O-line"
        className="flex-1 min-w-[160px] bg-bg border border-border px-3 py-2 text-[13px] text-ink font-tight rounded focus-visible:outline-none focus-visible:border-ink"
      />
      <label className="sr-only" htmlFor="new-line-kind">
        Line kind
      </label>
      <select
        id="new-line-kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as LineKind)}
        className="bg-bg border border-border px-2 py-2 text-[11px] font-bold tracking-[0.14em] uppercase text-ink font-tight rounded cursor-pointer focus-visible:outline-none focus-visible:border-ink"
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      <SmallButton onClick={() => {}} variant="primary" type="submit">
        Create
      </SmallButton>
      <SmallButton onClick={onCancel} variant="ghost" type="button">
        Cancel
      </SmallButton>
    </form>
  );
}

function RenameLineForm({
  line,
  onSave,
  onCancel,
}: {
  line: Line;
  onSave: (name: string, kind: LineKind) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(line.name);
  const [kind, setKind] = useState<LineKind>(line.kind);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onSave(trimmed, kind);
      }}
      className="flex items-center gap-2 flex-wrap"
    >
      <label className="sr-only" htmlFor={`line-name-${line.id}`}>
        Line name
      </label>
      <input
        id={`line-name-${line.id}`}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
        maxLength={60}
        className="flex-1 min-w-[140px] bg-bg border border-border px-2 py-1.5 text-[13px] text-ink font-tight rounded focus-visible:outline-none focus-visible:border-ink"
      />
      <label className="sr-only" htmlFor={`line-kind-${line.id}`}>
        Line kind
      </label>
      <select
        id={`line-kind-${line.id}`}
        value={kind}
        onChange={(e) => setKind(e.target.value as LineKind)}
        className="bg-bg border border-border px-2 py-1.5 text-[11px] font-bold tracking-[0.14em] uppercase text-ink font-tight rounded cursor-pointer focus-visible:outline-none focus-visible:border-ink"
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
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
        'inline-flex items-center justify-center w-7 h-7 rounded-full text-muted transition-colors flex-shrink-0',
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

function CloseGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
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
