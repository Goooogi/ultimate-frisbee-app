// "Every league, one place." strip — replaces the old vertical LeaguesPanel
// bento tile. Per Home v2 design spec:
//   Desktop (LeaguesStripA): one horizontal white card — left block is the
//     italic "Every league, one place." headline with a hairline right
//     divider, then a flexible row of league tiles.
//   Mobile (LeaguesVerticalV2): a vertical list, one row per league, under a
//     MobileSectionHead "Every league" title.
// Same component renders both — desktop/mobile layouts are swapped with
// responsive classes so there's one source of truth for the league data.
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
  {
    id: 'wfdf',
    label: 'WFDF Worlds',
    abbr: 'WFDF',
    subtitle: 'World Flying Disc Federation',
    // Event-based league — lands on the Worlds event browser, not /scores.
    href: '/wfdf/events',
    img: '/WFDF_Logo.webp',
  },
  {
    id: 'euf',
    label: 'EUCS',
    abbr: 'EUF',
    subtitle: 'European Ultimate Club Season',
    // Event-based like WFDF — lands on the event browser, not /scores.
    href: '/euf/events',
    img: '/EUF_Logo.webp',
  },
];

export function LeaguesStrip() {
  return (
    <>
      {/* ── Desktop: LeaguesStripA — headline stacked ABOVE one row of tiles ──
          The headline used to sit inline to the left behind a hairline divider.
          That left ~1150px for the tiles, but six of them need ~1350px, so the
          sixth (EUF) wrapped onto a second line and the row looked broken.
          Stacking the headline gives the tiles the card's full width, and the
          6-col grid makes every tile share it equally instead of each sizing to
          its own text — so they stay on one row at every desktop width. */}
      <div className="hidden lg:block bg-surface rounded-card-lg shadow-soft px-7 py-[22px]">
        <h2 className="font-display italic font-bold text-[22px] leading-none tracking-[-0.02em] text-ink m-0 pb-4 mb-4 border-b border-hairline">
          Every league, one place.
        </h2>
        <div className="grid grid-cols-6 gap-2.5">
          {LEAGUE_ROWS.map((row) => (
            <LeagueTile key={row.id} row={row} />
          ))}
        </div>
      </div>

      {/* ── Mobile: LeaguesVerticalV2 — vertical list ── */}
      <div className="lg:hidden bg-surface rounded-card-lg shadow-card p-2">
        {LEAGUE_ROWS.map((row, index) => {
          const isLast = index === LEAGUE_ROWS.length - 1;
          return (
            <LeagueRowMobile key={row.id} row={row} isLast={isLast} />
          );
        })}
      </div>
    </>
  );
}

// ─── Desktop tile ──────────────────────────────────────────────────────────

function LeagueTile({ row }: { row: LeagueRow }) {
  const inner = (
    <>
      {/* Nudged down so the mark optically centres on the abbr line rather than
          sitting flush with the tile's top padding. */}
      <span className="mt-0.5 flex-shrink-0">
        <LeagueMark abbr={row.abbr} img={row.img} disabled={!row.href} />
      </span>
      <div className="min-w-0">
        <div className={['text-[14px] font-bold font-tight leading-tight', row.href ? 'text-ink' : 'text-faint'].join(' ')}>
          {row.abbr}
        </div>
        {/* Full league name, NOT truncated — clipping "World Flying Disc
            Federation" to "World Flying D…" makes the tile unreadable. In the
            6-col grid a tile is ~190-250px, which is narrower than the longest
            name, so the name WRAPS to a second line instead. The tile is
            items-start + fixed min-height so a one-line and a two-line tile
            still line up. */}
        {row.subtitle && (
          <div className="text-[11px] text-muted font-tight leading-tight mt-0.5">{row.subtitle}</div>
        )}
      </div>
      {!row.href && <SoonBadge />}
    </>
  );

  const className = [
    // No min-width: the grid sets the track width, and a min-w here would
    // overflow the row at narrower desktop sizes. items-start + min-h keeps
    // one-line and two-line tiles aligned.
    'flex items-start gap-3 min-h-[62px] px-3.5 py-3 rounded-card-sm text-ink',
    // White fill (bg-surface = #FFF in light, theme-aware in broadcast) with a
    // subtle grey hairline border at rest — calmer than the orange outline it
    // replaced. Orange is reserved for the hover cue below, so the resting
    // state stays quiet and the accent still signals interactivity.
    'bg-surface border border-border',
    'transition-colors duration-150',
  ].join(' ');

  if (!row.href) {
    return (
      <span aria-label={`${row.label} — coming soon`} className={`${className} cursor-not-allowed select-none`}>
        {inner}
      </span>
    );
  }

  return (
    <Link
      href={row.href}
      className={`${className} hover:border-accent hover:bg-accent/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent`}
    >
      {inner}
    </Link>
  );
}

// ─── Mobile row ────────────────────────────────────────────────────────────

function LeagueRowMobile({ row, isLast }: { row: LeagueRow; isLast: boolean }) {
  const inner = (
    <>
      <LeagueMark abbr={row.abbr} img={row.img} disabled={!row.href} size={40} />
      <div className="flex-1 min-w-0">
        <div className={['text-[15px] font-bold font-tight leading-tight truncate', row.href ? 'text-ink' : 'text-faint'].join(' ')}>
          {row.label}
        </div>
        {row.subtitle && (
          <div className="text-[11.5px] text-muted font-tight leading-tight mt-0.5">{row.subtitle}</div>
        )}
      </div>
      {row.href ? <ChevronRight /> : <SoonBadge />}
    </>
  );

  const className = [
    'flex items-center gap-3.5 px-3 py-[13px] min-h-[56px]',
    !isLast ? 'border-b border-hairline' : '',
  ].join(' ');

  if (!row.href) {
    return (
      <div aria-label={`${row.label} — coming soon`} className={`${className} cursor-not-allowed select-none`}>
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={row.href}
      className={`${className} text-ink no-underline hover:bg-surface-hi transition-colors duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent`}
    >
      {inner}
    </Link>
  );
}

// ─── League mark ─────────────────────────────────────────────────────────────
// A compact rounded-square badge showing the league abbreviation or logo.
// Uses CSS-var tokens so it adapts to both field and broadcast themes.

function LeagueMark({
  abbr,
  img,
  disabled = false,
  size = 38,
}: {
  abbr: string;
  img?: string;
  disabled?: boolean;
  size?: number;
}) {
  const style = { width: size, height: size };
  // Real logo: white tile so the mark reads on both field + broadcast themes
  // (same treatment as TeamLogo). object-contain keeps the logo's aspect ratio.
  // Inset hairline comes from the shadow (inset ring), not a visible border —
  // per the v2 rule that card-exterior borders are replaced by elevation.
  if (img) {
    return (
      <span
        aria-hidden="true"
        style={style}
        className="inline-flex items-center justify-center rounded-[10px] flex-shrink-0 overflow-hidden bg-white shadow-[inset_0_0_0_1px_rgba(14,14,12,0.06)]"
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
      style={style}
      className={[
        'inline-flex items-center justify-center rounded-[10px] flex-shrink-0',
        'text-[10px] font-bold tracking-[0.08em] font-tight',
        disabled ? 'bg-[rgb(var(--ink)/0.04)] text-faint' : 'bg-[rgb(var(--ink)/0.08)] text-ink',
      ].join(' ')}
    >
      {abbr}
    </span>
  );
}

function SoonBadge() {
  return (
    <span className="flex-shrink-0 inline-flex items-center px-2.5 py-[3px] rounded-full text-[9px] font-bold tracking-[0.12em] uppercase text-faint bg-[rgb(var(--ink)/0.05)]">
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
      className="text-faint flex-shrink-0 group-hover:text-accent transition-colors duration-150"
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
