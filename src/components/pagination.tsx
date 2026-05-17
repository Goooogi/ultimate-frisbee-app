'use client';

// Page navigation: prev / page indicator / next.
// Bound to ?page= URL param.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
}

export function Pagination({ page, total, limit }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  function goTo(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p === 1) {
      params.delete('page');
    } else {
      params.set('page', String(p));
    }
    router.push(`${pathname}?${params}`);
  }

  const btnBase = [
    'inline-flex items-center justify-center',
    'px-3 py-[6px] rounded-full',
    'text-[11px] font-bold tracking-[0.12em] uppercase font-tight',
    'border transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  ].join(' ');

  const activeBtn = 'bg-surface border-border text-ink hover:border-ink cursor-pointer';
  const disabledBtn = 'bg-transparent border-hairline text-faint cursor-not-allowed';

  return (
    <div className="flex items-center justify-between mt-6">
      <span className="text-[11px] text-muted font-tight">
        Showing {start}–{end} of {total}
      </span>

      <div className="flex items-center gap-2">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={`${btnBase} ${page <= 1 ? disabledBtn : activeBtn}`}
        >
          <svg className="w-3 h-3 mr-1" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M7.5 3L4.5 6L7.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Prev
        </button>

        <span className="text-[11px] font-bold text-muted font-tight px-1 tabular">
          {page} / {totalPages}
        </span>

        <button
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className={`${btnBase} ${page >= totalPages ? disabledBtn : activeBtn}`}
        >
          Next
          <svg className="w-3 h-3 ml-1" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
