'use client';

// FormationSelect — pick a formation (vert / ho / hex / 3-2) to start
// building a squad. Data-driven off FORMATION_ORDER. This is the game's most
// "sports" moment, so each card gets a coach's-whiteboard MINI FIELD DIAGRAM
// (dots arranged to suggest the real shape) instead of a meaningless dot row —
// the previous glyph was just 7 same-size dots in a line, which didn't read
// as a play at all.

import { FORMATIONS, FORMATION_ORDER, type FormationKey, type Formation } from '@/lib/utcg/formations';

// Dot layout per formation, as [x%, y%] pairs on a 0–100 pitch (y=0 is the
// "back" / handler end, y=100 is downfield). Ordered handler-first to match
// formation.slots, purely for a stable render key — the shapes are hand-
// placed to suggest each real play, not derived from slot order.
const FORMATION_LAYOUT: Record<FormationKey, { handlers: [number, number][]; cutters: [number, number][] }> = {
  // Vert stack: single column of cutters straight up the middle, 2 handlers
  // clustered at the back.
  vert: {
    handlers: [[38, 88], [62, 88]],
    cutters: [[50, 66], [50, 50], [50, 34], [50, 18], [50, 4]],
  },
  // Ho stack: 3 handlers in a row across the back, 4 cutters spread on a
  // horizontal line underneath them.
  ho: {
    handlers: [[26, 84], [50, 88], [74, 84]],
    cutters: [[14, 40], [38, 30], [62, 30], [86, 40]],
  },
  // Hex: positionless — a connected hexagonal ring, no back/front split.
  hex: {
    handlers: [[50, 84], [18, 58], [82, 58]],
    cutters: [[50, 10], [18, 36], [82, 36]],
  },
  // 3-2 stack: two side lanes of cutters (3 + 2) opening a wide downfield
  // lane, handlers at the back — same split as vert but visibly wider.
  threeTwo: {
    handlers: [[38, 88], [62, 88]],
    cutters: [[16, 58], [16, 34], [16, 10], [84, 46], [84, 18]],
  },
};

// Small coach's-whiteboard field diagram: a pitch rectangle with a faint
// center line, handler dots in accent, cutter dots in ink/muted.
function FormationGlyph({ formation }: { formation: Formation }) {
  const layout = FORMATION_LAYOUT[formation.key];
  return (
    <div
      className="relative w-full rounded-card-sm bg-ink/[0.035] overflow-hidden"
      style={{ aspectRatio: '4 / 3' }}
      aria-hidden="true"
    >
      {/* Faint center line suggesting a pitch */}
      <span className="absolute inset-x-0 top-1/2 h-px bg-ink/10" />
      {layout.handlers.map(([x, y], i) => (
        <span
          key={`h${i}`}
          className="absolute rounded-full bg-accent -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${x}%`, top: `${y}%`, width: 8, height: 8 }}
        />
      ))}
      {layout.cutters.map(([x, y], i) => (
        <span
          key={`c${i}`}
          className="absolute rounded-full bg-ink/35 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${x}%`, top: `${y}%`, width: 8, height: 8 }}
        />
      ))}
    </div>
  );
}

function FormationCard({ formation, onSelect }: { formation: Formation; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Select ${formation.name} formation`}
      className={[
        'group text-left rounded-card',
        'bg-surface shadow-card hover:shadow-lift',
        'motion-safe:transition-shadow motion-safe:duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'flex flex-col gap-3 p-4 cursor-pointer',
      ].join(' ')}
    >
      <FormationGlyph formation={formation} />

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-display italic text-lg font-bold text-ink leading-tight tracking-[-0.02em]">
            {formation.name}
          </span>
          <span className="text-[11.5px] text-muted font-tight leading-snug">
            {formation.tagline}
          </span>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0 mt-1 text-faint group-hover:text-accent motion-safe:transition-colors motion-safe:duration-150">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  );
}

interface FormationSelectProps {
  onSelect: (key: FormationKey) => void;
  /** Optional — when set, renders a "Back" control that returns to the Play
   *  mode-select screen. Omitted when this screen is the entry point. */
  onBack?: () => void;
}

export function FormationSelect({ onSelect, onBack }: FormationSelectProps) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8 py-4 sm:py-8">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className={[
            'self-start inline-flex items-center gap-1.5 -mb-2',
            'text-[11px] font-bold uppercase tracking-[0.14em] text-muted font-tight',
            'hover:text-accent motion-safe:transition-colors motion-safe:duration-150',
            'cursor-pointer min-h-[44px] px-1',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm',
          ].join(' ')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M8.5 3 4.5 7l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      )}

      <div className="text-center">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted font-tight mb-1.5 sm:mb-3">
          Build Your Squad
        </p>
        <h2 className="font-display italic text-3xl sm:text-5xl font-bold text-ink leading-[0.95] tracking-[-0.02em]">
          Choose a <span className="text-accent">formation</span>
        </h2>
        <p className="text-sm text-muted font-tight mt-2 sm:mt-3 max-w-[340px] mx-auto">
          Each formation splits your 7 slots between handlers and cutters. Pick the shape that fits your collection.
        </p>
      </div>

      {/* Two formations (Vert / Ho) — centered and width-capped so they don't
          stretch edge-to-edge on wide viewports. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-md mx-auto">
        {FORMATION_ORDER.map((key) => (
          <FormationCard key={key} formation={FORMATIONS[key]} onSelect={() => onSelect(key)} />
        ))}
      </div>
    </div>
  );
}
