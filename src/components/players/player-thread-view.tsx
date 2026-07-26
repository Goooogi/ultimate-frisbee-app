'use client';

// PlayerThreadView — "The Thread": a player's connection web rendered as a
// pannable/zoomable node-link graph. Anchor centered, teammates on an inner
// ring (direct edges + dashed shared-history arcs between them), and second-hop
// CONNECTIONS — people the anchor has never played with, reached through a
// teammate on a different team/season — fanned around their bridging teammate
// on an outer ring. Elite connections (score>=85) get a gold ring; everything
// else on the outer ring is a quiet, thin-bordered "connection" node so the
// elite discoveries pop.
//
// Pure geometry (trig), no force-sim/graph library: nodes are absolutely
// positioned divs over an SVG edge layer, same idiom as squad-builder.tsx's
// Field component. What's new vs. that fixed-size scale-to-fit is real pan/zoom
// — a CSS transform (translate + scale) on the inner canvas layer, drag to pan,
// wheel/pinch to zoom toward the cursor/midpoint, +/-/reset controls. The
// scale-to-fit computation now only sets the INITIAL transform; the user is
// then free to explore, and Reset returns to that same fit.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { PlayerHeadshot } from '@/components/players/player-headshot';
import type { PlayerThread, ThreadNode, ThreadEdge } from '@/lib/players/connections';

interface Props {
  thread: PlayerThread;
  anchorDisplayName: string;
  anchorHeadshotUrl: string | null;
  backHref: string;
}

type Lens = 'all' | 'shared' | 'paths' | 'circle';

const LENS_OPTIONS: { value: Lens; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'shared', label: 'Shared history' },
  { value: 'paths', label: 'Paths to the best' },
  { value: 'circle', label: 'My circle' },
];

const GOLD = '#F5C451';

export function PlayerThreadView({ thread, anchorDisplayName, anchorHeadshotUrl, backHref }: Props) {
  const { anchor, nodes, edges } = thread;

  if (!anchor || nodes.length === 0) {
    return (
      <PageShell
        title="The Thread"
        eyebrow={anchorDisplayName.toUpperCase()}
        breadcrumbs={[{ label: anchorDisplayName, href: backHref }, { label: 'The Thread' }]}
        topNavSlot={<span aria-hidden="true" />}
      >
        <EmptyState anchorDisplayName={anchorDisplayName} backHref={backHref} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="The Thread"
      eyebrow={anchorDisplayName.toUpperCase()}
      breadcrumbs={[{ label: anchorDisplayName, href: backHref }, { label: 'The Thread' }]}
      topNavSlot={<span aria-hidden="true" />}
    >
      <ThreadGraph
        anchor={anchor}
        nodes={nodes}
        edges={edges}
        anchorDisplayName={anchorDisplayName}
        anchorHeadshotUrl={anchorHeadshotUrl}
      />
    </PageShell>
  );
}

function EmptyState({ anchorDisplayName, backHref }: { anchorDisplayName: string; backHref: string }) {
  return (
    <div className="rounded-card bg-surface shadow-card px-6 py-14 flex flex-col items-center text-center gap-3">
      <span aria-hidden="true" className="text-faint">
        <WebIcon size={40} />
      </span>
      <p className="font-display italic text-xl font-bold text-ink">
        No connections mapped yet for {anchorDisplayName}
      </p>
      <p className="text-[13px] text-muted font-tight max-w-sm">
        We haven&apos;t found enough shared-roster history to build a connection web for this player.
      </p>
      <Link
        href={backHref}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] uppercase text-accent hover:opacity-80 transition-opacity"
      >
        Back to profile
      </Link>
    </div>
  );
}

// ─── Layout geometry ────────────────────────────────────────────────────────

interface Placed {
  node: ThreadNode;
  x: number;
  y: number;
}

// Natural canvas is large — fine now that the graph is pan/zoomable rather
// than squeezed into a fixed viewport.
const CANVAS_W = 1700;
const CANVAS_H = 1700;
const CENTER = CANVAS_W / 2;

// Node visual sizes (diameter, px) at 1x canvas scale.
const ANCHOR_R = 46;
const TEAMMATE_R = 30;
const ELITE_R = 25;
const CONNECTION_R = 17;

const INNER_RING_R = 300;
// Outer nodes spread across three concentric bands so a dense web breathes
// rather than piling every discovery onto one arc. Bands are cycled per node.
const OUTER_BANDS = [560, 680, 800];

function buildLayout(
  anchor: ThreadNode,
  nodes: ThreadNode[],
): Map<string, Placed> {
  const teammates = [...nodes.filter((n) => n.kind === 'teammate')].sort(
    (a, b) => (b.weight ?? 0) - (a.weight ?? 0),
  );
  const outer = nodes.filter((n) => n.kind === 'elite' || n.kind === 'connection');

  const placed = new Map<string, Placed>();
  placed.set(anchor.id, { node: anchor, x: CENTER, y: CENTER });

  // Teammates: evenly spaced around the inner ring, starting at 12 o'clock,
  // clockwise, strongest bond first so it reads top-and-center.
  const teammateAngle = (i: number) => -Math.PI / 2 + (i / Math.max(teammates.length, 1)) * 2 * Math.PI;
  teammates.forEach((t, i) => {
    const a = teammateAngle(i);
    placed.set(t.id, {
      node: t,
      x: CENTER + INNER_RING_R * Math.cos(a),
      y: CENTER + INNER_RING_R * Math.sin(a),
    });
  });
  const teammateIndexById = new Map(teammates.map((t, i) => [t.id, i]));

  // Outer nodes (elite + connection discoveries): spread EVENLY around a full
  // outer ring so no quadrant is empty and no via-sector overflows — the old
  // per-via sector fan piled dense bridges (one teammate → 15+ connections)
  // into a 30° wedge and stacked their labels. To keep the "these came through
  // Alex Atkins" read, we still SORT by via (grouped), and start each via's run
  // near its teammate's angle, so same-bridge nodes remain visually adjacent
  // and roughly point back toward their spoke — just without cramming.
  const byVia = new Map<string, ThreadNode[]>();
  for (const n of outer) {
    const key = n.via && placed.has(n.via) ? n.via : '__anchor__';
    if (!byVia.has(key)) byVia.set(key, []);
    byVia.get(key)!.push(n);
  }
  // Elite-first within each via group so gold nodes lead the cluster.
  for (const group of byVia.values()) {
    group.sort((a, b) => {
      if (a.kind === b.kind) return (b.score ?? 0) - (a.score ?? 0);
      return a.kind === 'elite' ? -1 : 1;
    });
  }
  // Order the via GROUPS by their teammate's angle so the flattened sequence
  // sweeps around the circle in the same order as the inner ring.
  const viaAngle = (viaId: string) =>
    viaId === '__anchor__' ? -Math.PI / 2 : teammateAngle(teammateIndexById.get(viaId) ?? 0);
  const orderedOuter: ThreadNode[] = Array.from(byVia.entries())
    .sort((a, b) => viaAngle(a[0]) - viaAngle(b[0]))
    .flatMap(([, group]) => group);

  const total = Math.max(orderedOuter.length, 1);
  // Even angular step around the full circle, with a golden-ish offset per
  // band so nodes on adjacent bands don't line up radially.
  orderedOuter.forEach((n, i) => {
    const band = i % OUTER_BANDS.length;
    const a = -Math.PI / 2 + (i / total) * 2 * Math.PI + band * 0.12;
    const r = OUTER_BANDS[band];
    placed.set(n.id, {
      node: n,
      x: CENTER + r * Math.cos(a),
      y: CENTER + r * Math.sin(a),
    });
  });

  return placed;
}

function nodeRadius(node: ThreadNode, isAnchor: boolean): number {
  if (isAnchor) return ANCHOR_R;
  if (node.kind === 'elite') return ELITE_R;
  if (node.kind === 'connection') return CONNECTION_R;
  return TEAMMATE_R;
}

// ─── Pan & zoom ─────────────────────────────────────────────────────────────

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.3;

interface Transform {
  x: number;
  y: number;
  scale: number;
}

/** Transform + whether the CURRENT change should animate. Button-driven zoom
 *  and reset animate smoothly; live drag/wheel/pinch must apply instantly or
 *  the transition fights the gesture and the canvas visibly lags the pointer. */
interface TransformState extends Transform {
  animate: boolean;
}

/** Computes the initial fit transform: centers + scales the bounding box of
 *  all placed nodes to fill the wrapper, with padding. */
function fitTransform(placed: Map<string, Placed>, wrapW: number, wrapH: number): Transform {
  const pts = Array.from(placed.values());
  if (pts.length === 0 || wrapW === 0 || wrapH === 0) {
    return { x: 0, y: 0, scale: 1 };
  }
  const pad = 90;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(wrapW / boxW, wrapH / boxH)));
  const boxCx = (minX + maxX) / 2;
  const boxCy = (minY + maxY) / 2;
  return {
    x: wrapW / 2 - boxCx * scale,
    y: wrapH / 2 - boxCy * scale,
    scale,
  };
}

/** Pan/zoom controller: owns the transform, drag-to-pan, wheel/pinch-to-zoom
 *  (toward cursor/midpoint), and +/-/reset. Computes the initial fit once the
 *  wrapper has a measured size and the layout is known. */
function usePanZoom(placed: Map<string, Placed>) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<TransformState>({ x: 0, y: 0, scale: 1, animate: false });
  const initialFit = useRef<Transform | null>(null);
  const hasFit = useRef(false);

  const applyFit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fit = fitTransform(placed, rect.width, rect.height);
    initialFit.current = fit;
    setTransform({ ...fit, animate: false });
    hasFit.current = true;
  }, [placed]);

  useEffect(() => {
    hasFit.current = false;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0) return;
      if (!hasFit.current) {
        applyFit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyFit]);

  /** Wheel/pinch zoom — applies instantly (no transition), since it tracks a
   *  live gesture and any easing would make the canvas lag the cursor/fingers. */
  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    setTransform((t) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));
      const ratio = nextScale / t.scale;
      // Keep the point under the cursor fixed on-screen.
      return {
        scale: nextScale,
        x: px - (px - t.x) * ratio,
        y: py - (py - t.y) * ratio,
        animate: false,
      };
    });
  }, []);

  /** Button-driven zoom (+/-) — animates, since it's a discrete step rather
   *  than a live gesture. */
  const zoomAtCenter = useCallback((factor: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = rect.width / 2;
    const py = rect.height / 2;
    setTransform((t) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));
      const ratio = nextScale / t.scale;
      return {
        scale: nextScale,
        x: px - (px - t.x) * ratio,
        y: py - (py - t.y) * ratio,
        animate: true,
      };
    });
  }, []);

  const pan = useCallback((dx: number, dy: number) => {
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy, animate: false }));
  }, []);

  const reset = useCallback(() => {
    if (initialFit.current) setTransform({ ...initialFit.current, animate: true });
  }, []);

  return { wrapRef, transform, zoomAt, zoomAtCenter, pan, reset };
}

/** Wires drag-to-pan + wheel-zoom + pinch-zoom onto the wrapper element. Pure
 *  event plumbing, kept separate from usePanZoom's state so ThreadGraph's JSX
 *  stays readable. Returns a ref that's true for a brief window right after a
 *  real drag — the canvas's onClick handler checks it so a pan gesture that
 *  ends over empty space doesn't get misread as a background click clearing
 *  the open popover. */
function usePanZoomEvents(
  wrapRef: React.RefObject<HTMLDivElement | null>,
  zoomAt: (x: number, y: number, factor: number) => void,
  pan: (dx: number, dy: number) => void,
): React.RefObject<boolean> {
  const justDraggedRef = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    // Active pointers for pinch-zoom (touch).
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStartDist = 0;

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const onPointerDown = (e: PointerEvent) => {
      if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        dragging = true;
        moved = false;
        lastX = e.clientX;
        lastY = e.clientY;
        // Direct style write (not React state) — this fires every pointerdown
        // and must not cause a re-render mid-gesture.
        el.style.cursor = 'grabbing';
      } else if (pointers.size === 2) {
        dragging = false;
        const [a, b] = Array.from(pointers.values());
        pinchStartDist = dist(a, b) || 1;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const d = dist(a, b) || 1;
        const factor = d / (pinchStartDist || 1);
        if (Math.abs(factor - 1) > 0.01) {
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          zoomAt(midX, midY, factor);
          pinchStartDist = d;
        }
        return;
      }

      if (dragging && pointers.size === 1) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        lastX = e.clientX;
        lastY = e.clientY;
        pan(dx, dy);
      }
    };

    const endPointer = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStartDist = 0;
      if (pointers.size === 0) {
        dragging = false;
        el.style.cursor = 'grab';
        if (moved) {
          // Real drag — flag it so the imminent synthetic click on the
          // canvas doesn't clear the popover/highlight. Cleared on the next
          // tick since a click always fires right after pointerup.
          justDraggedRef.current = true;
          setTimeout(() => {
            justDraggedRef.current = false;
          }, 0);
        }
        moved = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(e.clientX, e.clientY, factor);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPointer);
      el.removeEventListener('pointercancel', endPointer);
      el.removeEventListener('wheel', onWheel);
    };
  }, [wrapRef, zoomAt, pan]);

  return justDraggedRef;
}

// ─── Graph ──────────────────────────────────────────────────────────────────

function ThreadGraph({
  anchor,
  nodes,
  edges,
  anchorDisplayName,
  anchorHeadshotUrl,
}: {
  anchor: ThreadNode;
  nodes: ThreadNode[];
  edges: ThreadEdge[];
  anchorDisplayName: string;
  anchorHeadshotUrl: string | null;
}) {
  const [lens, setLens] = useState<Lens>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [popoverId, setPopoverId] = useState<string | null>(null);

  const placed = useMemo(() => buildLayout(anchor, nodes), [anchor, nodes]);
  const nodeById = useMemo(() => {
    const m = new Map<string, ThreadNode>(nodes.map((n) => [n.id, n]));
    m.set(anchor.id, anchor);
    return m;
  }, [nodes, anchor]);

  const { wrapRef, transform, zoomAt, zoomAtCenter, pan, reset } = usePanZoom(placed);
  const justDraggedRef = usePanZoomEvents(wrapRef, zoomAt, pan);

  // Which nodes/edges the current lens shows.
  const visible = useMemo(() => {
    const teammateIds = new Set(nodes.filter((n) => n.kind === 'teammate').map((n) => n.id));
    const eliteIds = new Set(nodes.filter((n) => n.kind === 'elite').map((n) => n.id));
    const connectionIds = new Set(nodes.filter((n) => n.kind === 'connection').map((n) => n.id));

    let nodeIds: Set<string>;
    let edgeList: ThreadEdge[];

    if (lens === 'circle') {
      nodeIds = new Set([anchor.id, ...teammateIds]);
      edgeList = edges.filter((e) => e.kind === 'direct');
    } else if (lens === 'shared') {
      const sharedTeammateIds = new Set<string>();
      for (const e of edges) {
        if (e.kind === 'shared') {
          sharedTeammateIds.add(e.a);
          sharedTeammateIds.add(e.b);
        }
      }
      nodeIds = new Set([anchor.id, ...sharedTeammateIds]);
      edgeList = edges.filter((e) => e.kind === 'shared' || (e.kind === 'direct' && sharedTeammateIds.has(e.b)));
    } else if (lens === 'paths') {
      const bridgingTeammateIds = new Set<string>();
      for (const n of nodes) {
        if (n.kind === 'elite' && n.via) bridgingTeammateIds.add(n.via);
      }
      nodeIds = new Set([anchor.id, ...bridgingTeammateIds, ...eliteIds]);
      edgeList = edges.filter(
        (e) => e.kind === 'elite' || (e.kind === 'direct' && bridgingTeammateIds.has(e.b)),
      );
    } else {
      nodeIds = new Set([anchor.id, ...teammateIds, ...eliteIds, ...connectionIds]);
      edgeList = edges;
    }

    return { nodeIds, edgeList };
  }, [lens, anchor, nodes, edges]);

  // Edges touching the hovered/focused node — used to highlight + dim.
  const highlightEdgeKeys = useMemo(() => {
    if (!activeId) return null;
    const keys = new Set<string>();
    for (const e of visible.edgeList) {
      if (e.a === activeId || e.b === activeId) keys.add(`${e.a}|${e.b}|${e.kind}`);
    }
    return keys;
  }, [activeId, visible.edgeList]);

  const connectedToActive = useMemo(() => {
    if (!activeId) return null;
    const ids = new Set<string>([activeId]);
    for (const e of visible.edgeList) {
      if (e.a === activeId) ids.add(e.b);
      if (e.b === activeId) ids.add(e.a);
    }
    return ids;
  }, [activeId, visible.edgeList]);

  const popoverNode = popoverId ? nodeById.get(popoverId) ?? null : null;

  const handleNodeClick = useCallback((id: string) => {
    // Ignore the synthetic click a drag gesture leaves behind when it ends
    // on top of a node — otherwise panning across the graph pops open every
    // node it passes over.
    if (justDraggedRef.current) return;
    setPopoverId((cur) => (cur === id ? null : id));
  }, [justDraggedRef]);

  return (
    <div className="flex flex-col gap-5">
      <LensRow lens={lens} onChange={(l) => { setLens(l); setActiveId(null); setPopoverId(null); }} />

      <div
        ref={wrapRef}
        className="relative w-full rounded-card-lg bg-surface shadow-card overflow-hidden touch-none select-none"
        style={{ height: 'min(72vh, 720px)', cursor: 'grab' }}
      >
        <div
          className={[
            'absolute top-0 left-0 origin-top-left will-change-transform',
            transform.animate ? 'motion-safe:transition-transform motion-safe:duration-200' : '',
          ].join(' ')}
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
          onClick={(e) => {
            // Clicking empty canvas space clears the popover/highlight — but
            // not if this "click" is actually the tail end of a pan gesture.
            if (e.target === e.currentTarget && !justDraggedRef.current) {
              setActiveId(null);
              setPopoverId(null);
            }
          }}
        >
          <svg
            className="absolute inset-0 pointer-events-none overflow-visible"
            width={CANVAS_W}
            height={CANVAS_H}
            aria-hidden="true"
          >
            {visible.edgeList.map((e) => {
              const a = placed.get(e.a);
              const b = placed.get(e.b);
              if (!a || !b) return null;
              const key = `${e.a}|${e.b}|${e.kind}`;
              const dimmed = highlightEdgeKeys !== null && !highlightEdgeKeys.has(key);
              const highlighted = highlightEdgeKeys !== null && highlightEdgeKeys.has(key);
              return (
                <ThreadEdgeLine
                  key={key}
                  edge={e}
                  from={a}
                  to={b}
                  dimmed={dimmed}
                  highlighted={highlighted}
                  lens={lens}
                />
              );
            })}
          </svg>

          {Array.from(placed.values())
            .filter((p) => visible.nodeIds.has(p.node.id))
            .map((p) => {
              const dimmed = connectedToActive !== null && !connectedToActive.has(p.node.id);
              return (
                <GraphNode
                  key={p.node.id}
                  placed={p}
                  isAnchor={p.node.id === anchor.id}
                  anchorDisplayName={anchorDisplayName}
                  anchorHeadshotUrl={anchorHeadshotUrl}
                  dimmed={dimmed}
                  onHover={setActiveId}
                  onClick={handleNodeClick}
                />
              );
            })}
        </div>

        <ZoomControls onZoomIn={() => zoomAtCenter(ZOOM_STEP)} onZoomOut={() => zoomAtCenter(1 / ZOOM_STEP)} onReset={reset} />

        <span className="pointer-events-none absolute top-3 left-3 text-[10px] font-bold tracking-[0.08em] uppercase text-faint bg-bg/70 backdrop-blur-sm px-2.5 py-1 rounded-full">
          Drag to explore · scroll to zoom
        </span>

        {popoverNode && (
          <NodePopover
            node={popoverNode}
            isAnchor={popoverNode.id === anchor.id}
            anchorDisplayName={anchorDisplayName}
            resolveVia={(id) => nodeById.get(id)?.label ?? null}
            onClose={() => setPopoverId(null)}
          />
        )}
      </div>

      <Legend />

      <p className="text-[10px] text-faint font-tight text-center px-4">
        Connections are matched by name across UFA, USAU, PUL &amp; WUL — occasional mismatches are expected.
      </p>
    </div>
  );
}

function ZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  const btn =
    'flex items-center justify-center h-9 w-9 rounded-full bg-bg/90 backdrop-blur-sm shadow-soft text-ink ' +
    'hover:bg-ink/5 active:scale-95 motion-safe:transition-transform motion-safe:duration-100 cursor-pointer ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  return (
    <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 z-10">
      <button type="button" onClick={onZoomIn} aria-label="Zoom in" className={btn}>
        <PlusIcon />
      </button>
      <button type="button" onClick={onZoomOut} aria-label="Zoom out" className={btn}>
        <MinusIcon />
      </button>
      <button type="button" onClick={onReset} aria-label="Reset view" className={btn}>
        <ResetIcon />
      </button>
    </div>
  );
}

function LensRow({ lens, onChange }: { lens: Lens; onChange: (l: Lens) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Connection lens">
      {LENS_OPTIONS.map((opt) => {
        const active = opt.value === lens;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={[
              'inline-flex items-center px-3.5 py-1.5 rounded-full text-[10.5px] font-bold tracking-[0.08em] uppercase font-tight',
              'transition-colors duration-150 min-h-[36px] cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active ? 'bg-ink text-bg' : 'bg-ink/5 text-muted hover:text-ink',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
      <LegendLine className="bg-accent" label="Direct teammate" />
      <LegendLine className="border-t-2 border-dashed border-accent/60 bg-transparent h-0" label="Shared history" />
      <LegendLine className="" style={{ backgroundColor: GOLD }} label="Path to elite" />
      <LegendDot className="border border-ink/15 bg-transparent" label="Connection" />
    </div>
  );
}

function LegendLine({ className, label, style }: { className: string; label: string; style?: React.CSSProperties }) {
  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-semibold text-faint">
      <span className={`inline-block w-5 h-[3px] rounded-full ${className}`} style={style} aria-hidden="true" />
      {label}
    </span>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-semibold text-faint">
      <span className={`inline-block w-3 h-3 rounded-full ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

// ─── Edge rendering ─────────────────────────────────────────────────────────

function ThreadEdgeLine({
  edge,
  from,
  to,
  dimmed,
  highlighted,
  lens,
}: {
  edge: ThreadEdge;
  from: Placed;
  to: Placed;
  dimmed: boolean;
  /** A node is active and this edge touches it — show its context label. */
  highlighted: boolean;
  lens: Lens;
}) {
  const opacity = dimmed ? 0.12 : 1;

  if (edge.kind === 'direct') {
    // Thickness ∝ weight — stronger bond, thicker line. Kept slim (max 3px) so
    // the accent spokes read as connective tissue, not bold bars that dominate
    // the canvas and swallow the node circles.
    const width = Math.max(1, Math.min(3, 1 + edge.weight * 1.75));
    // Stop each end short of its node's circle (plus a small gap) instead of
    // running to the center — so the spoke meets the node's edge rather than
    // plunging through the ring. An endpoint sitting at CENTER is the anchor.
    const fromR = nodeRadius(from.node, from.x === CENTER && from.y === CENTER) + 4;
    const toR = nodeRadius(to.node, to.x === CENTER && to.y === CENTER) + 4;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Guard: if the nodes are so close their radii overlap, don't invert the line.
    const usable = Math.max(0, len - fromR - toR);
    const x1 = from.x + ux * fromR;
    const y1 = from.y + uy * fromR;
    const x2 = x1 + ux * usable;
    const y2 = y1 + uy * usable;
    return (
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="rgb(var(--accent))"
        strokeWidth={width}
        strokeLinecap="round"
        opacity={opacity}
        className="motion-safe:transition-opacity motion-safe:duration-200"
      />
    );
  }

  if (edge.kind === 'shared') {
    // Curved dashed line between two teammates — bows outward (away from
    // canvas center) so it reads as a distinct arc rather than overlapping
    // the straight anchor spokes.
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const vx = to.x - from.x;
    const vy = to.y - from.y;
    const len = Math.hypot(vx, vy) || 1;
    const nx = -vy / len;
    const ny = vx / len;
    // Push outward: pick the normal direction pointing away from center.
    const towardCenterX = CENTER - midX;
    const towardCenterY = CENTER - midY;
    const sign = nx * towardCenterX + ny * towardCenterY > 0 ? -1 : 1;
    const bow = Math.min(48, len * 0.28);
    const ctrlX = midX + nx * bow * sign;
    const ctrlY = midY + ny * bow * sign;

    // On "all" the shared web is many overlapping arcs — keep it SUBTLE (thin,
    // low-opacity, no labels) so it reads as background texture. The label only
    // appears when this edge is highlighted (a node is active) or when the
    // "Shared history" lens is focused on exactly these connections.
    const isSharedLens = lens === 'shared';
    const showLabel = highlighted || isSharedLens;
    const baseOpacity = isSharedLens ? 1 : highlighted ? 1 : 0.35;
    return (
      <g opacity={opacity * baseOpacity} className="motion-safe:transition-opacity motion-safe:duration-200">
        <path
          d={`M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth={highlighted || isSharedLens ? 1.75 : 1}
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
        {showLabel && (
          <text
            x={ctrlX}
            y={ctrlY}
            textAnchor="middle"
            className="fill-accent"
            style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            also teammates
          </text>
        )}
      </g>
    );
  }

  if (edge.kind === 'elite') {
    return (
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={GOLD}
        strokeWidth={1.75}
        strokeDasharray="1 4"
        strokeLinecap="round"
        opacity={opacity}
        className="motion-safe:transition-opacity motion-safe:duration-200"
      />
    );
  }

  // bridge edge — teammate → non-elite connection. Quieter than an elite
  // bridge: thinner, neutral-toned, lower base opacity so gold paths still
  // read as the "main event" of the outer ring.
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke="rgb(var(--ink))"
      strokeWidth={1}
      strokeDasharray="1 5"
      strokeLinecap="round"
      opacity={dimmed ? 0.12 : 0.22}
      className="motion-safe:transition-opacity motion-safe:duration-200"
    />
  );
}

// ─── Node rendering ─────────────────────────────────────────────────────────

function GraphNode({
  placed,
  isAnchor,
  anchorDisplayName,
  anchorHeadshotUrl,
  dimmed,
  onHover,
  onClick,
}: {
  placed: Placed;
  isAnchor: boolean;
  anchorDisplayName: string;
  anchorHeadshotUrl: string | null;
  dimmed: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const { node, x, y } = placed;
  const r = nodeRadius(node, isAnchor);
  const size = r * 2;
  const isElite = node.kind === 'elite';
  const isConnection = node.kind === 'connection';
  const isSuperstar = isElite && node.score != null && node.score >= 93;

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onClick(node.id);
      }}
      aria-label={`${node.label}${node.score != null ? `, rating ${node.score}` : ''}${isElite ? ', elite player' : ''}`}
      className={[
        'absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5',
        'motion-safe:transition-opacity motion-safe:duration-200 cursor-pointer group',
        'focus-visible:outline-none',
        // Comfortable touch target on the smallest (connection) nodes even
        // though the visual circle itself is smaller.
        'min-h-[36px] min-w-[36px]',
      ].join(' ')}
      style={{ left: x, top: y, opacity: dimmed ? 0.25 : 1 }}
    >
      <span
        className={[
          'relative flex items-center justify-center rounded-full overflow-hidden',
          isConnection ? '' : 'shadow-soft',
          'group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-bg',
          isAnchor ? 'bg-accent' : isElite ? 'bg-surface-hi' : isConnection ? 'bg-surface' : 'bg-ink/5',
          isConnection ? 'border border-ink/15' : '',
        ].join(' ')}
        style={{
          width: size,
          height: size,
          boxShadow: isElite
            ? `0 0 0 2.5px ${GOLD}, var(--shadow-soft)`
            : isAnchor
              ? '0 0 0 3px rgb(var(--accent) / 0.35), var(--shadow-card)'
              : undefined,
        }}
      >
        {isAnchor ? (
          <span style={{ width: size - 6, height: size - 6 }} className="rounded-full overflow-hidden">
            <PlayerHeadshot headshotUrl={anchorHeadshotUrl} displayName={anchorDisplayName} size={size} />
          </span>
        ) : (
          <span
            className={[
              'font-display italic font-bold',
              isElite ? 'text-ink' : isConnection ? 'text-faint' : 'text-muted',
            ].join(' ')}
            style={{ fontSize: size * 0.32 }}
          >
            {initials(node.label)}
          </span>
        )}
        {isSuperstar && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full bg-bg shadow-soft"
            style={{ width: size * 0.36, height: size * 0.36 }}
            aria-hidden="true"
          >
            <StarIcon size={size * 0.22} color={GOLD} />
          </span>
        )}
      </span>
      <span
        className={[
          'font-tight font-bold leading-tight text-center max-w-[92px] truncate',
          isAnchor ? 'text-[13px] text-ink' : isConnection ? 'text-[10px] text-muted' : 'text-[11px] text-ink',
        ].join(' ')}
      >
        {node.label}
      </span>
      {node.score != null && (
        <span className="text-[9px] font-extrabold tabular text-faint -mt-1">{node.score}</span>
      )}
    </button>
  );
}

function NodePopover({
  node,
  isAnchor,
  anchorDisplayName,
  resolveVia,
  onClose,
}: {
  node: ThreadNode;
  isAnchor: boolean;
  anchorDisplayName: string;
  resolveVia: (id: string) => string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isElite = node.kind === 'elite';
  const isConnection = node.kind === 'connection';
  const viaName = node.via ? resolveVia(node.via) : null;

  return (
    <div className="absolute bottom-3 left-3 right-3 sm:left-4 sm:right-auto sm:w-72 z-10">
      <div className="rounded-card bg-bg shadow-lift px-4 py-3.5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display italic text-[16px] font-bold text-ink truncate">{node.label}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            {node.leagues.map((lg) => (
              <span
                key={lg}
                className="text-[9px] font-bold tracking-[0.1em] uppercase text-faint px-1.5 py-0.5 rounded-full bg-ink/5"
              >
                {lg}
              </span>
            ))}
          </div>
          {node.score != null && (
            <p className="text-[11px] text-muted font-tight mt-1.5">
              Rating <span className="font-bold tabular text-ink">{node.score}</span>
              {isElite && node.score >= 93 ? ' · Superstar' : isElite ? ' · Elite' : ''}
            </p>
          )}
          {!isAnchor && node.kind === 'teammate' && node.weight != null && (
            <p className="text-[11px] text-muted font-tight mt-0.5">Bond strength {node.weight.toFixed(2)}</p>
          )}
          {(isElite || isConnection) && viaName && (
            <p className="text-[11px] text-muted font-tight mt-0.5">
              via <span className="font-bold text-ink">{viaName}</span> — never teamed up with{' '}
              {anchorDisplayName}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-8 h-8 rounded-full flex items-center justify-center text-faint hover:text-ink hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors duration-150 cursor-pointer flex-shrink-0 -mt-1 -mr-1"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 2l10 10M12 2l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0][0]?.toUpperCase() ?? '';
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} aria-hidden="true">
      <path d="M8 0l2.19 5.02L16 5.64l-4.36 3.86L12.9 15 8 11.9 3.1 15l1.26-5.5L0 5.64l5.81-.62L8 0z" />
    </svg>
  );
}

function WebIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 8h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.89M13.5 2.5v3.2h-3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
