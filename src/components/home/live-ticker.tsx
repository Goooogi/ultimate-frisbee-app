// Dark slim marquee strip across the top of the home page.
// Each item summarizes one live or upcoming game; the LIVE token leads.

import type { UfaGame } from '@/lib/ufa/types';
import { teamMeta } from '@/lib/ufa/teams';
import { gameUiState, formatStartCompact } from '@/lib/ufa/format';

interface LiveTickerProps {
  games: UfaGame[];
}

export function LiveTicker({ games }: LiveTickerProps) {
  const liveCount = games.filter((g) => gameUiState(g).isLive).length;
  const items = buildTickerItems(games);

  return (
    <div className="bg-[#0A0A09] text-[#F4F2EB] py-2 px-5 lg:px-12 flex items-center gap-8 overflow-hidden whitespace-nowrap font-mono text-[11px] tracking-[0.06em] border-b border-[#1B1B18]">
      <span className="inline-flex items-center gap-2 flex-shrink-0">
        <span className="w-[7px] h-[7px] rounded-full bg-[#FF3D00] shadow-[0_0_0_3px_rgba(255,61,0,0.2)]" />
        <span className="text-[#FF3D00] font-bold">
          {liveCount > 0 ? `LIVE · ${liveCount}` : 'TODAY'}
        </span>
      </span>
      <div className="flex items-center gap-8 overflow-hidden">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-2.5 whitespace-nowrap flex-shrink-0">
            <span className="opacity-30">•</span>
            <span className="text-[#F4F2EB] font-medium">{it}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function buildTickerItems(games: UfaGame[]): string[] {
  if (games.length === 0) {
    return ['No games scheduled today', 'Check back during UFA season (April–August)'];
  }
  return games.slice(0, 8).map((g) => {
    const away = teamMeta(g.awayTeamID);
    const home = teamMeta(g.homeTeamID);
    const state = gameUiState(g);
    if (state.isLive) {
      return `${away.abbr} ${g.awayScore} · ${home.abbr} ${g.homeScore} · LIVE`;
    }
    if (state.isFinal) {
      return `${away.abbr} ${g.awayScore} · ${home.abbr} ${g.homeScore} · FINAL`;
    }
    return `${away.abbr} @ ${home.abbr} · ${formatStartCompact(g)}`;
  });
}
