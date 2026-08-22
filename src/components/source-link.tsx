// Small outbound link to a league's own results site — the source of truth when
// our scrape lags live scores (Hunter, 2026-08-20; generalized from
// wfdf-source-link 2026-08-22 when USAU adopted the same treatment).
//
// Deliberately quiet: an accent-colored text link beside the event title, NOT a
// filled pill on its own row. Renders nothing without a URL.
// Server Component: just an <a> + inline SVG.

export function SourceLink({
  href,
  label = 'View source',
  ariaLabel,
}: {
  href: string | null;
  label?: string;
  /** Overrides the accessible name when the visible label is terse
   *  ("USAU site" → "View 2026 Elite Select Challenge on USA Ultimate"). */
  ariaLabel?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 text-[12px] font-semibold font-tight text-accent no-underline hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
    >
      {label}
      <svg
        width="11"
        height="11"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3.5 8.5L8.5 3.5M4.5 3.5h4v4" />
      </svg>
    </a>
  );
}
