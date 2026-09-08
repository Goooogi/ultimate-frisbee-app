'use client';

// WaiversCard — LeagueView's compact waivers teaser (FAAB weekly leagues
// only, mounted next to TradesCard). Links to the Waivers tab; shows a
// pending-claim count badge when I have any.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWaiverClaims, type ContestView } from '@/lib/fantasy/leagues';

export function WaiversCard({ contest }: { contest: ContestView }) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getWaiverClaims(contest.id)
      .then((claims) => {
        if (cancelled) return;
        setPendingCount(claims.filter((c) => c.status === 'pending').length);
      })
      .catch(() => !cancelled && setPendingCount(0));
    return () => {
      cancelled = true;
    };
  }, [contest.id]);

  return (
    <section aria-labelledby="waivers-heading">
      <div className="flex items-center justify-between mb-4">
        <h2 id="waivers-heading" className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight">
          Waivers
        </h2>
      </div>
      <Link
        href={`/fantasy/l/${contest.id}/waivers`}
        className={[
          'flex items-center justify-between gap-4 px-5 py-4 bg-surface rounded-card-lg shadow-card',
          'no-underline hover:bg-surface-hi transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <span className="font-tight text-[14px] font-semibold text-ink">
          {pendingCount > 0 ? `${pendingCount} pending claim${pendingCount === 1 ? '' : 's'}` : 'View waivers'}
        </span>
        {pendingCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent text-accent-ink font-tight text-[11px] font-bold">
            {pendingCount}
          </span>
        )}
      </Link>
    </section>
  );
}

export default WaiversCard;
