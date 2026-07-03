// Championship / podium medals for a team page.
//
// Two shapes feed this, but they render the same way:
//   - USAU: National Championship finishes — a medal per year with the exact
//     placement (gold 1st / silver 2nd / bronze 3rd), optional division note.
//   - UFA / PUL / WUL: podium (top-3) playoff finishes per season.
//
// One medal chip per finish, gold/silver/bronze by place, best-place first.

export type MedalPlace = 1 | 2 | 3;

export interface TeamMedal {
  year: number;
  place: MedalPlace;
  /** Optional sub-label, e.g. a USAU division ("Men") or context. */
  note?: string;
}

// Per-place metallic palette. Each medal is a small enamelled disc (radial
// gradient + rim) on a tinted chip, so the three tiers read at a glance even
// without the ordinal. Colours are literal (not theme tokens) because a bronze
// medal is bronze in either theme; the surrounding chip uses subtle tints that
// sit well on both the light "field" and dark "broadcast" backgrounds.
const METAL: Record<
  MedalPlace,
  {
    label: string;
    ordinal: string;
    disc: string; // radial-gradient face of the medal
    rim: string; // darker ring around the disc
    chipBg: string;
    chipBorder: string;
    ink: string; // year text
    accent: string; // ordinal text
  }
> = {
  1: {
    label: 'Champion',
    ordinal: '1st',
    disc: 'radial-gradient(circle at 34% 30%, #FBE38A 0%, #E7C24A 42%, #B8891E 100%)',
    rim: '#8A6612',
    chipBg: 'linear-gradient(180deg, rgba(201,162,39,0.16) 0%, rgba(201,162,39,0.07) 100%)',
    chipBorder: 'rgba(201,162,39,0.55)',
    ink: '#7A5E14',
    accent: '#B8891E',
  },
  2: {
    label: 'Finalist',
    ordinal: '2nd',
    disc: 'radial-gradient(circle at 34% 30%, #F3F4F6 0%, #CFD3D8 44%, #9AA0A6 100%)',
    rim: '#787D83',
    chipBg: 'linear-gradient(180deg, rgba(154,160,166,0.18) 0%, rgba(154,160,166,0.08) 100%)',
    chipBorder: 'rgba(154,160,166,0.55)',
    ink: '#565A5F',
    accent: '#787D83',
  },
  3: {
    label: '3rd place',
    ordinal: '3rd',
    disc: 'radial-gradient(circle at 34% 30%, #E8AE7E 0%, #C67D46 44%, #97531F 100%)',
    rim: '#7C441A',
    chipBg: 'linear-gradient(180deg, rgba(176,106,52,0.15) 0%, rgba(176,106,52,0.07) 100%)',
    chipBorder: 'rgba(176,106,52,0.5)',
    ink: '#7C4A22',
    accent: '#A15A28',
  },
};

/** An enamelled medal disc — the visual anchor of a chip. A radial metallic
 *  face, a fluted rim, an engraved star, and a top gloss highlight so it reads
 *  as a physical medal rather than a flat dot. Sized in px to stay crisp. */
function MedalDisc({ place }: { place: MedalPlace }) {
  const c = METAL[place];
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex items-center justify-center rounded-full shrink-0"
      style={{
        width: 21,
        height: 21,
        background: c.disc,
        boxShadow: `inset 0 0 0 1.5px ${c.rim}, inset 0 1.5px 1.5px rgba(255,255,255,0.5), inset 0 -1.5px 2px rgba(0,0,0,0.22), 0 1px 2px rgba(0,0,0,0.22)`,
      }}
    >
      {/* Engraved star */}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4.5l2.1 4.4 4.8.6-3.5 3.3.9 4.8L12 19.9 7.7 17.6l.9-4.8L5 9.5l4.8-.6L12 4.5Z"
          fill={c.rim}
          fillOpacity="0.5"
        />
      </svg>
      {/* Specular gloss — a soft highlight across the upper-left curve. */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'linear-gradient(150deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 34%, rgba(255,255,255,0) 55%)',
        }}
      />
    </span>
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
    <div className="flex flex-col gap-2">
      <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
        {heading}
      </span>
      <div className="flex flex-wrap gap-2">
        {sorted.map((m, i) => {
          const c = METAL[m.place];
          return (
            <span
              key={`${m.year}-${m.place}-${i}`}
              title={`${m.year} · ${c.label}${m.note ? ` · ${m.note}` : ''}`}
              className="inline-flex items-center gap-2 rounded-full border pl-1.5 pr-3.5 py-1.5 font-tight shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              style={{
                background: c.chipBg,
                borderColor: c.chipBorder,
              }}
            >
              <MedalDisc place={m.place} />
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-[13.5px] font-bold tabular leading-none tracking-[-0.01em]" style={{ color: c.ink }}>
                  {m.year}
                </span>
                {showPlace && (
                  <span
                    className="text-[11px] font-bold leading-none"
                    style={{ color: c.accent }}
                  >
                    {c.ordinal}
                  </span>
                )}
                {m.note && (
                  <span
                    className="text-[11px] font-semibold leading-none"
                    style={{ color: c.accent }}
                  >
                    {m.note}
                  </span>
                )}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
