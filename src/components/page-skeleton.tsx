// Route-level loading skeleton, shared by every segment's loading.tsx.
//
// Why this exists: with no loading.tsx a Next App Router navigation blocks on
// the server render before swapping the route, so the browser sits on the OLD
// page with zero feedback — the click reads as dead. A loading.tsx wraps the
// segment in a Suspense boundary, so the URL and this skeleton commit
// immediately and the click always feels acknowledged.
//
// Deliberately NOT wrapped in PageShell: PageShell is a client component that
// pulls in AppRail + the whole nav tree, and rendering a second copy under a
// pending boundary makes the chrome flicker on every navigation. The real
// PageShell chrome stays mounted from the previous route; this fills only the
// content column, matching PageShell's own padding/width so the swap lands
// without a layout jump.

/** One shimmering block. `className` carries the size. */
function Bar({ className }: { className: string }) {
  return <div className={`rounded-card-sm bg-ink/[0.06] animate-pulse ${className}`} />;
}

interface PageSkeletonProps {
  /** Match the real page's `wide` PageShell prop so the column width agrees. */
  wide?: boolean;
  /** Number of placeholder rows under the header. */
  rows?: number;
  /** Render the 4-up stat grid that profile pages lead with. */
  stats?: boolean;
}

export function PageSkeleton({ wide, rows = 6, stats = false }: PageSkeletonProps) {
  return (
    <div
      className={[
        'px-5 pt-4 pb-12 lg:pt-8 lg:pb-14 lg:mx-auto',
        wide ? 'lg:px-10 xl:px-8 lg:max-w-[1320px]' : 'lg:px-14 lg:max-w-[1080px]',
      ].join(' ')}
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>

      {/* Header — eyebrow, title, subtitle, mirroring PageHeader's rhythm. */}
      <div className="mb-5 lg:mb-7" aria-hidden="true">
        <Bar className="h-[10px] w-24 mb-3" />
        <Bar className="h-[36px] lg:h-[56px] w-[min(100%,420px)]" />
        <Bar className="h-[13px] lg:h-[15px] w-56 mt-3" />
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-6" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-card bg-surface shadow-card p-3">
              <Bar className="h-[9px] w-10 mb-2" />
              <Bar className="h-[20px] w-12" />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <Bar key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}
