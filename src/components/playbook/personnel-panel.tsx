'use client';

// Personnel — maps roster players onto the seven chips of a play.
//
// Per PLAY, not per step: the same seven for every step, which covers the
// overwhelming majority of real use and leaves the stored step payloads
// untouched. Chip labels are derived at render time (see `chipLabel` in
// personnel.ts), so a play with no personnel behaves exactly as before.
//
// Team plays only — a personal play has no roster to draw from.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyLineToPlay,
  clearPlayPersonnel,
  getPlayPersonnel,
  listLines,
  listRoster,
  setPlaySlot,
  type Line,
  type Personnel,
  type RosterPlayer,
} from '@/lib/playbook/data';
import { PLAYER_COUNT } from '@/lib/playbook/types';
import { formatSupabaseError } from '@/lib/supabase/errors';

export function PersonnelPanel({
  playID,
  teamID,
  canEdit,
  personnel,
  onPersonnelChange,
}: {
  playID: string;
  teamID: string;
  canEdit: boolean;
  personnel: Personnel;
  onPersonnelChange: (next: Personnel) => void;
}) {
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Roster + lines are per-team, so they reload only when the team changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [r, l] = await Promise.all([listRoster(teamID), listLines(teamID)]);
        if (cancelled) return;
        setRoster(r);
        setLines(l);
      } catch (err) {
        if (!cancelled) {
          setError(formatSupabaseError(err, 'Load roster'));
          console.error('[personnel-panel] load failed', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamID]);

  const byID = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const assignedIDs = useMemo(() => new Set(Object.values(personnel)), [personnel]);
  const filled = Object.keys(personnel).length;

  const handleAssign = useCallback(
    async (slot: number, playerID: string | null) => {
      // Optimistic: the select should feel instant. On failure we reload the
      // authoritative state rather than guessing at a rollback.
      const next: Personnel = { ...personnel };
      if (playerID === null) {
        delete next[slot];
      } else {
        // An athlete holds at most one chip — clear their previous slot so the
        // local state matches what the DB will do.
        for (const [s, id] of Object.entries(next)) {
          if (id === playerID) delete next[Number(s)];
        }
        next[slot] = playerID;
      }
      onPersonnelChange(next);

      try {
        setError(null);
        await setPlaySlot(playID, slot, playerID);
      } catch (err) {
        setError(formatSupabaseError(err, 'Assign player'));
        console.error('[personnel-panel] setPlaySlot failed', err);
        try {
          onPersonnelChange(await getPlayPersonnel(playID));
        } catch {
          // Reload failed too — leave the optimistic state and show the error.
        }
      }
    },
    [personnel, playID, onPersonnelChange],
  );

  const handleApplyLine = useCallback(
    async (line: Line) => {
      try {
        setError(null);
        const next = await applyLineToPlay(playID, line.playerIDs);
        onPersonnelChange(next);
      } catch (err) {
        setError(formatSupabaseError(err, 'Apply line'));
        console.error('[personnel-panel] applyLineToPlay failed', err);
      }
    },
    [playID, onPersonnelChange],
  );

  const handleClear = useCallback(async () => {
    try {
      setError(null);
      await clearPlayPersonnel(playID);
      onPersonnelChange({});
    } catch (err) {
      setError(formatSupabaseError(err, 'Clear personnel'));
      console.error('[personnel-panel] clearPlayPersonnel failed', err);
    }
  }, [playID, onPersonnelChange]);

  return (
    <section className="border border-hairline rounded-sm overflow-hidden bg-bg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          'w-full flex items-center gap-2 px-3 py-2.5 cursor-pointer text-left',
          'hover:bg-ink/5 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          Personnel
        </span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase font-tight text-faint tabular">
          {filled === 0 ? 'Not set' : `${filled} of ${PLAYER_COUNT}`}
        </span>
        <span className="flex-1" />
        <ChevronGlyph open={open} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-hairline">
          {error && (
            <div
              role="alert"
              className="mb-3 text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2"
            >
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-[12px] text-faint font-tight py-2">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-[12px] text-faint font-tight py-2">
              No players on this team&rsquo;s roster yet. Add them on the Team page to name the
              chips on this play.
            </p>
          ) : (
            <>
              {canEdit && lines.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap py-2 mb-1">
                  <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
                    Apply line
                  </span>
                  {lines.map((line) => (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => handleApplyLine(line)}
                      className={[
                        'px-2.5 py-1 rounded-full bg-ink/5 cursor-pointer transition-colors',
                        'text-[11px] font-medium font-tight text-muted hover:text-ink hover:bg-ink/10',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      ].join(' ')}
                    >
                      {line.name}
                    </button>
                  ))}
                  {filled > 0 && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className={[
                        'px-2.5 py-1 rounded-full cursor-pointer transition-colors',
                        'text-[11px] font-medium font-tight text-faint hover:text-live',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      ].join(' ')}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {Array.from({ length: PLAYER_COUNT }, (_, slot) => {
                  const assignedID = personnel[slot];
                  const assigned = assignedID ? byID.get(assignedID) : undefined;
                  return (
                    <li key={slot} className="flex items-center gap-2">
                      {/* The chip number this row controls — matches the
                          number drawn on the field when unassigned. */}
                      <span
                        aria-hidden="true"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 bg-accent text-accent-ink text-[10px] font-bold font-tight tabular"
                      >
                        {slot + 1}
                      </span>
                      {canEdit ? (
                        <>
                          <label className="sr-only" htmlFor={`personnel-${playID}-${slot}`}>
                            Player for chip {slot + 1}
                          </label>
                          <select
                            id={`personnel-${playID}-${slot}`}
                            value={assignedID ?? ''}
                            onChange={(e) => handleAssign(slot, e.target.value || null)}
                            className={[
                              'flex-1 min-w-0 bg-bg border border-border px-2 py-1.5 rounded',
                              'text-[12px] font-tight text-ink cursor-pointer',
                              'focus-visible:outline-none focus-visible:border-ink',
                            ].join(' ')}
                          >
                            <option value="">— unassigned —</option>
                            {roster.map((p) => (
                              <option
                                key={p.id}
                                value={p.id}
                                // Someone already on another chip stays listed
                                // (picking them MOVES them, which is usually
                                // what you meant) but is marked so it's clear.
                                disabled={false}
                              >
                                {p.number ? `#${p.number} ` : ''}
                                {p.name}
                                {!p.active ? ' (benched)' : ''}
                                {assignedIDs.has(p.id) && p.id !== assignedID ? ' — assigned' : ''}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <span className="flex-1 min-w-0 text-[12px] font-medium font-tight text-ink truncate">
                          {assigned
                            ? `${assigned.number ? `#${assigned.number} ` : ''}${assigned.name}`
                            : '—'}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="text-[11px] text-faint font-tight mt-2.5">
                Assigned chips show the player&rsquo;s jersey number on the field.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ChevronGlyph({ open }: { open: boolean }) {
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
      className={`text-faint flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}
