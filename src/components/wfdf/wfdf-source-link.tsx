// Small outbound link to WFDF's own results site — the source of truth when
// our scrape lags live scores (Hunter, 2026-08-20). Renders nothing without a
// URL (legacy events have no per-game pages; synthetic team ids get none).
// Server Component: just an <a> + inline SVG.

export function WfdfSourceLink({
  href,
  label = 'View on WFDF',
}: {
  href: string | null;
  label?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
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
