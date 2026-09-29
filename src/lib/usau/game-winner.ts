// Winner of a USAU game, shared by server readers and client components (no
// data-layer imports, so client bundles can use it).
//
// The scores decide it when both are set and differ. Otherwise the forfeit
// winner decides it: usau_games.winner_team_id, set only when USAU printed the
// result as W/F letters (scores stay null). A forfeit counts as a win/loss with
// a 0 point differential — USAU's own tiebreak math (2026 SC Men 9th-12th Pool
// A only adds up that way). Mobile matches these semantics.

type GameLike = {
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerTeamId?: string | null;
};

export function isForfeit(g: GameLike): boolean {
  return (
    g.scoreA == null &&
    g.scoreB == null &&
    !!g.winnerTeamId &&
    (g.winnerTeamId === g.teamAId || g.winnerTeamId === g.teamBId)
  );
}

export function gameWinnerId(g: GameLike): string | null {
  if (g.scoreA != null && g.scoreB != null && g.scoreA !== g.scoreB) {
    return g.scoreA > g.scoreB ? g.teamAId : g.teamBId;
  }
  return isForfeit(g) ? g.winnerTeamId! : null;
}
