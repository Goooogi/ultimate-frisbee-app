// BudgetsPanel — auction budgets: every team's remaining/spent/open slots
// (via auctionTeamState) plus their roster so far. Ported from mobile
// BudgetsPanel.tsx by intent.

import { auctionTeamState, type Draft, type DraftPick } from '@/lib/fantasy/draft-room';

interface TeamInfo {
  id: string;
  teamName: string;
}

export function BudgetsPanel({
  draft,
  picks,
  teamById,
}: {
  draft: Draft;
  picks: DraftPick[];
  teamById: Map<string, TeamInfo>;
}) {
  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
      <ul aria-label="Team budgets">
        {draft.draftOrder.map((teamId, idx) => {
          const state = auctionTeamState(draft, picks, teamId);
          const roster = picks.filter((p) => p.teamId === teamId).sort((a, b) => a.overall - b.overall);
          return (
            <li
              key={teamId}
              className={['px-4 py-3.5', idx > 0 ? 'border-t border-hairline' : ''].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-tight text-[14px] font-bold text-ink truncate min-w-0 flex-1">
                  {teamById.get(teamId)?.teamName ?? 'Team'}
                </span>
                <span className="font-tight text-[14px] font-bold text-accent tabular flex-shrink-0">
                  ${state.remaining}
                </span>
              </div>
              <div className="font-tight text-[11.5px] text-muted mt-0.5">
                Spent ${state.spent} &middot; {state.openSlots} open &middot; max bid ${state.maxBid}
              </div>
              {roster.length > 0 && (
                <div className="font-tight text-[11.5px] text-faint mt-1.5 leading-[1.4]">
                  {roster.map((p) => `${p.playerName}${p.price != null ? ` ($${p.price})` : ''}`).join(' · ')}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
