// Leagues panel — replaces the Playbook + Fantasy tile stack on the home bento.
// Shows a vertical list of the four active leagues (UFA, USAU, WUL, PUL), all
// real links. (The row model still supports href:null "coming soon" rows for
// future leagues, but none are listed today.)
// Server component — no interactivity needed.

import Link from 'next/link';

interface LeagueRow {
  id: string;
  label: string;
  abbr: string;
  subtitle?: string;
  href: string | null; // null = coming soon / disabled
  /** Logo image in /public. When set, shown instead of the abbr monogram. */
  img?: string;
}

// UFA and USAU use ?league=ufa / ?league=usau query params.
// buildLeagueQs omits the param when it matches the default (ufa), so we
// set it explicitly to keep links predictable.
const LEAGUE_ROWS: LeagueRow[] = [
  {
    id: 'ufa',
    label: 'UFA',
    abbr: 'UFA',
    subtitle: 'Ultimate Frisbee Association',
    href: '/scores?league=ufa',
    img: '/UFA-red.png',
  },
  {
    id: 'usau',
    label: 'USAU',
    abbr: 'USA',
    subtitle: 'USA Ultimate',
    href: '/scores?league=usau',
    img: '/USAU-logo.png',
  },
  {
    id: 'wul',
    label: 'WUL',
    abbr: 'WUL',
    subtitle: 'Western Ultimate League',
    href: '/scores?league=wul',
    img: '/WUL-logo.jpeg',
  },
  {
    id: 'pul',
    label: 'PUL',
    abbr: 'PUL',
    subtitle: 'Premier Ultimate League',
    href: '/scores?league=pul',
    img: '/PUL.webp',
  },
];

export function LeaguesPanel() {
  return (
    <div
      className={[
        'flex flex-col bg-surface border border-border overflow-hidden',
        // Match the tile rounding + height behaviour of the stack it replaces.
        // The tile stack had no explicit height — both tiles were 1fr in a
        // grid-rows-[1fr_1fr]. Here we just let the panel fill its grid cell.
        'h-full',
      ].join(' ')}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-hairline flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          Leagues
        </span>
      </div>

      {/* League rows — flex-1 per li so the 4 rows fill the panel height evenly */}
      <ul className="flex flex-col flex-1" role="list">
        {LEAGUE_ROWS.map((row, index) => {
          const isLast = index === LEAGUE_ROWS.length - 1;

          if (!row.href) {
            // Disabled / coming soon
            return (
              <li
                key={row.id}
                aria-label={`${row.label} — coming soon`}
                className={[
                  'flex flex-1 items-center gap-4 px-5',
                  'min-h-[56px] lg:min-h-[0px] max-h-[96px] py-3',
                  'cursor-not-allowed select-none',
                  !isLast ? 'border-b border-hairline' : '',
                ].join(' ')}
              >
                <LeagueMark abbr={row.abbr} img={row.img} disabled />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-faint font-tight leading-tight truncate">
                    {row.label}
                  </span>
                  {row.subtitle && (
                    <span className="block text-[11px] text-faint font-tight truncate mt-0.5">
                      {row.subtitle}
                    </span>
                  )}
                </span>
                <SoonBadge />
              </li>
            );
          }

          // Real / navigable
          return (
            <li
              key={row.id}
              className={['flex flex-1', !isLast ? 'border-b border-hairline' : ''].join(' ')}
            >
              <Link
                href={row.href}
                className={[
                  'flex flex-1 items-center gap-4 px-5',
                  'min-h-[56px] lg:min-h-[0px] max-h-[96px] py-3 w-full',
                  'text-ink hover:bg-surface-hi',
                  'transition-colors duration-150 no-underline',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                  'group',
                ].join(' ')}
              >
                <LeagueMark abbr={row.abbr} img={row.img} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-ink font-tight leading-tight truncate">
                    {row.label}
                  </span>
                  {row.subtitle && (
                    <span className="block text-[12px] text-muted font-tight truncate mt-0.5">
                      {row.subtitle}
                    </span>
                  )}
                </span>
                <ChevronRight />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── League mark ─────────────────────────────────────────────────────────────
// A compact rounded-square badge showing the league abbreviation.
// Uses CSS-var tokens so it adapts to both field and broadcast themes.

function LeagueMark({
  abbr,
  img,
  disabled = false,
}: {
  abbr: string;
  img?: string;
  disabled?: boolean;
}) {
  // Real logo: white tile so the mark reads on both field + broadcast themes
  // (same treatment as TeamLogo). object-contain keeps the logo's aspect ratio.
  if (img) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-11 h-11 lg:w-12 lg:h-12 rounded-lg flex-shrink-0 overflow-hidden bg-white border border-[rgb(var(--ink)/0.10)] shadow-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" className="w-full h-full object-contain p-1" />
      </span>
    );
  }
  // Fallback: abbreviation monogram (WUL / PUL / INTL / Worlds).
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-flex items-center justify-center',
        'w-11 h-11 lg:w-12 lg:h-12 rounded-lg flex-shrink-0',
        'text-[10px] font-bold tracking-[0.08em] font-tight',
        disabled
          ? 'bg-[rgb(var(--ink)/0.04)] border border-[rgb(var(--ink)/0.08)] text-faint'
          : 'bg-[rgb(var(--ink)/0.08)] border border-[rgb(var(--ink)/0.12)] text-ink shadow-sm',
      ].join(' ')}
    >
      {abbr}
    </span>
  );
}

function SoonBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold tracking-[0.12em] uppercase text-faint bg-[rgb(var(--ink)/0.05)] border border-[rgb(var(--ink)/0.08)]">
      SOON
    </span>
  );
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="text-faint flex-shrink-0 group-hover:text-[rgb(var(--accent))] transition-colors duration-150"
    >
      <path
        d="M3.5 2L6.5 5L3.5 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
