'use client';

// Back-arrow "breadcrumb" — a single chevron + the parent page's label.
//
// Detail pages still pass an ordered crumb array (shallowest → deepest)
// for forward compatibility; we use the second-to-last entry as the
// parent. The current page (last entry) isn't rendered — the page's
// own <h1> already says where you are.
//
// Client component (was a Server Component) for SMART BACK: whenever there is
// real in-app history, the chevron calls router.back() so the previous entry —
// its ?div=/?tab= filters and scroll position — is restored instead of a fresh
// top-of-page default render. Matching only the came-from-parent case (the
// 2026-08-20 version) broke event → team → player: the profile's parent crumb
// is the players HUB the user never visited, so backing out of a player landed
// on /wfdf/players instead of the team (Hunter, 2026-08-21). The label stays
// the parent's name when that's where back leads, else an honest "Back"; with
// no in-app history (hard load) it's a plain link to the parent as before.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { previousUrl } from '@/lib/nav-history';

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
  const router = useRouter();
  const pathname = usePathname();
  if (crumbs.length < 2) return null;
  const parent = crumbs[crumbs.length - 2];
  const href = parent.href;
  if (!href) return null;

  const prevUrl = previousUrl(pathname);
  const cameFromParent = prevUrl != null && sameTarget(prevUrl, href);
  const label = prevUrl == null || cameFromParent ? parent.label : 'Back';

  return (
    <nav aria-label="Breadcrumb" className="mb-4 lg:mb-5">
      <Link
        href={href}
        onClick={(e) => {
          // Any in-app history → pop the real entry (filters + scroll come
          // back with it). Re-read at click time: the tracker may have caught
          // up since render.
          if (previousUrl(pathname) != null) {
            e.preventDefault();
            router.back();
          }
        }}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold font-tight text-muted hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
      >
        <BackArrow />
        <span className="truncate max-w-[200px] md:max-w-none" title={label}>
          {label}
        </span>
      </Link>
    </nav>
  );
}

/** Does `url` land on `href`: same path, and every param `href` sets carries
 *  the same value? (`/scores?league=usau` is not the sectionals list
 *  `/scores?league=usau&series=sectionals`, so its label mustn't claim to be.) */
function sameTarget(url: string, href: string): boolean {
  const [path, qs = ''] = url.split('?');
  const [hrefPath, hrefQs = ''] = href.split('?');
  if (path !== hrefPath) return false;
  const have = new URLSearchParams(qs);
  const want = new URLSearchParams(hrefQs);
  for (const [k, v] of want) if (have.get(k) !== v) return false;
  for (const k of ['series', 'div']) if (have.has(k) && !want.has(k)) return false;
  return true;
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
