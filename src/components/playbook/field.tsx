'use client';

// Field canvas — SVG-based, pointer-events for both touch and mouse drag.
//
// Coordinate system: viewBox 0 0 70 120 (yards). normToSvg() converts the
// app's normalized 0..1 player coords to yard-units. Drag handling uses
// SVG.getScreenCTM() to convert pointer client coords back to yards, then to
// normalized coords.
//
// What renders:
//   - field background, endzones, sidelines, brick marks
//   - 7 player chips (circles with id label)
//   - disc (either rendered next to its owner or floating)
//   - throw arrow from previous step's disc-holder when one is given
//
// Interaction:
//   - tap a player → selects them (selectedID)
//   - drag a player → updates this step's position (live)
//   - drag the disc → either snaps to nearest player (becomes owner) or floats
//   - tap empty field → deselects

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FIELD_W_YD,
  FIELD_H_YD,
  ENDZONE_RATIO,
  FIELD_GEOM,
  normToFieldSvg,
  fieldSvgToNorm,
  snapNorm,
  clamp01,
} from '@/lib/playbook/field';
import type {
  DiscPos,
  Drawing,
  DrawTool,
  FieldType,
  PlayerPos,
  PlayerTeam,
  Step,
} from '@/lib/playbook/types';

interface FieldProps {
  /** Current step being edited. */
  step: Step;
  /** Previous step — used to draw the throw arrow if disc owner changed. */
  prevStep?: Step;
  /** Field orientation. Affects viewBox + rotation, not player coords. */
  fieldType?: FieldType;
  /** Read-only mode skips all drag handlers (used for thumbnails + playback). */
  readOnly?: boolean;
  /** When animating, suppress the throw arrow + skip transitions on selection. */
  animating?: boolean;
  /** Player currently selected for editing. Encoded as `${team}:${id}` so
   * offense + defense can both be selected by the same prop. */
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  /** Fired when an offender OR defender is dragged. Caller routes to the
   * right array using `team`. */
  onPlayerMove?: (id: number, x: number, y: number, team: PlayerTeam) => void;
  onDiscMove?: (disc: DiscPos) => void;
  /** Active editor tool. When non-cursor, background drags become drawings
   * and player chips are non-interactive. */
  tool?: DrawTool;
  /** Commit a freshly-drawn annotation (line / arrow / freehand). */
  onDrawingCommit?: (drawing: Drawing) => void;
  /** ms used for transition between rendered positions. Defaults to 0 (snap). */
  transitionMs?: number;
}

const PLAYER_R_YD = 3.2;     // visual radius of player chip, in yards
const HANDLER_R_YD = 3.4;    // handlers a hair larger
const DISC_R_YD = 1.4;       // small disc dot
const SELECTED_RING_YD = 0.8;
/** Snap the disc to a player if dropped within this distance (normalized). */
const DISC_SNAP_NORM = 0.07;

/**
 * Visual scale for player chips per field type. Half-field zooms in on a
 * 60-yard slice so a yard renders ~2× as many pixels as on full field — at
 * full chip size the players read as oversized cartoons. We compensate so
 * on-screen chip size stays roughly consistent across field types.
 */
function chipScaleFor(fieldType: FieldType): number {
  if (fieldType === 'half') return 0.55;
  if (fieldType === 'horizontal') return 0.7;
  return 1;
}

export function Field({
  step,
  prevStep,
  fieldType = 'full',
  readOnly,
  animating,
  selectedKey,
  onSelect,
  onPlayerMove,
  onDiscMove,
  tool = 'cursor',
  onDrawingCommit,
  transitionMs = 0,
}: FieldProps) {
  const geom = FIELD_GEOM[fieldType];
  const chipScale = chipScaleFor(fieldType);
  const drawingActive = tool !== 'cursor';

  // Drawing-in-progress state — used to render the live preview while a
  // pointer is down with a draw tool active.
  const drawDragRef = useRef<{
    kind: 'line' | 'arrow' | 'freehand';
    pointerID: number;
    points: Array<{ x: number; y: number }>;
  } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{
    kind: 'line' | 'arrow' | 'freehand';
    points: Array<{ x: number; y: number }>;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    kind: 'player' | 'disc';
    /** Which roster the player came from. Disc drags use 'offense'. */
    team: PlayerTeam;
    id: number;
    offsetSvg: { x: number; y: number };
  } | null>(null);
  const [draftPositions, setDraftPositions] = useState<{
    /** Drafts keyed by `${team}:${id}` so offense + defense don't collide. */
    players: Map<string, { x: number; y: number }>;
    disc: DiscPos | null;
  } | null>(null);

  const draftKey = (team: PlayerTeam, id: number) => `${team}:${id}`;

  // Live positions during a drag bypass step state for a fluid feel; on
  // pointerup we commit to the parent.
  const playerAt = useCallback(
    (p: PlayerPos, team: PlayerTeam): { x: number; y: number } => {
      const k = draftKey(team, p.id);
      if (draftPositions?.players.has(k)) return draftPositions.players.get(k)!;
      return { x: p.x, y: p.y };
    },
    [draftPositions],
  );

  const discAt = useCallback((): { x: number; y: number; ownerID: number | null } => {
    const d = draftPositions?.disc ?? step.disc;
    if (d.ownerID != null) {
      const owner = step.players.find((p) => p.id === d.ownerID);
      if (owner) {
        const pos = playerAt(owner, 'offense');
        return { x: pos.x, y: pos.y, ownerID: d.ownerID };
      }
    }
    return { x: d.x, y: d.y, ownerID: null };
  }, [draftPositions, step.disc, step.players, playerAt]);

  // ── pointer → field coord helpers ─────────────────────────────────────────
  const toFieldCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const tx = pt.matrixTransform(ctm.inverse());
      return fieldSvgToNorm(tx.x, tx.y, fieldType);
    },
    [fieldType],
  );

  // ── drag start ────────────────────────────────────────────────────────────
  const handlePlayerPointerDown = (
    e: React.PointerEvent<SVGElement>,
    p: PlayerPos,
    team: PlayerTeam,
  ) => {
    if (readOnly || drawingActive) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    onSelect?.(draftKey(team, p.id));
    const fc = toFieldCoords(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'player',
      team,
      id: p.id,
      offsetSvg: { x: fc.x - p.x, y: fc.y - p.y },
    };
  };

  const handleDiscPointerDown = (e: React.PointerEvent<SVGElement>) => {
    if (readOnly || drawingActive) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const d = discAt();
    const fc = toFieldCoords(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'disc',
      team: 'offense',
      id: -1,
      offsetSvg: { x: fc.x - d.x, y: fc.y - d.y },
    };
  };

  // ── drag move ─────────────────────────────────────────────────────────────
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;

    // Drawing in progress (line / arrow / freehand)
    if (drawDragRef.current) {
      const fc = toFieldCoords(e.clientX, e.clientY);
      const draw = drawDragRef.current;
      if (draw.kind === 'freehand') {
        // Only append if the cursor has moved a meaningful distance — keeps
        // the point list compact for storage.
        const last = draw.points[draw.points.length - 1];
        if (!last || Math.hypot(last.x - fc.x, last.y - fc.y) > 0.005) {
          draw.points.push(fc);
          setDrawPreview({ kind: 'freehand', points: [...draw.points] });
        }
      } else {
        // Line / arrow — preview is always [start, current].
        setDrawPreview({ kind: draw.kind, points: [draw.points[0], fc] });
      }
      return;
    }

    if (!dragRef.current) return;
    const drag = dragRef.current;
    const fc = toFieldCoords(e.clientX, e.clientY);
    const nx = clamp01(fc.x - drag.offsetSvg.x);
    const ny = clamp01(fc.y - drag.offsetSvg.y);

    setDraftPositions((prev) => {
      const players = new Map(prev?.players ?? []);
      let disc = prev?.disc ?? null;
      if (drag.kind === 'player') {
        players.set(draftKey(drag.team, drag.id), { x: nx, y: ny });
      } else {
        disc = { ownerID: null, x: nx, y: ny };
      }
      return { players, disc };
    });
  };

  // ── drag end ──────────────────────────────────────────────────────────────
  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;

    // Commit a drawing if one was in progress.
    if (drawDragRef.current) {
      const draw = drawDragRef.current;
      drawDragRef.current = null;
      const fc = toFieldCoords(e.clientX, e.clientY);
      let points = draw.points;
      if (draw.kind === 'freehand') {
        if (fc) points = [...points, fc];
        // Reject single-tap freehands (no motion).
        if (points.length >= 2 && totalPathLen(points) > 0.01) {
          onDrawingCommit?.({
            id: `dr_${Math.random().toString(36).slice(2, 9)}`,
            kind: 'freehand',
            points,
          });
        }
      } else {
        const start = points[0];
        const end = fc;
        // Reject tiny lines (accidental clicks).
        if (Math.hypot(end.x - start.x, end.y - start.y) > 0.015) {
          onDrawingCommit?.({
            id: `dr_${Math.random().toString(36).slice(2, 9)}`,
            kind: draw.kind,
            points: [start, end],
          });
        }
      }
      setDrawPreview(null);
      return;
    }

    if (!dragRef.current) return;
    const drag = dragRef.current;
    dragRef.current = null;

    if (drag.kind === 'player') {
      const pos = draftPositions?.players.get(draftKey(drag.team, drag.id));
      if (pos) {
        const sx = snapNorm(pos.x);
        const sy = snapNorm(pos.y);
        onPlayerMove?.(drag.id, sx, sy, drag.team);
      }
    } else {
      const d = draftPositions?.disc;
      if (d) {
        // Snap to nearest offensive player if within range; otherwise float.
        // The disc only ever attaches to offense.
        const nearest = nearestPlayer(step.players, d.x, d.y);
        if (nearest && nearest.dist < DISC_SNAP_NORM) {
          onDiscMove?.({ ownerID: nearest.id, x: 0, y: 0 });
        } else {
          onDiscMove?.({ ownerID: null, x: snapNorm(d.x), y: snapNorm(d.y) });
        }
      }
    }
    setDraftPositions(null);
  };

  // Cancel drafts whenever the step id changes (we navigated to another step).
  useEffect(() => {
    setDraftPositions(null);
    dragRef.current = null;
    drawDragRef.current = null;
    setDrawPreview(null);
  }, [step.id]);

  // Empty-field tap deselects (cursor tool) or starts a drawing.
  const handleBgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    if (!drawingActive) {
      onSelect?.(null);
      return;
    }
    // Capture for drawing: subsequent pointermove / up land on the SVG.
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const fc = toFieldCoords(e.clientX, e.clientY);
    drawDragRef.current = {
      kind: tool,
      pointerID: e.pointerId,
      points: [fc],
    };
    setDrawPreview({
      kind: tool,
      points: tool === 'freehand' ? [fc] : [fc, fc],
    });
  };

  // ── disc throw arrow (only when the prev step had a different owner) ─────
  const arrow = throwArrowGeometry(prevStep, step, fieldType);

  return (
    <svg
      ref={svgRef}
      viewBox={geom.viewBox}
      role="img"
      aria-label="Ultimate field — drag players and disc to position them"
      className="w-full h-full select-none touch-none"
      style={drawingActive ? { cursor: 'crosshair' } : undefined}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerDown={handleBgPointerDown}
    >
      {/* field background + endzones */}
      <FieldBackground fieldType={fieldType} />

      {/* user drawings layer — below players so chips read on top */}
      {step.drawings?.map((d) => (
        <DrawingShape key={d.id} drawing={d} fieldType={fieldType} />
      ))}
      {/* live preview of in-progress drawing */}
      {drawPreview && (
        <DrawingShape
          drawing={{ id: 'preview', kind: drawPreview.kind, points: drawPreview.points }}
          fieldType={fieldType}
          preview
        />
      )}

      {/* throw arrow (rendered behind players) */}
      {!animating && arrow && (
        <ThrowArrow
          x1={arrow.x1}
          y1={arrow.y1}
          x2={arrow.x2}
          y2={arrow.y2}
        />
      )}

      {/* defenders (rendered below offense so offense reads on top) */}
      {step.defenders?.map((p) => {
        const pos = playerAt(p, 'defense');
        const { svgX, svgY } = normToFieldSvg(pos.x, pos.y, fieldType);
        return (
          <PlayerChip
            key={`d:${p.id}`}
            player={p}
            team="defense"
            scale={chipScale}
            cx={svgX}
            cy={svgY}
            selected={selectedKey === draftKey('defense', p.id)}
            transitionMs={transitionMs}
            onPointerDown={(e) => handlePlayerPointerDown(e, p, 'defense')}
          />
        );
      })}

      {/* offensive players */}
      {step.players.map((p) => {
        const pos = playerAt(p, 'offense');
        const { svgX, svgY } = normToFieldSvg(pos.x, pos.y, fieldType);
        return (
          <PlayerChip
            key={`o:${p.id}`}
            player={p}
            team="offense"
            scale={chipScale}
            cx={svgX}
            cy={svgY}
            selected={selectedKey === draftKey('offense', p.id)}
            transitionMs={transitionMs}
            onPointerDown={(e) => handlePlayerPointerDown(e, p, 'offense')}
          />
        );
      })}

      {/* disc */}
      <DiscMark
        disc={discAt()}
        fieldType={fieldType}
        scale={chipScale}
        transitionMs={transitionMs}
        onPointerDown={handleDiscPointerDown}
      />
    </svg>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────

function FieldBackground({ fieldType }: { fieldType: FieldType }) {
  const ezH = ENDZONE_RATIO * FIELD_H_YD;
  const bgFill = 'rgb(var(--surface))';
  // Translucent grey overlay so the endzone reads as visibly tinted on both
  // themes (--surface-hi is the same as --surface in light mode, so the
  // default endzone fill was effectively invisible).
  const ezFill = 'rgba(120, 120, 120, 0.09)';
  const lineCol = 'rgb(var(--hairline))';
  const lineMid = 'rgb(var(--border))';

  // Horizontal layout swaps the viewBox dimensions and flips the field on
  // its side: endzones run vertically along the left/right edges instead of
  // the top/bottom.
  if (fieldType === 'horizontal') {
    return (
      <g>
        <rect x="0" y="0" width={FIELD_H_YD} height={FIELD_W_YD} fill={bgFill} />
        {/* own endzone (left) — y=0 is own goal */}
        <rect x="0" y="0" width={ezH} height={FIELD_W_YD} fill={ezFill} />
        {/* attacking endzone (right) — y=1 is attacking */}
        <rect
          x={FIELD_H_YD - ezH}
          y="0"
          width={ezH}
          height={FIELD_W_YD}
          fill={ezFill}
        />
        <rect
          x="0.25"
          y="0.25"
          width={FIELD_H_YD - 0.5}
          height={FIELD_W_YD - 0.5}
          fill="none"
          stroke={lineMid}
          strokeWidth="0.5"
        />
        {/* goal lines (vertical) */}
        <line x1={ezH} y1="0" x2={ezH} y2={FIELD_W_YD} stroke={lineMid} strokeWidth="0.4" />
        <line
          x1={FIELD_H_YD - ezH}
          y1="0"
          x2={FIELD_H_YD - ezH}
          y2={FIELD_W_YD}
          stroke={lineMid}
          strokeWidth="0.4"
        />
        {/* brick marks 20yd from each EZ */}
        <BrickMark cx={ezH + 20} cy={FIELD_W_YD / 2} />
        <BrickMark cx={FIELD_H_YD - ezH - 20} cy={FIELD_W_YD / 2} />
        {/* midfield (vertical dashed) */}
        <line
          x1={FIELD_H_YD / 2}
          y1="0"
          x2={FIELD_H_YD / 2}
          y2={FIELD_W_YD}
          stroke={lineCol}
          strokeWidth="0.2"
          strokeDasharray="1.5,1.8"
        />
      </g>
    );
  }

  // Half + full both use the standard portrait layout; half just clips via
  // the viewBox so the lower half (own endzone + midfield) is off-screen.
  const drawOwnEz = fieldType !== 'half';
  return (
    <g>
      {/* main background */}
      <rect x="0" y="0" width={FIELD_W_YD} height={FIELD_H_YD} fill={bgFill} />
      {/* attacking endzone (top) */}
      <rect x="0" y="0" width={FIELD_W_YD} height={ezH} fill={ezFill} />
      {/* own endzone (bottom) */}
      {drawOwnEz && (
        <rect x="0" y={FIELD_H_YD - ezH} width={FIELD_W_YD} height={ezH} fill={ezFill} />
      )}
      {/* sideline borders */}
      <rect
        x="0.25"
        y="0.25"
        width={FIELD_W_YD - 0.5}
        height={FIELD_H_YD - 0.5}
        fill="none"
        stroke={lineMid}
        strokeWidth="0.5"
      />
      {/* goal lines */}
      <line x1="0" y1={ezH} x2={FIELD_W_YD} y2={ezH} stroke={lineMid} strokeWidth="0.4" />
      {drawOwnEz && (
        <line
          x1="0"
          y1={FIELD_H_YD - ezH}
          x2={FIELD_W_YD}
          y2={FIELD_H_YD - ezH}
          stroke={lineMid}
          strokeWidth="0.4"
        />
      )}
      {/* brick marks (20yd from each EZ) */}
      <BrickMark cx={FIELD_W_YD / 2} cy={ezH + 20} />
      {drawOwnEz && <BrickMark cx={FIELD_W_YD / 2} cy={FIELD_H_YD - ezH - 20} />}
      {/* midfield dashed line */}
      <line
        x1="0"
        y1={FIELD_H_YD / 2}
        x2={FIELD_W_YD}
        y2={FIELD_H_YD / 2}
        stroke={lineCol}
        strokeWidth={fieldType === 'half' ? 0.4 : 0.2}
        strokeDasharray="1.5,1.8"
      />
      {/* midfield crosshair "+" */}
      <g stroke={lineMid} strokeWidth="0.28" opacity="0.6">
        <line x1={FIELD_W_YD / 2 - 1.6} y1={FIELD_H_YD / 2} x2={FIELD_W_YD / 2 + 1.6} y2={FIELD_H_YD / 2} />
        <line x1={FIELD_W_YD / 2} y1={FIELD_H_YD / 2 - 1.6} x2={FIELD_W_YD / 2} y2={FIELD_H_YD / 2 + 1.6} />
      </g>
      {/* sideline tick marks every 10yd between the goal lines */}
      {Array.from({ length: 11 }).map((_, i) => {
        const y = ezH + i * ((FIELD_H_YD - 2 * ezH) / 10);
        return (
          <g key={i} stroke={lineCol} strokeWidth="0.18" opacity="0.55">
            <line x1="0" y1={y} x2="1.2" y2={y} />
            <line x1={FIELD_W_YD - 1.2} y1={y} x2={FIELD_W_YD} y2={y} />
          </g>
        );
      })}
      {/* endzone labels (faded, inside each endzone) */}
      <text
        x="2"
        y={ezH - 2}
        fontSize="2.2"
        fontWeight="700"
        fill={lineMid}
        opacity="0.55"
        letterSpacing="0.5"
      >
        END ZONE
      </text>
      {drawOwnEz && (
        <text
          x="2"
          y={FIELD_H_YD - ezH + 4}
          fontSize="2.2"
          fontWeight="700"
          fill={lineMid}
          opacity="0.55"
          letterSpacing="0.5"
        >
          END ZONE · ATTACK
        </text>
      )}
    </g>
  );
}

function BrickMark({ cx, cy }: { cx: number; cy: number }) {
  const lineCol = 'rgb(var(--hairline))';
  return (
    <g stroke={lineCol} strokeWidth="0.3">
      <line x1={cx - 1.2} y1={cy} x2={cx + 1.2} y2={cy} />
      <line x1={cx} y1={cy - 1.2} x2={cx} y2={cy + 1.2} />
    </g>
  );
}

function PlayerChip({
  player,
  team,
  scale = 1,
  cx,
  cy,
  selected,
  transitionMs,
  onPointerDown,
}: {
  player: PlayerPos;
  team: PlayerTeam;
  scale?: number;
  cx: number;
  cy: number;
  selected: boolean;
  transitionMs: number;
  onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
}) {
  // Handlers are a hair bigger so the disc-holder reads as more prominent;
  // defenders use the smaller size since they all wear the same color.
  const baseR = team === 'offense' && player.role === 'handler' ? HANDLER_R_YD : PLAYER_R_YD;
  const r = baseR * scale;
  const fontSize = 3.2 * scale;
  const ringPad = SELECTED_RING_YD * scale;
  // Offense → accent (orange light / lime dark). Defense → ink (black).
  // Selected ring colour matches the opposite end of the contrast pair so
  // it's visible on either chip.
  const fill = team === 'offense' ? 'rgb(var(--accent))' : 'rgb(var(--ink))';
  const text = team === 'offense' ? 'rgb(var(--accent-ink))' : 'rgb(var(--surface))';
  const ringColor = team === 'offense' ? 'rgb(var(--accent))' : 'rgb(var(--ink))';

  return (
    <g
      style={{
        transform: `translate(${cx}px, ${cy}px)`,
        transition: transitionMs > 0 ? `transform ${transitionMs}ms cubic-bezier(0.4, 0.0, 0.2, 1)` : undefined,
        cursor: 'grab',
      }}
      onPointerDown={onPointerDown}
    >
      {selected && (
        <circle
          cx={0}
          cy={0}
          r={r + ringPad}
          fill="none"
          stroke={ringColor}
          strokeWidth="0.6"
          opacity="0.9"
        />
      )}
      <circle cx={0} cy={0} r={r} fill={fill} />
      <text
        x={0}
        y={0.05}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="700"
        fill={text}
        style={{ pointerEvents: 'none' }}
      >
        {player.label ?? player.id + 1}
      </text>
    </g>
  );
}

function DiscMark({
  disc,
  fieldType,
  scale = 1,
  transitionMs,
  onPointerDown,
}: {
  disc: { x: number; y: number; ownerID: number | null };
  fieldType: FieldType;
  scale?: number;
  transitionMs: number;
  onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
}) {
  const { svgX, svgY } = normToFieldSvg(disc.x, disc.y, fieldType);
  // If held, offset off the player's center (also scale-aware) so it's visible.
  const offsetX = disc.ownerID != null ? HANDLER_R_YD * scale - 0.4 * scale : 0;
  const r = DISC_R_YD * scale;
  return (
    <g
      style={{
        transform: `translate(${svgX + offsetX}px, ${svgY}px)`,
        transition: transitionMs > 0 ? `transform ${transitionMs}ms cubic-bezier(0.4, 0.0, 0.2, 1)` : undefined,
        cursor: 'grab',
      }}
      onPointerDown={onPointerDown}
    >
      {/* outer ring for contrast */}
      <circle cx={0} cy={0} r={r + 0.4} fill="rgb(var(--surface))" stroke="rgb(var(--ink))" strokeWidth={0.4 * scale} />
      <circle cx={0} cy={0} r={r} fill="rgb(var(--ink))" />
    </g>
  );
}

function ThrowArrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  // shorten so arrow doesn't bury inside player chips on each end
  const trim = HANDLER_R_YD + 0.5;
  const ux = dx / len;
  const uy = dy / len;
  const sx = x1 + ux * trim;
  const sy = y1 + uy * trim;
  const ex = x2 - ux * trim;
  const ey = y2 - uy * trim;
  return (
    <g pointerEvents="none">
      <defs>
        <marker
          id="throwhead"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="rgb(var(--accent))" />
        </marker>
      </defs>
      <line
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        stroke="rgb(var(--accent))"
        strokeWidth="0.7"
        strokeLinecap="round"
        strokeDasharray="1.8,1.6"
        markerEnd="url(#throwhead)"
      />
    </g>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

function nearestPlayer(
  players: PlayerPos[],
  nx: number,
  ny: number,
): { id: number; dist: number } | null {
  let best: { id: number; dist: number } | null = null;
  for (const p of players) {
    const d = Math.hypot(p.x - nx, p.y - ny);
    if (!best || d < best.dist) best = { id: p.id, dist: d };
  }
  return best;
}

function throwArrowGeometry(
  prev: Step | undefined,
  curr: Step,
  fieldType: FieldType,
): { x1: number; y1: number; x2: number; y2: number } | null {
  if (!prev) return null;
  // Only draw an arrow if a new player got the disc this step.
  if (prev.disc.ownerID === curr.disc.ownerID) return null;
  const fromPos = ownerPosition(prev);
  const toPos = ownerPosition(curr);
  if (!fromPos || !toPos) return null;
  const { svgX: x1, svgY: y1 } = normToFieldSvg(fromPos.x, fromPos.y, fieldType);
  const { svgX: x2, svgY: y2 } = normToFieldSvg(toPos.x, toPos.y, fieldType);
  return { x1, y1, x2, y2 };
}

function ownerPosition(step: Step): { x: number; y: number } | null {
  if (step.disc.ownerID == null) return { x: step.disc.x, y: step.disc.y };
  const owner = step.players.find((p) => p.id === step.disc.ownerID);
  return owner ? { x: owner.x, y: owner.y } : null;
}

// ── drawings ──────────────────────────────────────────────────────────────

function totalPathLen(points: Array<{ x: number; y: number }>): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

function DrawingShape({
  drawing,
  fieldType,
  preview,
}: {
  drawing: Drawing;
  fieldType: FieldType;
  preview?: boolean;
}) {
  const stroke = 'rgb(var(--ink))';
  const sw = 0.9;
  const opacity = preview ? 0.7 : 1;

  if (drawing.kind === 'freehand') {
    const pts = drawing.points.map((p) => {
      const { svgX, svgY } = normToFieldSvg(p.x, p.y, fieldType);
      return `${svgX.toFixed(2)},${svgY.toFixed(2)}`;
    });
    return (
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
        pointerEvents="none"
      />
    );
  }

  // line / arrow — exactly 2 points
  if (drawing.points.length < 2) return null;
  const a = normToFieldSvg(drawing.points[0].x, drawing.points[0].y, fieldType);
  const b = normToFieldSvg(drawing.points[1].x, drawing.points[1].y, fieldType);

  if (drawing.kind === 'line') {
    return (
      <line
        x1={a.svgX}
        y1={a.svgY}
        x2={b.svgX}
        y2={b.svgY}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        opacity={opacity}
        pointerEvents="none"
      />
    );
  }

  // Arrow: render the shaft as a line that ends slightly short of the tip,
  // then a filled polygon for the head. Doing it by hand sidesteps SVG
  // `<marker>` quirks (sizes scale with stroke-width by default, and some
  // browsers ignore markerUnits inside nested <defs>).
  const dx = b.svgX - a.svgX;
  const dy = b.svgY - a.svgY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Head dimensions in SVG-yards. Tuned to read clearly without dominating
  // the shaft — about a third of the previous spike.
  const headLen = 2;
  const headWidth = 1.6;
  // Tip and the back-of-head center point.
  const tipX = b.svgX;
  const tipY = b.svgY;
  const baseX = b.svgX - ux * headLen;
  const baseY = b.svgY - uy * headLen;
  // Perpendicular spread.
  const px = -uy;
  const py = ux;
  const leftX = baseX + px * (headWidth / 2);
  const leftY = baseY + py * (headWidth / 2);
  const rightX = baseX - px * (headWidth / 2);
  const rightY = baseY - py * (headWidth / 2);

  return (
    <g pointerEvents="none" opacity={opacity}>
      <line
        x1={a.svgX}
        y1={a.svgY}
        x2={baseX}
        y2={baseY}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <polygon
        points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
        fill={stroke}
      />
    </g>
  );
}
