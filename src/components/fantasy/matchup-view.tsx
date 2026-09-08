'use client';

// MatchupView — the "Match" tab body for h2h weekly-stats contests. Period
// switcher (‹ Week N ›) → my matchup card (two columns, W-L, period points,
// stage pill, bye state, winner accent) → slot-by-slot lineup comparison
// (UFA-only; getTeamWeekBreakdown per team, hidden on failure) → "Other
// matchups" list for the period. No matchups yet → empty state with a
// commissioner "Generate schedule" action. Web port of the mobile app's
// MatchupView.tsx (altiusapps/mobileapp-thelayout ·
// src/components/fantasy/MatchupView.tsx).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getContestPeriods,
  getMatchups,
  getH2HStandings,
  getMyContestTeam,
  getMyLeagueRole,
  generateSchedule,
  periodsToWeeks,
  type ContestView,
  type Matchup,
  type H2HStandingRow,
} from '@/lib/fantasy/leagues';
import { getTeamWeekBreakdown, type WeekBreakdown } from '@/lib/fantasy/data';
import { formatWeekLabel } from '@/lib/fantasy/weeks';
import type { FantasyWeek } from '@/lib/fantasy/weeks';
import { useAuth } from '@/lib/auth/auth-provider';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import { getProjections, projectedPoints, projectedTotal, projectionKey, winProbability } from '@/lib/fantasy/projections';
import type { ProjectionMap } from '@/lib/fantasy/projections';

function stageLabel(stage: Matchup['stage']): string | null {
  if (stage === 'semifinal') return 'Semifinal';
  if (stage === 'final') return 'Final';
  if (stage === 'third') return 'Third Place';
  return null;
}

export function MatchupView({ contest }: { contest: ContestView }) {
  const { user } = useAuth();

  const [weeks, setWeeks] = useState<FantasyWeek[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [standings, setStandings] = useState<H2HStandingRow[]>([]);
  const [myTeam, setMyTeam] = useState<{ id: string; teamName: string } | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [projections, setProjections] = useState<ProjectionMap | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getProjections(contest.id)
      .then((m) => !cancelled && setProjections(m))
      .catch(() => !cancelled && setProjections(undefined));
    return () => {
      cancelled = true;
    };
  }, [contest.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getContestPeriods(contest.id).catch(() => []),
      getMatchups(contest.id).catch(() => []),
      getH2HStandings(contest.id).catch(() => []),
      user ? getMyContestTeam(contest.id).catch(() => null) : Promise.resolve(null),
      contest.leagueId ? getMyLeagueRole(contest.leagueId).catch(() => null) : Promise.resolve(null),
    ]).then(([periods, m, s, team, role]) => {
      if (cancelled) return;
      setWeeks(periodsToWeeks(periods));
      setMatchups(m);
      setStandings(s);
      setMyTeam(team);
      setIsCommissioner(role === 'commissioner');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [contest.id, contest.leagueId, user]);

  const defaultPeriod = useMemo(() => {
    if (weeks.length === 0) return null;
    const nowMs = Date.now();
    const upcoming = weeks.find((w) => w.lockAt == null || new Date(w.lockAt).getTime() > nowMs);
    return (upcoming ?? weeks[weeks.length - 1]).week;
  }, [weeks]);

  const activePeriod = period ?? defaultPeriod;
  const periodIdx = weeks.findIndex((w) => w.week === activePeriod);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      await generateSchedule(contest.id);
      await revalidateFantasyLeague(contest.leagueId ?? undefined, contest.id).catch(() => null);
      const [m, s] = await Promise.all([getMatchups(contest.id), getH2HStandings(contest.id)]);
      setMatchups(m);
      setStandings(s);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Could not generate the schedule.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
        <div className="inline-block w-5 h-5 rounded-full border-2 border-ink/15 border-t-accent animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (matchups.length === 0) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-10 text-center space-y-4">
        <p className="text-muted font-tight text-[14px]">Matchups are generated when the draft completes.</p>
        {isCommissioner && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className={[
              'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full min-h-[44px]',
              'bg-accent text-accent-ink font-tight text-[12.5px] font-bold tracking-[0.06em] uppercase',
              'hover:opacity-90 transition-opacity duration-150 cursor-pointer disabled:opacity-60',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            ].join(' ')}
          >
            {generating ? 'Generating…' : 'Generate schedule'}
          </button>
        )}
        {genError && <p className="text-live font-tight text-[12px]">{genError}</p>}
      </div>
    );
  }

  const periodMatchups = activePeriod ? matchups.filter((m) => m.period === activePeriod) : [];
  const myMatchup = myTeam
    ? periodMatchups.find((m) => m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id)
    : undefined;
  const otherMatchups = periodMatchups.filter((m) => m.id !== myMatchup?.id);

  const teamName = (teamId: string | null): string =>
    (teamId && standings.find((s) => s.teamId === teamId)?.teamName) || 'TBD';
  const teamRecord = (teamId: string | null): string | null => {
    const row = teamId ? standings.find((s) => s.teamId === teamId) : null;
    if (!row) return null;
    return `${row.wins}-${row.losses}${row.ties > 0 ? `-${row.ties}` : ''}`;
  };

  const goPrev = () => periodIdx > 0 && setPeriod(weeks[periodIdx - 1].week);
  const goNext = () => periodIdx < weeks.length - 1 && setPeriod(weeks[periodIdx + 1].week);

  return (
    <div className="space-y-8">
      {/* ── Period switcher ────────────────────────────────────────────── */}
      {weeks.length > 0 && activePeriod && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={goPrev}
            disabled={periodIdx <= 0}
            aria-label="Previous week"
            className={[
              'w-10 h-10 flex items-center justify-center rounded-full',
              'text-ink hover:bg-ink/5 transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M8 3L4 7l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="font-tight text-[15px] font-bold text-ink min-w-[100px] text-center">
            {formatWeekLabel(activePeriod)}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={periodIdx >= weeks.length - 1}
            aria-label="Next week"
            className={[
              'w-10 h-10 flex items-center justify-center rounded-full',
              'text-ink hover:bg-ink/5 transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M6 3l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {/* ── My matchup ──────────────────────────────────────────────────── */}
      {myMatchup && (
        <MyMatchupCard
          contestId={contest.id}
          matchup={myMatchup}
          myTeamId={myTeam!.id}
          teamName={teamName}
          teamRecord={teamRecord}
          period={activePeriod}
          seasonYear={contest.seasonYear}
          isUfa={contest.competitionDef.playerLeague === 'ufa'}
          playerLeague={contest.competitionDef.playerLeague}
          projections={projections}
        />
      )}

      {/* ── Other matchups ─────────────────────────────────────────────── */}
      {otherMatchups.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-3">
            Other matchups
          </h2>
          <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
            {otherMatchups.map((m, idx) => {
              const homeWon = m.winnerTeamId === m.homeTeamId;
              const awayWon = m.winnerTeamId != null && m.winnerTeamId === m.awayTeamId;
              return (
                <div
                  key={m.id}
                  className={[
                    'flex items-center gap-3 px-5 py-3.5',
                    idx > 0 ? 'border-t border-hairline' : '',
                  ].join(' ')}
                >
                  <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                    <span
                      className={[
                        'font-tight text-[13px] truncate',
                        homeWon ? 'font-bold text-accent' : 'text-ink',
                      ].join(' ')}
                    >
                      {teamName(m.homeTeamId)}
                    </span>
                    <span className="font-tight text-[13px] font-bold tabular text-ink flex-shrink-0">
                      {m.homePoints ?? '—'}
                    </span>
                  </span>
                  <span className="font-tight text-[10px] text-faint flex-shrink-0">vs</span>
                  <span className="flex-1 min-w-0 flex items-baseline gap-1.5 justify-end">
                    {m.awayTeamId && (
                      <span className="font-tight text-[13px] font-bold tabular text-ink flex-shrink-0">
                        {m.awayPoints ?? '—'}
                      </span>
                    )}
                    <span
                      className={[
                        'font-tight text-[13px] truncate',
                        awayWon ? 'font-bold text-accent' : 'text-ink',
                      ].join(' ')}
                    >
                      {m.awayTeamId ? teamName(m.awayTeamId) : 'Bye'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── My matchup card + slot comparison ─────────────────────────────────────

function MyMatchupCard({
  contestId,
  matchup,
  myTeamId,
  teamName,
  teamRecord,
  period,
  seasonYear,
  isUfa,
  playerLeague,
  projections,
}: {
  contestId: string;
  matchup: Matchup;
  myTeamId: string;
  teamName: (id: string | null) => string;
  teamRecord: (id: string | null) => string | null;
  period: string | null;
  seasonYear: number;
  isUfa: boolean;
  playerLeague: string;
  projections: ProjectionMap | undefined;
}) {
  const isHome = matchup.homeTeamId === myTeamId;
  const myId = myTeamId;
  const oppId = isHome ? matchup.awayTeamId : matchup.homeTeamId;
  const myPts = isHome ? matchup.homePoints : matchup.awayPoints;
  const oppPts = isHome ? matchup.awayPoints : matchup.homePoints;
  const isBye = !matchup.awayTeamId;
  const iWon = matchup.winnerTeamId === myId;
  const oppWon = matchup.winnerTeamId != null && matchup.winnerTeamId === oppId;
  const stage = stageLabel(matchup.stage);
  const showProjections = !isBye && oppId && isUfa && period && !matchup.scored && Boolean(projections);

  const [breakdown, setBreakdown] = useState<[WeekBreakdown, WeekBreakdown] | null>(null);
  const [breakdownFailed, setBreakdownFailed] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(true);

  useEffect(() => {
    if (isBye || !oppId || !isUfa || !period) {
      setBreakdown(null);
      return;
    }
    let cancelled = false;
    setBreakdownLoading(true);
    setBreakdownFailed(false);
    Promise.all([
      getTeamWeekBreakdown(myId, period, seasonYear),
      getTeamWeekBreakdown(oppId, period, seasonYear),
    ])
      .then(([mine, theirs]) => {
        if (cancelled) return;
        setBreakdown([mine, theirs]);
      })
      .catch(() => {
        if (!cancelled) setBreakdownFailed(true);
      })
      .finally(() => {
        if (!cancelled) setBreakdownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBye, myId, oppId, isUfa, period, seasonYear]);

  let myProjTotal: number | null = null;
  let oppProjTotal: number | null = null;
  let winPct: number | null = null;
  if (showProjections && projections && breakdown) {
    const [mine, theirs] = breakdown;
    myProjTotal = mine.players.length
      ? projectedTotal(mine.players.map((p) => ({ playerLeague, playerId: p.playerId, role: p.role })), projections)
      : null;
    oppProjTotal = theirs.players.length
      ? projectedTotal(theirs.players.map((p) => ({ playerLeague, playerId: p.playerId, role: p.role })), projections)
      : null;
    if (myProjTotal != null && oppProjTotal != null) winPct = winProbability(myProjTotal, oppProjTotal);
  }

  return (
    <div>
      <div className="bg-surface rounded-card-lg shadow-card p-6 lg:p-8">
        {stage && (
          <span className="inline-flex items-center text-[9.5px] font-bold tracking-[0.1em] uppercase px-2.5 py-[4px] rounded-full bg-accent/10 text-accent mb-3">
            {stage}
          </span>
        )}
        {isBye ? (
          <p className="text-center font-tight text-[14px] text-faint py-3">Bye week</p>
        ) : (
          <div className="flex items-center">
            <MatchupTeamCol
              contestId={contestId}
              teamId={myId}
              name={teamName(myId)}
              record={teamRecord(myId)}
              pts={myPts}
              won={iWon}
              align="left"
              projLabel={showProjections ? (myProjTotal != null ? `Proj ${myProjTotal}${winPct != null ? ` · ${winPct}% win` : ''}` : 'Proj —') : null}
            />
            <div className="px-4 flex-shrink-0">
              <span className="font-tight text-[11px] font-bold text-faint">VS</span>
            </div>
            <MatchupTeamCol
              contestId={contestId}
              teamId={oppId}
              name={teamName(oppId)}
              record={teamRecord(oppId)}
              pts={oppPts}
              won={oppWon}
              align="right"
              projLabel={showProjections ? (oppProjTotal != null ? `Proj ${oppProjTotal}` : 'Proj —') : null}
            />
          </div>
        )}
      </div>

      {!isBye && oppId && isUfa && period && (
        <SlotComparison
          breakdown={breakdown}
          loading={breakdownLoading}
          failed={breakdownFailed}
          playerLeague={playerLeague}
          projections={showProjections ? projections : undefined}
        />
      )}
    </div>
  );
}

function MatchupTeamCol({
  contestId,
  teamId,
  name,
  record,
  pts,
  won,
  align,
  projLabel,
}: {
  contestId: string;
  teamId: string | null;
  name: string;
  record: string | null;
  pts: number | null;
  won: boolean;
  align: 'left' | 'right';
  projLabel?: string | null;
}) {
  const content = (
    <div className={`flex-1 min-w-0 flex flex-col gap-1 ${align === 'left' ? 'items-start' : 'items-end'}`}>
      <span className={['font-tight text-[15px] font-bold truncate max-w-full', won ? 'text-accent' : 'text-ink'].join(' ')}>
        {name}
      </span>
      {record && <span className="font-tight text-[11px] text-faint">{record}</span>}
      <span className="font-tight text-[30px] font-bold tabular text-ink mt-1">{pts ?? '—'}</span>
      {projLabel && <span className="font-tight text-[11px] text-faint tabular">{projLabel}</span>}
    </div>
  );
  if (!teamId) return content;
  return (
    <Link href={`/fantasy/l/${contestId}/t/${teamId}`} className="flex-1 min-w-0 no-underline hover:opacity-80 transition-opacity duration-150">
      {content}
    </Link>
  );
}

function SlotComparison({
  breakdown,
  loading,
  failed,
  playerLeague,
  projections,
}: {
  breakdown: [WeekBreakdown, WeekBreakdown] | null;
  loading: boolean;
  failed: boolean;
  playerLeague: string;
  projections: ProjectionMap | undefined;
}) {
  if (failed) return null; // UFA-only breakdown; hide the section on failure
  if (loading) {
    return (
      <div className="mt-4 bg-surface rounded-card-lg shadow-card p-6 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-ink/15 border-t-accent animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (!breakdown) return null;
  const [mine, theirs] = breakdown;
  if (mine.players.length === 0 && theirs.players.length === 0) return null;

  const maxLen = Math.max(mine.players.length, theirs.players.length);
  const rows = Array.from({ length: maxLen }, (_, i) => ({
    mine: mine.players[i] ?? null,
    theirs: theirs.players[i] ?? null,
  }));

  const slotProj = (p: WeekBreakdown['players'][number] | null): number | null => {
    if (!projections || !p) return null;
    return projectedPoints(projections.get(projectionKey(playerLeague, p.playerId)), p.role);
  };

  return (
    <div className="mt-5">
      <h2 className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-3">
        Lineup comparison
      </h2>
      <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
        {rows.map((row, idx) => {
          const myProj = slotProj(row.mine);
          const theirProj = slotProj(row.theirs);
          return (
            <div
              key={idx}
              className={['flex items-center gap-2 px-4 py-2.5', idx > 0 ? 'border-t border-hairline' : ''].join(' ')}
            >
              <SlotSide player={row.mine} align="left" projPoints={myProj} />
              <span className="font-tight text-[13px] font-bold text-ink w-7 text-center flex-shrink-0">
                {row.mine ? row.mine.points : ''}
              </span>
              <span className="text-faint text-[10px] flex-shrink-0">|</span>
              <span className="font-tight text-[13px] font-bold text-ink w-7 text-center flex-shrink-0">
                {row.theirs ? row.theirs.points : ''}
              </span>
              <SlotSide player={row.theirs} align="right" projPoints={theirProj} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlotSide({
  player,
  align,
  projPoints,
}: {
  player: WeekBreakdown['players'][number] | null;
  align: 'left' | 'right';
  projPoints?: number | null;
}) {
  if (!player) return <div className="flex-1 min-w-0" />;
  const roleLabel = player.role === 'offender' ? 'O' : 'D';
  const nameRow = (
    <>
      {align === 'left' && (
        <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-ink/[0.05] text-[8.5px] font-bold flex items-center justify-center font-tight text-ink">
          {roleLabel}
        </span>
      )}
      <Link
        href={`/players/${player.playerId}`}
        prefetch={false}
        className="min-w-0 font-tight text-[12.5px] font-medium text-ink truncate hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:underline"
      >
        {player.fullName}
        {player.gamesPlayed === 0 && <span className="text-faint"> · DNP</span>}
      </Link>
      {align === 'right' && (
        <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-ink/[0.05] text-[8.5px] font-bold flex items-center justify-center font-tight text-ink">
          {roleLabel}
        </span>
      )}
    </>
  );
  return (
    <div className={`flex-1 min-w-0 flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start'}`}>
      <div className={`flex items-center gap-1.5 min-w-0 w-full ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {nameRow}
      </div>
      {projPoints != null && (
        <span className={`font-tight text-[10px] text-faint tabular ${align === 'right' ? 'pr-[24px]' : 'pl-[24px]'}`}>
          proj {projPoints}
        </span>
      )}
    </div>
  );
}

export default MatchupView;
