# The Layout — v2 "Editorial Calm" Style Guide

Source of truth for the full-app restyle (from the Claude Design project, `Home v2.html`).
The palette is unchanged — this redesign changes the **shape language**: separation by
elevation and whitespace instead of hairline borders; rounded floating cards; pill
controls; italic condensed display headings.

**Non-negotiables**

- The top nav (`AppRail`) and mobile bottom nav (`MobileBottomNav`) are **out of scope — do not restyle or restructure them.**
- Keep every page's existing sections, data, and information architecture. Restyle only.
- Both themes must work. Use the semantic tokens (`bg-bg`, `bg-surface`, `text-ink`,
  `text-muted`, `text-faint`, `bg-accent`, …) — never hardcode cream/black except on
  always-dark surfaces (hero slides, ink footer card).
- Mobile-first. Verify at 390px and desktop.

## Elevation & cards (the core change)

| Use | Classes |
|---|---|
| Standard card | `bg-surface rounded-card shadow-card` (18px radius) |
| Large section card | `bg-surface rounded-card-lg shadow-card` (24px) |
| Hero / footer block | `rounded-card-xl shadow-hero` (32px) |
| Quiet strip (e.g. leagues strip) | `bg-surface rounded-card-lg shadow-soft` |
| Elevated float (mobile hero) | `shadow-lift` |

- **Remove `border border-border` from card exteriors.** Cards float on shadow only.
  (The shadow vars already include a faint ring in the dark theme — never add your own.)
- Hairlines survive ONLY as row separators *inside* cards: `border-t border-hairline`
  on rows 2+ (or `divide-y divide-hairline`), used sparingly.
- Tonal page sections may use `bg-bg-warm` instead of a card.
- Inset chips/rows inside a white card use `bg-bg` (the cream shows through).

## Shape

- Every button, badge, tab, filter: `rounded-full` (pill). No square buttons.
- Primary button: `bg-accent text-accent-ink rounded-full px-5 py-3 text-[13px] font-bold inline-flex items-center gap-2`.
- Secondary button (light surface): transparent bg + `border-[1.5px] border-ink/15 text-ink`, same pill metrics.
- Secondary on dark surface: `bg-white/10 border border-white/25 text-white`.
- Badge/pill: uppercase `text-[10.5px] font-bold tracking-[0.12em] px-2.5 py-[5px] rounded-full`.
  Tones: neutral `bg-ink/5 text-ink/80` · accent `bg-accent/10 text-accent` · live/solid `bg-accent text-accent-ink`.
- Avatar/logo chips: circular (`rounded-full`), logos sit on a white disc (`bg-white`, logo at ~72% of chip size, `object-contain`).

## Typography

- Display headings: `font-display italic font-bold` with `tracking-[-0.02em]` and tight
  leading (`leading-[0.95]`). Section titles: ~34px desktop (`text-[34px]`), 26px mobile.
- Eyebrow above a section title: `text-[10.5px] font-bold uppercase tracking-[0.18em]`,
  `text-accent` (or `text-muted` when quiet), with `mb-2`.
- Section header row: eyebrow+title left, action link right (`text-[11px] font-bold
  uppercase tracking-[0.12em] text-muted inline-flex items-center gap-1.5` + small arrow →),
  bottom-aligned (`flex items-end justify-between mb-4/5`).
- Small data (records, scores meta, timestamps): `font-mono`-ish → keep the app's
  `tabular` class + `text-[10px]–[13px]`; meta label = 10px uppercase `text-faint`
  `tracking-[0.1em]`, value = 14px `font-semibold text-ink` below it.
- Big scores/rank numbers may use `font-display italic font-bold tabular`.

## Hero carousel (home)

- Container: `rounded-card-xl overflow-hidden shadow-hero` — full-bleed slides, no inner padding at container level.
- Game slides: always-dark base `#0E1622`, white text, two team-color radial glows
  (one per side, `radial-gradient(circle …, {teamTint}88, transparent 62%)`), subtle field-lines SVG.
- Tournament slides: solid league-color bg (USAU `#173A7A`, WFDF `#0A5486`-family) with a
  white radial glow top-right, league logo in a translucent ring circle on the right.
- Dots bottom-left: active = white 26×9px pill, inactive = 9px white/40 circle, animated width.
- Arrows: 42px circle, `bg-white/[0.14] border border-white/[0.28] backdrop-blur`, white chevron.
- Team block on game slide: circular white logo disc, uppercase abbr 12px/70% white,
  team name in `font-display italic font-bold` ~50px desktop / 21px mobile, record in mono.

## Footer (`SiteFooter`)

Dark ink card floating inside the page: `bg-ink text-bg rounded-card-xl` with wordmark,
tagline "Every league, one place.", nav links, © line — inside page padding, not full-bleed.

## Do NOT

- No emoji icons — inline SVG only (16/22px, 1.6px stroke).
- No layout-shifting hover (no scale) — use color/shadow transitions (`transition-shadow`, `hover:shadow-lift`).
- No `border-border` boxes around cards; no square corners on new surfaces.
- Don't break `prefers-reduced-motion` handling where it exists (carousel, dropdowns).
- Interactive cards need `cursor-pointer` + visible hover (shadow or bg tint) + focus-visible ring.
