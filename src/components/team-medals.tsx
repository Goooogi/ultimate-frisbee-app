// Championship / podium medals for a team page.
//
// Two shapes feed this, but they render the same way:
//   - USAU: National Championship finishes — a medal per year with the exact
//     placement (gold 1st / silver 2nd / bronze 3rd), optional division note.
//   - UFA / PUL / WUL: podium (top-3) playoff finishes per season.
//
// One medal chip per finish, gold/silver/bronze by place, newest year first.

export type MedalPlace = 1 | 2 | 3;

export interface TeamMedal {
  year: number;
  place: MedalPlace;
  /** Optional sub-label, e.g. a USAU division ("Men") or context. */
  note?: string;
}

const METAL: Record<MedalPlace, { ring: string; bg: string; text: string; label: string; ordinal: string }> = {
  1: { ring: 'border-[#C9A227]/60', bg: 'bg-[#C9A227]/12', text: 'text-[#8A6D1B]', label: 'Champion', ordinal: '1st' },
  2: { ring: 'border-[#9AA0A6]/60', bg: 'bg-[#9AA0A6]/14', text: 'text-[#5F6368]', label: 'Finalist', ordinal: '2nd' },
  3: { ring: 'border-[#B06A34]/55', bg: 'bg-[#B06A34]/12', text: 'text-[#8A4F24]', label: '3rd place', ordinal: '3rd' },
};

function MedalGlyph({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M9 3 7 8 M15 3l2 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A wrapping row of medal chips. Renders nothing when there are no medals, so
 * callers can drop it in unconditionally. Sorted best-place-first, then newest
 * year, so a team's gold years lead.
 */
export function TeamMedals({
  medals,
  heading = 'Honors',
  showPlace = false,
}: {
  medals: TeamMedal[];
  heading?: string;
  /** Show the placement (1st / 2nd / 3rd) next to the year. USAU wants the
   *  exact Nationals finish; the pro leagues just show a podium medal (color). */
  showPlace?: boolean;
}) {
  if (medals.length === 0) return null;

  const sorted = [...medals].sort((a, b) => a.place - b.place || b.year - a.year);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
        {heading}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((m, i) => {
          const c = METAL[m.place];
          return (
            <span
              key={`${m.year}-${m.place}-${i}`}
              title={`${m.year} · ${c.label}${m.note ? ` · ${m.note}` : ''}`}
              className={[
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-1',
                'text-[11px] font-bold font-tight tabular',
                c.ring,
                c.bg,
                c.text,
              ].join(' ')}
            >
              <MedalGlyph />
              <span>{m.year}</span>
              {showPlace && (
                <span className="font-semibold opacity-70 tracking-normal">{c.ordinal}</span>
              )}
              {m.note && (
                <span className="font-semibold opacity-70 tracking-normal">{m.note}</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
