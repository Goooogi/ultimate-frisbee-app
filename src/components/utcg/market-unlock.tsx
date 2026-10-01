'use client';

// MarketUnlockChecklist — compact progress readout for the market/staked-PvP
// unlock gate (MARKET_UNLOCK: 7 account-age days, 10 finished games, 3
// distinct UTC play days). Shown wherever a locked user would otherwise hit
// the server's rejection cold: the PvP mode card, the Market tab banner, and
// ListCardModal. Three call sites — worth sharing rather than copy-pasted.

import type { MarketAccess } from '@/lib/utcg/server';
import { MARKET_UNLOCK } from '@/lib/utcg/packs';

export function MarketUnlockChecklist({ access }: { access: MarketAccess | null }) {
  if (!access) return null;
  const rows: { label: string; have: number; need: number }[] = [
    { label: 'Account age', have: access.accountAgeDays, need: MARKET_UNLOCK.days },
    { label: 'Games played', have: access.finishedGames, need: MARKET_UNLOCK.games },
    { label: 'Days played', have: access.playDays, need: MARKET_UNLOCK.playDays },
  ];
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => {
        const done = r.have >= r.need;
        return (
          <li key={r.label} className="flex items-center gap-2 text-[11px] font-tight">
            {done ? (
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="flex-shrink-0 text-accent">
                <path d="M2 5.2l2.2 2.2L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-faint flex-shrink-0" aria-hidden="true" />
            )}
            <span className={done ? 'text-muted' : 'text-faint'}>
              {r.label}: {Math.min(r.have, r.need)}/{r.need}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
