'use client';

// SectionNav — the app's "second nav": page/section-specific tabs, Strava-style.
//
// A horizontal row of underline text tabs — bold ink for the active tab with a
// short accent underline beneath just its label; muted for the rest; a hairline
// runs across the row's bottom edge. This is the WEB port of the mobile app's
// TopSubTabs (altiusapps/mobileapp-thelayout · src/components/nav/TopSubTabs.tsx),
// so the two platforms share one second-nav language.
//
// Two data modes:
//   • route mode  — pass `tabs` of {label, href, active, soon}. Rendered as
//     <Link>s. This is what the shells feed it (via useSectionTabs) for the
//     league / Fantasy / WFDF section switchers.
//   • state mode  — pass `tabs` of {label, id} + `activeId` + `onChange`.
//     Rendered as <button>s. This is what an in-page tabbed sub-app (e.g. UTCG)
//     uses instead of routing. (Wired in a later phase.)
//
// Placement (rendered by the shell, under the AppRail, above the page title):
// tabs are CENTERED on every breakpoint (per Hunter). On desktop this is the
// only page-switcher (no bottom bar there); on mobile it complements the static
// bottom bar. Degrades to a left-scroll row if labels ever overflow.

import Link from 'next/link';

// ─── Route mode ──────────────────────────────────────────────────────────────

export interface SectionRouteTab {
  label: string;
  href: string;
  active: boolean;
  /** Rendered faint + non-interactive ("coming soon"). */
  soon?: boolean;
}

// ─── State mode ──────────────────────────────────────────────────────────────

export interface SectionStateTab {
  id: string;
  label: string;
  soon?: boolean;
}

type Props =
  | {
      mode?: 'route';
      tabs: SectionRouteTab[];
      ariaLabel: string;
      /** Extra classes on the outer wrapper (e.g. breakpoint gating). */
      className?: string;
    }
  | {
      mode: 'state';
      tabs: SectionStateTab[];
      activeId: string;
      onChange: (id: string) => void;
      ariaLabel: string;
      className?: string;
    };

// Shared tab label styling — matches the mobile app's TopSubTabs (13px bold,
// muted → ink on active, a 2px accent underline segment under the active label).
const TAB_BASE =
  'relative inline-flex flex-col items-center shrink-0 px-3 pt-2.5 font-tight text-[13px] font-bold tracking-[0.02em] whitespace-nowrap no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

function Underline({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'mt-2.5 h-[2px] w-full rounded-full',
        active ? 'bg-accent' : 'bg-transparent',
      ].join(' ')}
    />
  );
}

export function SectionNav(props: Props) {
  const { ariaLabel, className } = props;

  return (
    <nav
      aria-label={ariaLabel}
      className={[
        'border-b border-hairline bg-bg',
        // Horizontal scroll on narrow screens instead of wrapping/clipping.
        'overflow-x-auto no-scrollbar',
        className ?? '',
      ].join(' ')}
    >
      {/* Tabs CENTERED on every breakpoint (Hunter's "they should be centered").
          `justify-center` still degrades to left-scroll if the labels ever
          overflow a narrow viewport (they don't at today's 4-tab label sets).
          A max-width column on desktop keeps the centered group within the same
          reading width the rail + content use. */}
      <div className="flex items-stretch justify-center px-4 mx-auto lg:max-w-[1080px]">
        {props.mode === 'state'
          ? props.tabs.map((t) => {
              const active = t.id === props.activeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={t.soon}
                  onClick={() => !t.soon && props.onChange(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    TAB_BASE,
                    t.soon
                      ? 'opacity-40 cursor-not-allowed'
                      : active
                        ? 'text-ink cursor-pointer'
                        : 'text-muted hover:text-ink cursor-pointer',
                  ].join(' ')}
                >
                  {t.label}
                  <Underline active={active} />
                </button>
              );
            })
          : props.tabs.map((t) => {
              if (t.soon) {
                return (
                  <span
                    key={t.label}
                    aria-disabled="true"
                    className={[TAB_BASE, 'text-muted opacity-40 cursor-not-allowed select-none'].join(' ')}
                  >
                    {t.label}
                    <Underline active={false} />
                  </span>
                );
              }
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={t.active ? 'page' : undefined}
                  className={[
                    TAB_BASE,
                    t.active ? 'text-ink' : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {t.label}
                  <Underline active={t.active} />
                </Link>
              );
            })}
      </div>
    </nav>
  );
}
