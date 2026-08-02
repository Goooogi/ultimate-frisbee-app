'use client';

// WantCard — an "ISO" post. No photo (there's nothing to photograph — the
// person doesn't have the jersey yet), so this is a text-forward row rather
// than the photo tile a listing gets.

import { PosterByline } from '@/components/jerseys/poster-byline';
import { jerseyLocationLine, jerseyTargetLine, type JerseyWant } from '@/lib/jerseys/types';

export function WantCard({
  want,
  onMessage,
}: {
  want: JerseyWant;
  /** Omitted on the public board for signed-out users. */
  onMessage?: (want: JerseyWant) => void;
}) {
  const target = jerseyTargetLine(want) ?? want.leagueName ?? 'Any jersey';
  const where = jerseyLocationLine(want);

  return (
    <div className="flex flex-col gap-2 p-3.5 rounded-card-lg bg-surface shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center px-2 py-[3px] rounded-full bg-accent/15 text-accent text-[9px] font-extrabold tracking-[0.08em] uppercase font-tight">
          Looking for
        </span>
        {want.size && (
          <span className="inline-flex items-center px-2 py-[2px] rounded-full bg-ink/5 text-muted text-[10px] font-semibold font-tight flex-shrink-0">
            {want.size}
          </span>
        )}
      </div>

      <span className="text-[14px] font-bold text-ink font-tight leading-snug">{target}</span>

      {want.leagueName && jerseyTargetLine(want) && (
        <span className="text-[11.5px] text-muted font-tight">{want.leagueName}</span>
      )}

      {want.note && (
        <p className="text-[12px] text-muted font-tight leading-snug line-clamp-3">{want.note}</p>
      )}

      {want.events.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {want.events.slice(0, 2).map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full bg-ink/5 text-[10px] font-semibold text-muted font-tight"
            >
              {e.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-1 pt-2 border-t border-hairline/60">
        <PosterByline poster={want.user} size={20} subtitle={where} />
        {onMessage && (
          <button
            type="button"
            onClick={() => onMessage(want)}
            className="inline-flex items-center px-3 min-h-[30px] rounded-full bg-ink/5 text-ink text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight hover:bg-ink/10 cursor-pointer motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent flex-shrink-0"
          >
            I have this
          </button>
        )}
      </div>
    </div>
  );
}
