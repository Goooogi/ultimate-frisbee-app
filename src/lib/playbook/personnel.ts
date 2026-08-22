// Deriving chip labels from a play's personnel.
//
// The field renderer already draws `player.label ?? player.id + 1`, so naming
// chips is purely a read-time transform: we overlay a `label` onto each
// PlayerPos before handing the step to <Field>. Nothing about the stored step
// payload changes, so a play with no personnel renders exactly as it always
// has, and clearing personnel reverts instantly.

import type { Personnel, RosterPlayer } from './data';
import type { Step } from './types';

/**
 * The chip label for a slot: the player's jersey number when assigned and
 * numbered, their initials when assigned without a number, and undefined when
 * unassigned (so the renderer falls back to the chip number).
 */
export function chipLabel(
  slot: number,
  personnel: Personnel,
  byID: Map<string, RosterPlayer>,
): string | undefined {
  const playerID = personnel[slot];
  if (!playerID) return undefined;
  const player = byID.get(playerID);
  if (!player) return undefined;
  if (player.number) return player.number;
  return initials(player.name);
}

/** "Sarah Chen" → "SC". Single-word names fall back to two letters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Overlay personnel labels onto a step's offensive players. Returns the step
 * unchanged when there's no personnel to apply, so the common case allocates
 * nothing and referential equality is preserved for React.
 */
export function labelStep(
  step: Step,
  personnel: Personnel,
  byID: Map<string, RosterPlayer>,
): Step {
  if (Object.keys(personnel).length === 0) return step;

  return {
    ...step,
    players: step.players.map((p) => {
      const label = chipLabel(p.id, personnel, byID);
      return label === undefined ? p : { ...p, label };
    }),
  };
}

/** The full display name for a slot, for tooltips / the personnel list. */
export function slotName(
  slot: number,
  personnel: Personnel,
  byID: Map<string, RosterPlayer>,
): string | undefined {
  const playerID = personnel[slot];
  if (!playerID) return undefined;
  return byID.get(playerID)?.name;
}
