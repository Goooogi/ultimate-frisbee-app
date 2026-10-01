'use client';

// Admin Trading flags list — suspicious UTCG trading pairs. The window
// selector (7/30/90 days) re-fetches server-side via router.replace + the
// ?days= param (App Router re-runs the page's RPC call server-side, same
// round-trip cost as any other admin filter param). Mirrors the
// AdminRolesList / AdminFeedbackList card + pill conventions.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import type { FlagReason, FlaggedPair } from '@/lib/admin/utcg-flags';

const WINDOWS = [7, 30, 90] as const;

const REASON_LABEL: Record<FlagReason, string> = {
  coins: 'Coins',
  cards: 'Cards',
  price: 'Price',
  new: 'New accounts',
};

const REASON_STYLE: Record<FlagReason, string> = {
  coins: 'bg-accent/10 text-accent',
  cards: 'bg-accent/10 text-accent',
  price: 'bg-live/10 text-live',
  new: 'bg-ink/5 text-muted',
};

export function AdminUtcgFlagsList({ pairs, days }: { pairs: FlaggedPair[]; days: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setDays(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('days', String(next));
    startTransition(() => {
      router.replace(`${pathname}?${params}`, { scroll: false });
    });
  }

  return (
    <section aria-label="Suspicious trading pairs" className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Time window">
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setDays(w)}
            aria-pressed={w === days}
            className={[
              'px-3 py-1.5 rounded-full text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight',
              'transition-colors duration-150 min-h-[36px] cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              w === days ? 'bg-ink text-bg' : 'bg-ink/5 text-muted hover:text-ink',
            ].join(' ')}
          >
            {w}d
          </button>
        ))}
      </div>

      <div className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {pairs.length === 0 ? (
          <p className="text-[13px] text-muted font-tight py-8 text-center">
            No flagged pairs in the last {days} days.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pairs.map((p) => (
              <PairRow key={`${p.userA.id}:${p.userB.id}`} pair={p} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PairRow({ pair }: { pair: FlaggedPair }) {
  return (
    <li className="rounded-card bg-surface shadow-card px-4 py-3 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {pair.reasons.map((r) => (
          <span
            key={r}
            className={`text-[9px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded-full ${REASON_STYLE[r]}`}
          >
            {REASON_LABEL[r]}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-faint font-tight tabular">
          last transfer {relativeTime(pair.lastTransferAt)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UserCell label="User A" user={pair.userA} />
        <UserCell label="User B" user={pair.userB} />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] font-tight">
        <Stat label="Coins moved" value={pair.coinsMoved.toLocaleString()} />
        <Stat label="Card value moved" value={pair.cardValueMoved.toLocaleString()} />
        <Stat label="Transfers" value={String(pair.transfers)} />
        <Stat
          label="Max price ratio"
          value={pair.maxPriceRatio !== null ? `${pair.maxPriceRatio.toFixed(1)}× ref` : '—'}
        />
      </div>
    </li>
  );
}

function UserCell({ label, user }: { label: string; user: FlaggedPair['userA'] }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-0.5">{label}</p>
      <p className="text-[13px] text-ink font-tight truncate">{user.email}</p>
      <p className="text-[11px] text-muted font-tight">created {accountAge(user.createdAt)} ago</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-muted">
      {label} <span className="text-ink tabular">{value}</span>
    </span>
  );
}

function accountAge(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
  if (days < 1) return 'today';
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
