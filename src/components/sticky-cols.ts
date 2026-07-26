// Shared Tailwind class fragments for freezing a stat table's leading identity
// column(s) while the stat columns scroll horizontally on mobile — the web
// equivalent of the app's frozen-PLAYER-column PlayerStatsTable
// (altiusapps/mobileapp-thelayout · src/components/ufa/PlayerStatsTable.tsx).
//
// Usage on a `<table>` inside an `overflow-x-auto` container:
//   • Give the table row a `group` class so frozen cells can follow row hover.
//   • Header cells: apply STICKY_LEAD (col 0) and/or STICKY_NAME (col 1).
//   • Body cells: same, but with STICKY_LEAD_BODY / STICKY_NAME_BODY (lower
//     z-index than the header so a sticky header still wins the corner).
//   • The frozen cells carry the container's own bg (pass whichever of
//     STICKY_BG_SURFACE / STICKY_BG_BG matches the table's card background) so
//     scrolled cells don't bleed underneath.
//
// Two-frozen-column layout (rank/# + Name): the lead column is pinned to a fixed
// width (LEAD_W) so the name column's `left` offset (NAME_LEFT) is deterministic.
// One-frozen-column layout (Name only): use STICKY_NAME with `left-0` — pass the
// `nameOnly` variant.

/** Fixed width of the leading (#/rank) column so the name's left offset is exact. */
export const LEAD_W = 'w-[42px] min-w-[42px]';
/** Name column's left offset in a two-frozen-column layout (= LEAD_W). */
export const NAME_LEFT = 'left-[42px]';
/** Right-edge hairline marking the freeze boundary (put on the last frozen col). */
export const STICKY_EDGE = 'shadow-[1px_0_0_0_rgb(var(--hairline))]';

/** Background utilities — pick the one matching the table's card bg. */
export const STICKY_BG_SURFACE = 'bg-surface group-hover:bg-surface-hi';
export const STICKY_BG_BG = 'bg-bg group-hover:bg-surface';

/** Header-cell freezes (z-20 so a sticky thead corner sits above body cells). */
export const STICKY_LEAD_HEAD = `sticky left-0 z-20 ${LEAD_W}`;
export const STICKY_NAME_HEAD = `sticky ${NAME_LEFT} z-20 ${STICKY_EDGE}`;
/** Name-only header freeze (single frozen column pinned at the left edge). */
export const STICKY_NAMEONLY_HEAD = `sticky left-0 z-20 ${STICKY_EDGE}`;

/** Body-cell freezes (z-10). */
export const STICKY_LEAD_BODY = `sticky left-0 z-10 ${LEAD_W}`;
export const STICKY_NAME_BODY = `sticky ${NAME_LEFT} z-10 ${STICKY_EDGE}`;
export const STICKY_NAMEONLY_BODY = `sticky left-0 z-10 ${STICKY_EDGE}`;
