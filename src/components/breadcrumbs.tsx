// Back-arrow "breadcrumb" — a single chevron + the parent page's label.
//
// Detail pages still pass an ordered crumb array (shallowest → deepest)
// for forward compatibility; we use the second-to-last entry as the
// parent. The current page (last entry) isn't rendered — the page's
// own <h1> already says where you are.
//
// Stays a Server Component: just a <Link> + an inline SVG.

import Link from 'next/link';

export interface Crumb {
  /** The text shown for this crumb. */
  label: string;
  /** Destination. Required for any crumb we'd actually render (i.e.
   *  every non-current crumb). */
  href?: string;
}

interface Props {
  /** Ordered list of crumbs, shallowest → deepest. The last entry is the
   *  current page and is dropped; the second-to-last becomes the back
   *  target. If fewer than 2 entries are passed, nothing renders. */
  crumbs: Crumb[];
}

export function Breadcrumbs({ crumbs }: Props) {
  if (crumbs.length < 2) return null;
  const parent = crumbs[crumbs.length - 2];
  if (!parent.href) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 lg:mb-5">
      <Link
        href={parent.href}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold font-tight text-muted hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
      >
        <BackArrow />
        <span className="truncate max-w-[200px] md:max-w-none" title={parent.label}>
          {parent.label}
        </span>
      </Link>
    </nav>
  );
}

function BackArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 2L4 7l5 5" />
    </svg>
  );
}
