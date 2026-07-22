'use client';

// ChemistryMeter — live "X/21" team chemistry + rating readout for the squad
// builder. Matches the authoritative mock's .meter (utcg-squad-app.jsx /
// squad-builder.css) 3-column layout exactly: TEAM CHEMISTRY value (left) —
// a full-width 21-pip row spanning both columns (row 2) — RATING value
// (right). A self-contained card; the squad builder renders this directly
// under the heading, not wrapped in another card. Pips fill coral with a
// glow when earned; the whole meter gets a brief coral pulse ring whenever
// the total crosses a 7-point milestone (7/14/21), mirroring the mock's
// pulse-on-milestone behavior.
//
// Pip COLOR is uniform coral-when-earned (not reason-tinted) per the mock —
// the per-slot chem TAG on the field (SquadBuilder's Field component) is what
// shows team/division/league provenance; this meter is the aggregate readout.

import { useEffect, useRef, useState } from 'react';
import type { CardChemResult } from '@/lib/utcg/chemistry';
import { MAX_TEAM_CHEM } from '@/lib/utcg/chemistry';

interface ChemistryMeterProps {
  total: number;
  perCard: CardChemResult[];
  /** Live mean rating, or null before any slot is filled — rendered in the
   *  meter's right column, matching the mock's combined chemistry+rating bar. */
  rating?: number | null;
}

export function ChemistryMeter({ total, rating }: ChemistryMeterProps) {
  const filledPips = Math.round(total);

  // Pulse whenever the total crosses a 7-point milestone, matching the
  // mock's `Math.floor(chem/7) > Math.floor(prevChem/7)` trigger.
  const [pulse, setPulse] = useState(false);
  const prevTotal = useRef(total);
  useEffect(() => {
    if (total > prevTotal.current && Math.floor(total / 7) > Math.floor(prevTotal.current / 7)) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 620);
      return () => clearTimeout(t);
    }
    prevTotal.current = total;
  }, [total]);

  return (
    <div
      className={[
        'rounded-card-lg bg-surface shadow-card p-3.5 grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-2.5 items-center',
        'motion-safe:transition-shadow motion-safe:duration-300',
        pulse ? 'motion-safe:animate-pulse-once' : '',
      ].join(' ')}
      style={pulse ? { boxShadow: '0 0 0 2px #FF3D00, 0 12px 30px rgba(255,61,0,0.3)' } : undefined}
    >
      <div>
        <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-faint leading-none">Team Chemistry</p>
        <p className="font-display italic font-bold text-[28px] text-accent tabular leading-none mt-1">
          {filledPips}
          <span className="text-[13px] text-faint ml-0.5">/{MAX_TEAM_CHEM}</span>
        </p>
      </div>

      {rating !== undefined && (
        <div className="text-right">
          <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-faint leading-none">Rating</p>
          <p className="font-display italic font-bold text-[28px] text-ink tabular leading-none mt-1">
            {rating === null ? '—' : rating}
          </p>
        </div>
      )}

      <div className="col-span-3 flex gap-[3px]" role="img" aria-label={`Team chemistry ${filledPips} of ${MAX_TEAM_CHEM}`}>
        {Array.from({ length: MAX_TEAM_CHEM }).map((_, i) => {
          const on = i < filledPips;
          return (
            <span
              key={i}
              className={[
                'flex-1 h-2 rounded-[3px] motion-safe:transition-[background-color,box-shadow] motion-safe:duration-300',
                on ? 'bg-accent shadow-[0_0_8px_rgba(255,61,0,0.5)]' : 'bg-ink/10',
              ].join(' ')}
              style={{ transitionDelay: `${i * 10}ms` }}
            />
          );
        })}
      </div>
    </div>
  );
}
