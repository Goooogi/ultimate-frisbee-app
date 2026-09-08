'use client';

// TradesCard — LeagueView's compact trades teaser (private leagues only,
// mounted under Standings). Links to the Trades tab; shows an open-trade
// count badge (proposed + accepted) when there are any.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getTrades, type ContestView } from '@/lib/fantasy/leagues';

export function TradesCard({ contest }: { contest: ContestView }) {
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getTrades(contest.id)
      .then((trades) => {
        if (cancelled) return;
        setOpenCount(trades.filter((t) => t.status === 'proposed' || t.status === 'accepted').length);
      })
      .catch(() => !cancelled && setOpenCount(0));
    return () => {
      cancelled = true;
    };
  }, [contest.id]);

  return (
    <section aria-labelledby="trades-heading">
      <div className="flex items-center justify-between mb-4">
        <h2 id="trades-heading" className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight">
          Trades
        </h2>
      </div>
      <Link
        href={`/fantasy/l/${contest.id}/trades`}
        className={[
          'flex items-center justify-between gap-4 px-5 py-4 bg-surface rounded-card-lg shadow-card',
          'no-underline hover:bg-surface-hi transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <span className="font-tight text-[14px] font-semibold text-ink">
          {openCount > 0 ? `${openCount} open trade${openCount === 1 ? '' : 's'}` : 'Propose a trade'}
        </span>
        {openCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent text-accent-ink font-tight text-[11px] font-bold">
            {openCount}
          </span>
        )}
      </Link>
    </section>
  );
}

export default TradesCard;
