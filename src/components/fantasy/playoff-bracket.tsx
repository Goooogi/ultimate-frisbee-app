// PlayoffBracket — the league page's compact playoffs mini-section: semifinal
// / final / third-place matchups, seeds, points, winner bolded/accented.
// Server-friendly presentational component (no hooks). Web port of the
// mobile app's LeagueView.tsx playoff card
// (altiusapps/mobileapp-thelayout · src/components/fantasy/LeagueView.tsx).

import type { Matchup } from '@/lib/fantasy/leagues';

function stageLabel(stage: Matchup['stage']): string {
  if (stage === 'semifinal') return 'Semifinal';
  if (stage === 'final') return 'Final';
  if (stage === 'third') return 'Third Place';
  return '';
}

export function PlayoffBracket({
  matchups,
  standings,
}: {
  matchups: Matchup[];
  standings: { teamId: string; teamName: string }[];
}) {
  if (matchups.length === 0) return null;

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-5 space-y-4">
      {matchups.map((m) => (
        <PlayoffRow key={m.id} matchup={m} standings={standings} />
      ))}
    </div>
  );
}

function PlayoffRow({
  matchup,
  standings,
}: {
  matchup: Matchup;
  standings: { teamId: string; teamName: string }[];
}) {
  const homeTeam = standings.find((t) => t.teamId === matchup.homeTeamId);
  const awayTeam = matchup.awayTeamId ? standings.find((t) => t.teamId === matchup.awayTeamId) : null;
  const homeWon = matchup.winnerTeamId === matchup.homeTeamId;
  const awayWon = matchup.winnerTeamId != null && matchup.winnerTeamId === matchup.awayTeamId;

  return (
    <div>
      <span className="inline-flex items-center text-[9.5px] font-bold tracking-[0.1em] uppercase px-2.5 py-[4px] rounded-full bg-accent/10 text-accent mb-2">
        {stageLabel(matchup.stage)}
      </span>
      <div className="flex items-center justify-between gap-3 py-1.5">
        <span className="min-w-0 flex items-baseline gap-1.5">
          {matchup.homeSeed != null && (
            <span className="font-tight text-[11px] font-bold text-faint">#{matchup.homeSeed}</span>
          )}
          <span
            className={[
              'font-tight text-[13px] truncate',
              homeWon ? 'font-bold text-accent' : 'font-medium text-ink',
            ].join(' ')}
          >
            {homeTeam?.teamName ?? 'TBD'}
          </span>
        </span>
        <span className="font-tight text-[13px] font-bold tabular text-ink flex-shrink-0">
          {matchup.homePoints ?? '—'}
        </span>
      </div>
      <div className="font-tight text-[10px] text-faint text-center">vs</div>
      {matchup.awayTeamId ? (
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="min-w-0 flex items-baseline gap-1.5">
            {matchup.awaySeed != null && (
              <span className="font-tight text-[11px] font-bold text-faint">#{matchup.awaySeed}</span>
            )}
            <span
              className={[
                'font-tight text-[13px] truncate',
                awayWon ? 'font-bold text-accent' : 'font-medium text-ink',
              ].join(' ')}
            >
              {awayTeam?.teamName ?? 'TBD'}
            </span>
          </span>
          <span className="font-tight text-[13px] font-bold tabular text-ink flex-shrink-0">
            {matchup.awayPoints ?? '—'}
          </span>
        </div>
      ) : (
        <div className="py-1.5">
          <span className="font-tight text-[13px] text-faint">Bye</span>
        </div>
      )}
    </div>
  );
}

export default PlayoffBracket;
