'use client';

// Tiny SVG diagram showing a formation's player positions. Used by the
// FormationPicker so users can see what each preset looks like at a glance
// instead of guessing from the label.

import { PRESETS } from '@/lib/playbook/presets';
import { normToSvg, FIELD_W_YD, FIELD_H_YD, ENDZONE_RATIO } from '@/lib/playbook/field';
import type { FormationID } from '@/lib/playbook/types';

interface FormationPreviewProps {
  formation: Exclude<FormationID, 'custom'>;
  active?: boolean;
  /** Tint colors via CSS vars by default. Override for the active state. */
  className?: string;
}

export function FormationPreview({ formation, active, className }: FormationPreviewProps) {
  const players = PRESETS[formation];
  const ezH = ENDZONE_RATIO * FIELD_H_YD;
  // Offense is one color (accent) regardless of role — same convention as
  // the editor field. Active state flips to the inverse so dots read on the
  // accent-filled card background.
  const handlerColor = active ? 'rgb(var(--accent-ink))' : 'rgb(var(--accent))';
  const cutterColor = handlerColor;
  const fieldBg = active ? 'rgba(255,255,255,0.18)' : 'rgb(var(--surface))';
  const ezBg = active ? 'rgba(255,255,255,0.10)' : 'rgb(var(--surface-hi))';
  const lineCol = active ? 'rgba(255,255,255,0.35)' : 'rgb(var(--hairline))';

  return (
    <svg
      viewBox={`0 0 ${FIELD_W_YD} ${FIELD_H_YD}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      <rect x="0" y="0" width={FIELD_W_YD} height={FIELD_H_YD} fill={fieldBg} />
      <rect x="0" y="0" width={FIELD_W_YD} height={ezH} fill={ezBg} />
      <rect x="0" y={FIELD_H_YD - ezH} width={FIELD_W_YD} height={ezH} fill={ezBg} />
      <line x1="0" y1={ezH} x2={FIELD_W_YD} y2={ezH} stroke={lineCol} strokeWidth="0.5" />
      <line
        x1="0"
        y1={FIELD_H_YD - ezH}
        x2={FIELD_W_YD}
        y2={FIELD_H_YD - ezH}
        stroke={lineCol}
        strokeWidth="0.5"
      />
      {players.map((p) => {
        const { svgX, svgY } = normToSvg(p.x, p.y);
        return (
          <circle
            key={p.id}
            cx={svgX}
            cy={svgY}
            r={p.role === 'handler' ? 4.2 : 3.6}
            fill={p.role === 'handler' ? handlerColor : cutterColor}
          />
        );
      })}
    </svg>
  );
}
