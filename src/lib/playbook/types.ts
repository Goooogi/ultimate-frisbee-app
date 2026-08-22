// Domain model for the play editor.
//
// Coordinates are normalized: x in [0,1] (0 = left sideline, 1 = right
// sideline), y in [0,1] (0 = own goal line we're attacking FROM, 1 = goal line
// we're attacking TOWARD). Endzones occupy the slice 0..ENDZONE_RATIO at the
// near end and (1-ENDZONE_RATIO)..1 at the far end — see field.ts.

export type FormationID =
  | 'vert'
  | 'ho'
  | 'hex'
  | 'split-23'
  | 'split-32'
  | 'empty'
  | 'custom';

/**
 * Visual field orientation. Set once when the play is created and not
 * changeable after — switching mid-edit would scramble coordinates.
 *  - `full`       : standard 70×120yd portrait (both endzones visible)
 *  - `half`       : upper attacking half only (midfield → goal)
 *  - `horizontal` : same 70×120 rotated 90° so attacking goal is on the right
 */
export type FieldType = 'full' | 'half' | 'horizontal';

export type Role = 'handler' | 'cutter';

export interface PlayerPos {
  /** Stable id within a play; 0..6 by convention. */
  id: number;
  role: Role;
  x: number;
  y: number;
  /** Optional one-letter label override; defaults to id+1. */
  label?: string;
}

/**
 * Disc state for a step.
 * - `ownerID != null` → disc rides with that player; x/y are ignored.
 * - `ownerID === null` → disc floats at (x,y) — pull, ground, or in-air swing.
 */
export interface DiscPos {
  ownerID: number | null;
  x: number;
  y: number;
}

export interface Step {
  id: string;
  /** Offensive players (always 7). Rendered in accent color. */
  players: PlayerPos[];
  /** Optional defensive players (always 7 when present). Rendered in ink.
   * Absent means the play was created without defense. */
  defenders?: PlayerPos[];
  disc: DiscPos;
  /** Freeform annotations the user has drawn on this step's field. */
  drawings?: Drawing[];
  note?: string;
  /** Duration (ms) of the animated transition INTO this step from the previous one.
   * First step uses 0 (snap on load). Default 700ms otherwise. */
  durationMs?: number;
}

/** All coords inside drawings are normalized (0..1) field positions, same
 * coord system as players. Renderer maps them to SVG yards via
 * `normToFieldSvg(x, y, fieldType)`. */
export interface Drawing {
  id: string;
  kind: 'line' | 'arrow' | 'freehand';
  /** Line + arrow: exactly 2 points (start, end). Freehand: N points. */
  points: Array<{ x: number; y: number }>;
}

/** The active editor tool. Cursor is the default — drag players/disc. The
 * draw tools intercept field interactions and add a `Drawing` to the step. */
export type DrawTool = 'cursor' | 'line' | 'arrow' | 'freehand';

/** Which side of the play a player belongs to. Used by drag handlers + render
 * coloring so the field can mutate offense and defense independently. */
export type PlayerTeam = 'offense' | 'defense';

export interface Play {
  id: string;
  name: string;
  formation: FormationID;
  /** Field orientation chosen at create-time. Older plays missing this field
   *  fall back to `full` at read time. */
  fieldType?: FieldType;
  steps: Step[];
  createdAt: number;
  updatedAt: number;
  /** Optional YouTube or Vimeo reference video URL (stored as the raw watch
   *  URL, rendered via parseEmbed). Null when no video is attached. */
  videoUrl?: string | null;
  /** Situational tags for filtering (o-line, endzone, zone-offense, …).
   *  Always an array — untagged plays carry `[]`, never null. */
  tags: string[];
}

export const PLAYER_COUNT = 7;
export const DEFAULT_STEP_MS = 700;

/**
 * The situational tag vocabulary, grouped for the picker. Closed set by
 * design: free-text tags fragment instantly ("endzone" vs "end zone" vs "EZ")
 * and make filtering useless. The DB stores plain text, so widening this list
 * needs no migration — but narrowing it would orphan existing tags.
 */
export const PLAY_TAG_GROUPS: Array<{ label: string; tags: string[] }> = [
  { label: 'Unit', tags: ['o-line', 'd-line'] },
  { label: 'Situation', tags: ['endzone', 'goal-line', 'after-timeout', 'stopped-disc', 'pull-play', 'last-point'] },
  { label: 'Structure', tags: ['vertical', 'horizontal', 'side-stack', 'zone-offense', 'zone-defense', 'man-defense'] },
];

/** Flat list of every valid tag, for validation + filter chips. */
export const PLAY_TAGS: string[] = PLAY_TAG_GROUPS.flatMap((g) => g.tags);

/** Human label for a tag slug ('after-timeout' → 'After timeout'). */
export function tagLabel(tag: string): string {
  const spaced = tag.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
