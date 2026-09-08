'use client';

// TradesPanel — the Trades route body. Sections, newest-relevant first:
// "Needs your response" (proposed, I'm receiver) → "Pending review"
// (accepted) → "Open" (proposed by me) → "History" (executed/rejected/
// cancelled/vetoed). Header "Propose trade" button opens
// ProposeTradeDialog. Web port of the mobile app's TradesScreen.tsx
// (altiusapps/mobileapp-thelayout ·
// src/components/fantasy/trades/TradesScreen.tsx).

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  getTrades,
  getContestStandings,
  getMyContestTeam,
  getMyLeagueRole,
  type ContestView,
  type Trade,
} from '@/lib/fantasy/leagues';
import { TradeCard } from './trade-card';
import { ProposeTradeDialog } from './propose-trade-dialog';

export function TradesPanel({ contest }: { contest: ContestView }) {
  const { user } = useAuth();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [standings, setStandings] = useState<{ teamId: string; teamName: string }[]>([]);
  const [myTeam, setMyTeam] = useState<{ id: string; teamName: string } | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [proposeOpen, setProposeOpen] = useState(false);

  const refresh = async () => {
    const [t, s] = await Promise.all([
      getTrades(contest.id).catch(() => []),
      getContestStandings(contest.id).catch(() => []),
    ]);
    setTrades(t);
    setStandings(s.map((row) => ({ teamId: row.teamId, teamName: row.teamName })));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getTrades(contest.id).catch(() => []),
      getContestStandings(contest.id).catch(() => []),
    ]).then(([t, s]) => {
      if (cancelled) return;
      setTrades(t);
      setStandings(s.map((row) => ({ teamId: row.teamId, teamName: row.teamName })));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [contest.id]);

  useEffect(() => {
    if (!user) {
      setMyTeam(null);
      setIsCommissioner(false);
      return;
    }
    let cancelled = false;
    getMyContestTeam(contest.id)
      .then((t) => !cancelled && setMyTeam(t))
      .catch(() => !cancelled && setMyTeam(null));
    if (contest.leagueId) {
      getMyLeagueRole(contest.leagueId)
        .then((role) => !cancelled && setIsCommissioner(role === 'commissioner'))
        .catch(() => !cancelled && setIsCommissioner(false));
    }
    return () => {
      cancelled = true;
    };
  }, [user, contest.id, contest.leagueId]);

  const teamById = new Map(standings.map((s) => [s.teamId, s]));

  const needsResponse = trades.filter((t) => t.status === 'proposed' && myTeam && t.receiverTeamId === myTeam.id);
  const pendingReview = trades.filter((t) => t.status === 'accepted');
  const open = trades.filter((t) => t.status === 'proposed' && (!myTeam || t.receiverTeamId !== myTeam.id));
  const history = trades.filter((t) => ['executed', 'rejected', 'cancelled', 'vetoed'].includes(t.status));
  const hasAny = needsResponse.length + pendingReview.length + open.length + history.length > 0;

  const otherTeams = myTeam ? standings.filter((s) => s.teamId !== myTeam.id) : [];

  const renderSection = (title: string, rows: Trade[]) => {
    if (rows.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        <h3 className="font-tight text-[11px] font-bold tracking-[0.16em] uppercase text-muted">{title}</h3>
        <div className="flex flex-col gap-3">
          {rows.map((trade) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              proposerTeam={teamById.get(trade.proposerTeamId) ?? null}
              receiverTeam={teamById.get(trade.receiverTeamId) ?? null}
              myTeamId={myTeam?.id ?? null}
              isCommissioner={isCommissioner}
              onChanged={refresh}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="m-0 font-display italic text-[26px] lg:text-[30px] font-bold tracking-[-0.02em] leading-[0.95] text-ink">
          Trades
        </h2>
        {myTeam && otherTeams.length > 0 && (
          <button
            type="button"
            onClick={() => setProposeOpen(true)}
            className={[
              'px-4 py-2 rounded-full min-h-[36px]',
              'bg-accent text-accent-ink font-tight text-[11.5px] font-bold tracking-[0.04em] uppercase',
              'hover:opacity-90 transition-opacity duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            Propose trade
          </button>
        )}
      </div>

      {!myTeam ? (
        <div className="bg-surface rounded-card-lg shadow-card py-8 text-center">
          <p className="font-tight text-[14px] text-muted">Build a team to start trading.</p>
        </div>
      ) : loading ? (
        <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
          <div className="inline-block w-5 h-5 rounded-full border-2 border-ink/15 border-t-accent animate-spin" aria-hidden="true" />
        </div>
      ) : !hasAny ? (
        <div className="bg-surface rounded-card-lg shadow-card py-8 text-center">
          <p className="font-tight text-[14px] text-muted">No trades yet. Propose one to get started.</p>
        </div>
      ) : (
        <>
          {renderSection('Needs your response', needsResponse)}
          {renderSection('Pending review', pendingReview)}
          {renderSection('Open', open)}
          {renderSection('History', history)}
        </>
      )}

      {proposeOpen && myTeam && (
        <ProposeTradeDialog
          contest={contest}
          myTeam={{ teamId: myTeam.id, teamName: myTeam.teamName }}
          otherTeams={otherTeams}
          onClose={() => setProposeOpen(false)}
          onDone={async () => {
            setProposeOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

export default TradesPanel;
